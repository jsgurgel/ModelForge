/*
 * ModelForge
 * Copyright (C) 2026 Jairo dos Santos Gurgel
 *
 * Este programa é software livre: você pode redistribuí-lo e/ou modificá-lo
 * sob os termos da GNU Affero General Public License, conforme publicada pela
 * Free Software Foundation, na versão 3 da Licença ou (a seu critério) qualquer
 * versão posterior.
 *
 * Este programa é distribuído na esperança de que seja útil, mas SEM QUALQUER
 * GARANTIA; sem mesmo a garantia implícita de COMERCIABILIDADE ou ADEQUAÇÃO A
 * UM PROPÓSITO ESPECÍFICO. Consulte a GNU AGPL para mais detalhes.
 *
 * Você deve ter recebido uma cópia da GNU AGPL junto com este programa. Caso
 * contrário, veja <https://www.gnu.org/licenses/>.
 */

import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { importarDdlConceitual } from '../geradores/importador-conceitual';
import { importarDdlLogico } from '../geradores/importador';
import { Diagrama } from '../modelo/tipos';
import { validarDiagrama } from '../modelo/validacao';
import { abrirConexao } from './dialetos';
import { sqliteDisponivel } from './dialetos/sqlite';
import {
  gerarDdlDeObjeto, gerarDdlDoSchema, gerarDdlSelecionados, gerarFksQueApontamPara, introspeccionarEstruturado,
} from './ddl-banco';
import { ConexoesService } from './conexoes.service';
import { gerarScriptMigracao } from './migracao';
import {
  colecoesParaFormas, gerarScriptMongosh, introspeccionarNoSql, listarColecoes,
} from './nosql';
import { LIMITES, hostsPermitidos, mensagemSegura, validarParamsSql } from './seguranca';
import { executarScript } from './sql-exec';
import { consultarDados, duplicarLinha, excluirLinha, inserirLinha, atualizarLinha, validarColunas, validarIdentificador } from './dados';
import { Conexao, ParamsConexao, TIPOS_BANCO, TipoObjeto } from './tipos';
import { lerCatalogo } from './catalogo';

const TIPOS_OBJETO: TipoObjeto[] = ['TABELA', 'VIEW', 'VIEW_MATERIALIZADA', 'SEQUENCIA', 'ROTINA'];
const MAX_TABELAS_COM_COLUNAS = 300;

const texto = (v: unknown, campo: string): string => {
  if (v == null) return '';
  if (typeof v !== 'string' || v.length > 512) throw new BadRequestException(`${campo} inválido`);
  return v;
};

@Controller('bancos')
export class BancosController {
  constructor(private readonly conexoes: ConexoesService) {}

  /** Abre a conexão, roda `fn` e SEMPRE fecha. Erros de driver viram 400 com mensagem sem segredos. */
  private async comConexao<T>(bruto: unknown, fn: (c: Conexao, p: ParamsConexao, schema: string) => Promise<T>): Promise<T> {
    const { params, schema } = await this.conexoes.resolverSql(bruto);
    let con: Conexao | undefined;
    try {
      con = await abrirConexao(params);
      return await fn(con, params, schema);
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(mensagemSegura(e, [params.senha]));
    } finally {
      await con?.fechar();
    }
  }

  // ---- metadados ----
  @Get('tipos')
  tipos() {
    return {
      tipos: (Object.keys(TIPOS_BANCO) as (keyof typeof TIPOS_BANCO)[]).map((id) => ({
        id, ...TIPOS_BANCO[id], disponivel: id !== 'sqlite' || sqliteDisponivel(),
      })),
      limites: { maxLinhas: LIMITES.maxLinhas, maxLinhasAbsoluto: LIMITES.maxLinhasAbsoluto, timeoutConsultaMs: LIMITES.timeoutConsultaMs },
      hostsRestritos: hostsPermitidos().length > 0,
    };
  }

  // ---- conexões salvas ----
  @Get('conexoes')
  listarConexoes() {
    return this.conexoes.listar();
  }

  @Post('conexoes/sql')
  salvarSql(@Body() corpo: Record<string, unknown>) {
    return this.conexoes.salvarSql(corpo ?? {});
  }

  @Post('conexoes/nosql')
  salvarNoSql(@Body() corpo: Record<string, unknown>) {
    return this.conexoes.salvarNoSql(corpo ?? {});
  }

  @Delete('conexoes/:id')
  @HttpCode(204)
  async removerConexao(@Param('id') id: string) {
    await this.conexoes.remover(id);
  }

  // ---- SQL: teste e explorador ----
  @Post('testar')
  async testar(@Body() corpo: { conexao?: unknown }) {
    const { params } = await this.conexoes.resolverSql(corpo?.conexao);
    let con: Conexao | undefined;
    try {
      con = await abrirConexao(params);
      const schemas = con.usaSchema ? await con.schemas() : [];
      return { ok: true, schemas };
    } catch (e) {
      return { ok: false, erro: mensagemSegura(e, [params.senha]), schemas: [] as string[] };
    } finally {
      await con?.fechar();
    }
  }

  @Post('schemas')
  schemas(@Body() corpo: { conexao?: unknown }) {
    return this.comConexao(corpo?.conexao, async (c) => ({ schemas: await c.schemas() }));
  }

  /** Tabelas, views, sequences e rotinas do schema; tabelas e views já vêm com as colunas (para arrastar sem nova ida ao servidor). */
  @Post('objetos')
  objetos(@Body() corpo: { conexao?: unknown; schema?: unknown; colunas?: unknown }) {
    const schema = texto(corpo?.schema, 'schema');
    return this.comConexao(corpo?.conexao, async (c, _p, schemaSalvo) => {
      const sc = c.usaSchema ? schema || schemaSalvo || null : null;
      const itens = await c.objetos(sc);
      const comColunas = corpo?.colunas !== false && itens.length <= MAX_TABELAS_COM_COLUNAS;
      const tabelas = [];
      for (const o of itens) {
        let colunas;
        if (comColunas) {
          const pks = new Set((o.tipo === 'TABELA' ? await c.chavePrimaria(sc, o.nome) : []).map((x) => x.toLowerCase()));
          colunas = (await c.colunas(sc, o.nome)).map((k) => ({ ...k, chavePrimaria: pks.has(k.nome.toLowerCase()) }));
        }
        tabelas.push({ ...o, colunas });
      }
      const seg = async <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);
      return { schema: sc ?? '', objetos: tabelas, sequencias: await seg(c.sequencias(sc)), rotinas: await seg(c.rotinasNomes(sc)), colunasCarregadas: comColunas };
    });
  }

  @Post('colunas')
  colunas(@Body() corpo: { conexao?: unknown; schema?: unknown; objeto?: unknown }) {
    const objeto = texto(corpo?.objeto, 'objeto');
    if (!objeto) throw new BadRequestException('informe o objeto');
    return this.comConexao(corpo?.conexao, async (c) => {
      const sc = c.usaSchema ? texto(corpo?.schema, 'schema') || null : null;
      const pks = new Set((await c.chavePrimaria(sc, objeto)).map((x) => x.toLowerCase()));
      return { colunas: (await c.colunas(sc, objeto)).map((k) => ({ ...k, chavePrimaria: pks.has(k.nome.toLowerCase()) })) };
    });
  }

  /** Detalhe de um objeto: DDL, constraints (PK/FK), índices e gatilhos. */
  @Post('detalhes')
  detalhes(@Body() corpo: { conexao?: unknown; schema?: unknown; objeto?: unknown; tipo?: unknown }) {
    const objeto = texto(corpo?.objeto, 'objeto');
    const tipo = (corpo?.tipo ?? 'TABELA') as TipoObjeto;
    if (!objeto || !TIPOS_OBJETO.includes(tipo)) throw new BadRequestException('informe o objeto e um tipo válido');
    return this.comConexao(corpo?.conexao, async (c) => {
      const sc = c.usaSchema ? texto(corpo?.schema, 'schema') || null : null;
      const avisos: string[] = [];
      const ddl = await gerarDdlDeObjeto(c, sc, objeto, tipo, { avisos });
      if (tipo !== 'TABELA') return { ddl, avisos, chavePrimaria: [], fks: [], fksExportadas: [], indices: [] };
      return {
        ddl, avisos,
        chavePrimaria: await c.chavePrimaria(sc, objeto),
        fks: await c.fksImportadas(sc, objeto),
        fksExportadas: await c.fksExportadas(sc, objeto),
        indices: await c.indices(sc, objeto),
      };
    });
  }

  /** Catálogo plano para autocomplete do SQL Studio (schemas, tabelas, views, colunas, rotinas). */
  @Post('catalogo')
  catalogo(@Body() corpo: { conexao?: unknown; schema?: unknown }) {
    return this.comConexao(corpo?.conexao, async (c, _p, schemaSalvo) => {
      const sc = c.usaSchema ? texto(corpo?.schema, 'schema') || schemaSalvo || '' : '';
      return lerCatalogo(c, sc);
    });
  }

  // ---- importar ----
  /** Importa o schema inteiro (ou só `selecao`: tabelas/views) como Lógico e/ou Conceitual, pelo mesmo importador do "Importar DDL". */
  @Post('importar')
  importar(@Body() corpo: { conexao?: unknown; schema?: unknown; selecao?: unknown; modo?: unknown; nome?: unknown }) {
    const modo = corpo?.modo ?? 'logico';
    if (modo !== 'logico' && modo !== 'conceitual' && modo !== 'ambos') throw new BadRequestException("modo deve ser 'logico', 'conceitual' ou 'ambos'");
    const nome = texto(corpo?.nome, 'nome') || undefined;
    return this.comConexao(corpo?.conexao, async (c, _p, schemaSalvo) => {
      const avisosCatalogo: string[] = [];
      let ddl: string;
      if (Array.isArray(corpo?.selecao) && corpo.selecao.length) {
        if (corpo.selecao.length > 1000) throw new BadRequestException('seleção grande demais');
        const sel = corpo.selecao.map((x: any) => {
          if (!x || typeof x.nome !== 'string' || !TIPOS_OBJETO.includes(x.tipo)) throw new BadRequestException('seleção inválida');
          return { schema: c.usaSchema ? texto(x.schema, 'schema') || null : null, nome: x.nome as string, tipo: x.tipo as TipoObjeto };
        });
        ddl = await gerarDdlSelecionados(c, sel, { avisos: avisosCatalogo });
      } else {
        const schema = texto(corpo?.schema, 'schema') || schemaSalvo;
        ddl = await gerarDdlDoSchema(c, schema, { avisos: avisosCatalogo });
      }
      if (!ddl.trim()) throw new BadRequestException(texto(corpo?.schema, 'schema') ? 'Nenhuma tabela encontrada no schema informado.' : 'Nenhuma tabela encontrada no banco.');
      const r: Record<string, unknown> = { ddl, avisosCatalogo };
      if (modo !== 'conceitual') r.logico = importarDdlLogico(ddl, nome);
      if (modo !== 'logico') r.conceitual = importarDdlConceitual(ddl, nome);
      return r;
    });
  }

  /**
   * Arrastar um objeto do explorador: DDL do objeto + FKs de outras tabelas que apontam para ele (só as de
   * `tabelasNoDiagrama`, em minúsculas ou não), pronto para o importador. Devolve o fragmento de modelo.
   */
  @Post('objeto')
  objeto(@Body() corpo: { conexao?: unknown; schema?: unknown; objeto?: unknown; tipo?: unknown; tabelasNoDiagrama?: unknown; modo?: unknown }) {
    const objeto = texto(corpo?.objeto, 'objeto');
    const tipo = (corpo?.tipo ?? 'TABELA') as TipoObjeto;
    if (!objeto || !TIPOS_OBJETO.includes(tipo)) throw new BadRequestException('informe o objeto e um tipo válido');
    const modo = corpo?.modo === 'conceitual' ? 'conceitual' : 'logico';
    if (modo === 'conceitual' && tipo !== 'TABELA') throw new BadRequestException('só tabelas podem ser soltas no diagrama Conceitual');
    const nomes = Array.isArray(corpo?.tabelasNoDiagrama) ? corpo.tabelasNoDiagrama : [];
    if (nomes.length > 5000 || nomes.some((n) => typeof n !== 'string')) throw new BadRequestException('tabelasNoDiagrama deve ser uma lista de textos');
    return this.comConexao(corpo?.conexao, async (c) => {
      const sc = c.usaSchema ? texto(corpo?.schema, 'schema') || null : null;
      const avisos: string[] = [];
      let ddl = await gerarDdlDeObjeto(c, sc, objeto, tipo, { avisos });
      if (tipo === 'TABELA') ddl += '\n' + (await gerarFksQueApontamPara(c, sc, objeto, new Set((nomes as string[]).map((n) => n.toLowerCase()))));
      const imp = modo === 'logico' ? importarDdlLogico(ddl) : importarDdlConceitual(ddl);
      return { ddl, avisosCatalogo: avisos, ...imp };
    });
  }

  // ---- migração e execução ----
  @Post('migracao')
  migracao(@Body() corpo: { conexao?: unknown; schema?: unknown; diagrama?: unknown }) {
    const erros = validarDiagrama(corpo?.diagrama);
    if (erros.length) throw new BadRequestException(erros);
    const d = corpo.diagrama as Diagrama;
    if (d.tipo !== 'logico') throw new BadRequestException('esta operação só existe para o diagrama Lógico');
    return this.comConexao(corpo?.conexao, async (c, p, schemaSalvo) => {
      const schema = texto(corpo?.schema, 'schema') || schemaSalvo;
      const tabelas = await introspeccionarEstruturado(c, schema);
      return { texto: gerarScriptMigracao(d, tabelas, p.database) };
    });
  }

  /**
   * Executa SQL. ("Você tem certeza que deseja executar o comando fornecido? Essa alteração não
   * poderá ser desfeita."), exige `confirmar: true`. Parametrizado: `params` (um comando) ou `paramsPorComando`
   * (lista de listas), sempre textos.
   */
  @Post('executar')
  async executar(@Body() corpo: { conexao?: unknown; sql?: unknown; params?: unknown; paramsPorComando?: unknown; confirmar?: unknown; limite?: unknown; continuarNoErro?: unknown }) {
    if (typeof corpo?.sql !== 'string' || !corpo.sql.trim()) throw new BadRequestException('informe o comando SQL');
    if (corpo.sql.length > LIMITES.maxSql) throw new BadRequestException('script grande demais');
    if (corpo.confirmar !== true) {
      throw new BadRequestException({ message: 'Confirme a execução: essa alteração não poderá ser desfeita.', codigo: 'CONFIRMACAO_NECESSARIA' });
    }
    let porComando: string[][] | undefined;
    if (corpo.paramsPorComando != null) {
      if (!Array.isArray(corpo.paramsPorComando) || corpo.paramsPorComando.length > LIMITES.maxComandos) throw new BadRequestException('paramsPorComando inválido');
      porComando = corpo.paramsPorComando.map(validarParamsSql);
    }
    const params = validarParamsSql(corpo.params);
    const limite = corpo.limite == null ? undefined : Number(corpo.limite);
    if (limite !== undefined && (!Number.isFinite(limite) || limite < 1)) throw new BadRequestException('limite inválido');
    return this.comConexao(corpo?.conexao, async (c, p) => {
      const sql = corpo.sql as string;
      if (params.length) {
        //# Lista simples de parâmetros vale para um comando só; com vários, o chamador diz qual é de qual.
        const { dividirComandos } = await import('./sql-exec');
        if (dividirComandos(sql, c.tipo).length > 1) throw new BadRequestException('com vários comandos use paramsPorComando');
        porComando = [params];
      }
      const r = await executarScript(c, sql, { paramsPorComando: porComando, limiteLinhas: limite, continuarNoErro: corpo.continuarNoErro === true, segredos: [p.senha] });
      if (r.total > LIMITES.maxComandos) throw new BadRequestException('comandos demais no script');
      return r;
    });
  }

  // ---- Data Grid (consulta paginada e CRUD por PK) ----

  /** Linhas de uma tabela com filtro textual, ordenação e paginação. */
  @Post('dados')
  dados(@Body() corpo: { conexao?: unknown; schema?: unknown; tabela?: unknown; filtro?: unknown; ordenar?: unknown; pagina?: unknown; porPagina?: unknown }) {
    const tabela = validarIdentificador(texto(corpo?.tabela, 'tabela'), 'tabela');
    const porPagina = Number(corpo?.porPagina) > 0 ? Math.min(500, Number(corpo?.porPagina)) : 50;
    const pagina = Number(corpo?.pagina) >= 0 ? Math.floor(Number(corpo?.pagina)) : 0;
    if (!Array.isArray(corpo?.filtro) && corpo?.filtro != null) throw new BadRequestException('filtro inválido');
    const filtroBruto = (corpo?.filtro ?? []) as { coluna?: unknown; valor?: unknown }[];
    const filtro = filtroBruto
      .filter((f) => f && typeof f.coluna === 'string' && typeof f.valor === 'string' && f.valor.trim() !== '')
      .slice(0, 10)
      .map((f) => ({ coluna: validarIdentificador(f.coluna as string, 'coluna do filtro'), valor: (f.valor as string).slice(0, 200) }));
    if (!Array.isArray(corpo?.ordenar) && corpo?.ordenar != null) throw new BadRequestException('ordenar inválido');
    const ordenarBruto = (corpo?.ordenar ?? []) as { coluna?: unknown; desc?: unknown }[];
    const ordenar = ordenarBruto
      .filter((x) => x && typeof x.coluna === 'string')
      .slice(0, 5)
      .map((x) => ({ coluna: validarIdentificador(x.coluna as string, 'coluna de ordenação'), desc: x.desc === true }));
    return this.comConexao(corpo?.conexao, async (c, _p, schemaSalvo) => {
      const schema = c.usaSchema ? texto(corpo?.schema, 'schema') || schemaSalvo || '' : '';
      const alvo = schema ? `${schema}.${tabela}` : tabela;
      return consultarDados(c, { tabela: alvo, filtro, ordenar, pagina, porPagina });
    });
  }

  /** UPDATE de uma linha pela PK. `valores` na ordem de `colunas`; `pkValores` na ordem de `pk`. */
  @Post('dados/atualizar')
  dadosAtualizar(@Body() corpo: { conexao?: unknown; schema?: unknown; tabela?: unknown; colunas?: unknown; pk?: unknown; valores?: unknown; pkValores?: unknown }) {
    const tabela = validarIdentificador(texto(corpo?.tabela, 'tabela'), 'tabela');
    const colunas = validarColunas((corpo?.colunas ?? []) as string[], 'colunas');
    const pk = validarColunas((corpo?.pk ?? []) as string[], 'pk');
    const valores = validarParamsSql(corpo?.valores);
    const pkValores = validarParamsSql(corpo?.pkValores);
    if (valores.length !== colunas.length) throw new BadRequestException('valores não correspondem às colunas');
    if (pkValores.length !== pk.length) throw new BadRequestException('pkValores não correspondem à pk');
    return this.comConexao(corpo?.conexao, async (c, p, schemaSalvo) => {
      const schema = c.usaSchema ? texto(corpo?.schema, 'schema') || schemaSalvo || '' : '';
      const alvo = schema ? `${schema}.${tabela}` : tabela;
      const r = await atualizarLinha(c, alvo, colunas, pk, valores, pkValores, [p.senha]);
      if (r.erro) throw new BadRequestException(r.erro);
      return { ok: true, afetadas: r.afetadas };
    });
  }

  /** DELETE de uma linha pela PK. */
  @Post('dados/excluir')
  dadosExcluir(@Body() corpo: { conexao?: unknown; schema?: unknown; tabela?: unknown; pk?: unknown; pkValores?: unknown }) {
    const tabela = validarIdentificador(texto(corpo?.tabela, 'tabela'), 'tabela');
    const pk = validarColunas((corpo?.pk ?? []) as string[], 'pk');
    const pkValores = validarParamsSql(corpo?.pkValores);
    if (pkValores.length !== pk.length) throw new BadRequestException('pkValores não correspondem à pk');
    return this.comConexao(corpo?.conexao, async (c, p, schemaSalvo) => {
      const schema = c.usaSchema ? texto(corpo?.schema, 'schema') || schemaSalvo || '' : '';
      const alvo = schema ? `${schema}.${tabela}` : tabela;
      const r = await excluirLinha(c, alvo, pk, pkValores);
      if (r.erro) throw new BadRequestException(r.erro);
      return { ok: true, afetadas: r.afetadas };
    });
  }

  /** INSERT de uma linha nova. */
  @Post('dados/inserir')
  dadosInserir(@Body() corpo: { conexao?: unknown; schema?: unknown; tabela?: unknown; colunas?: unknown; valores?: unknown }) {
    const tabela = validarIdentificador(texto(corpo?.tabela, 'tabela'), 'tabela');
    const colunas = validarColunas((corpo?.colunas ?? []) as string[], 'colunas');
    const valores = validarParamsSql(corpo?.valores);
    if (valores.length !== colunas.length) throw new BadRequestException('valores não correspondem às colunas');
    return this.comConexao(corpo?.conexao, async (c, p, schemaSalvo) => {
      const schema = c.usaSchema ? texto(corpo?.schema, 'schema') || schemaSalvo || '' : '';
      const alvo = schema ? `${schema}.${tabela}` : tabela;
      const r = await inserirLinha(c, alvo, colunas, valores);
      if (r.erro) throw new BadRequestException(r.erro);
      return { ok: true, afetadas: r.afetadas };
    });
  }

  /** Duplicar uma linha pela PK (copia as colunas não-PK). */
  @Post('dados/duplicar')
  dadosDuplicar(@Body() corpo: { conexao?: unknown; schema?: unknown; tabela?: unknown; colunas?: unknown; pk?: unknown; pkValores?: unknown }) {
    const tabela = validarIdentificador(texto(corpo?.tabela, 'tabela'), 'tabela');
    const colunas = validarColunas((corpo?.colunas ?? []) as string[], 'colunas');
    const pk = validarColunas((corpo?.pk ?? []) as string[], 'pk');
    const pkValores = validarParamsSql(corpo?.pkValores);
    if (pkValores.length !== pk.length) throw new BadRequestException('pkValores não correspondem à pk');
    return this.comConexao(corpo?.conexao, async (c, p, schemaSalvo) => {
      const schema = c.usaSchema ? texto(corpo?.schema, 'schema') || schemaSalvo || '' : '';
      const alvo = schema ? `${schema}.${tabela}` : tabela;
      const r = await duplicarLinha(c, alvo, colunas, pk, pkValores);
      if (r.erro) throw new BadRequestException(r.erro);
      return { ok: true, afetadas: r.afetadas };
    });
  }

  // ---- NoSQL ----
  @Post('nosql/testar')
  async nosqlTestar(@Body() corpo: { conexao?: unknown }) {
    const { uri, database } = await this.conexoes.resolverNoSql(corpo?.conexao);
    try {
      return { ok: true, colecoes: await listarColecoes(uri, database) };
    } catch (e) {
      return { ok: false, erro: mensagemSegura(e, [uri]), colecoes: [] as string[] };
    }
  }

  @Post('nosql/importar')
  async nosqlImportar(@Body() corpo: { conexao?: unknown; amostra?: unknown; colecoes?: unknown }) {
    const { uri, database, amostra } = await this.conexoes.resolverNoSql(corpo?.conexao);
    const so = Array.isArray(corpo?.colecoes) && corpo.colecoes.every((x) => typeof x === 'string') && corpo.colecoes.length ? (corpo.colecoes as string[]) : undefined;
    try {
      const colecoes = await introspeccionarNoSql(uri, database, corpo?.amostra == null ? amostra : Number(corpo.amostra), so);
      if (!colecoes.length) throw new BadRequestException('Nenhuma coleção encontrada no database.');
      return { colecoes, formas: colecoesParaFormas(colecoes) };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(mensagemSegura(e, [uri]));
    }
  }

  @Post('nosql/script')
  nosqlScript(@Body() corpo: unknown) {
    const erros = validarDiagrama(corpo);
    if (erros.length) throw new BadRequestException(erros);
    const d = corpo as Diagrama;
    if (d.tipo !== 'nosql') throw new BadRequestException('esta operação só existe para o diagrama NoSQL');
    return { texto: gerarScriptMongosh(d) };
  }
}
