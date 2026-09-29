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

/**
 * DDL do schema, DDL de um objeto, FKs que apontam para uma tabela e introspecção estruturada do schema.
 * Tudo aqui é texto/estrutura calculados a partir de um
 * `Dialeto` (leitura de catálogo), então dá para testar com um dialeto falso, sem banco.
 * O texto gerado alimenta o mesmo importador de DDL (geradores/importador*.ts).
 */
import { Dialeto, FkLinha, InfoTabela, ItemBanco, TipoObjeto } from './tipos';

export function qualificar(schema: string | null | undefined, nome: string): string {
  return schema ? schema + '.' + nome : nome;
}

const acrescente = (clausula: string, valor: string | null | undefined): string => (valor != null && valor.trim() !== '' ? clausula + valor.trim() : '');

export const vazioSeNulo = (s: string | null | undefined): string | null => (s == null || s === '' ? null : s);

async function seguro<T>(p: Promise<T>, aoFalhar: T, avisos?: string[], rotulo = ''): Promise<T> {
  try {
    return await p;
  } catch (e) {
    //# Falha ao ler algo acessório (sequences, gatilhos...) não impede o resto da importação.
    avisos?.push(`${rotulo}: ${e instanceof Error ? e.message : String(e)}`);
    return aoFalhar;
  }
}

export interface OpcoesDdl {
  /** Recebe avisos de leituras acessórias que falharam. */
  avisos?: string[];
}

export async function gerarSequencias(d: Dialeto, schema: string | null, o: OpcoesDdl = {}): Promise<string> {
  const seqs = await seguro(d.sequenciasDetalhe(schema), [], o.avisos, 'sequences');
  let sb = '';
  for (const q of seqs) {
    sb += 'CREATE SEQUENCE ' + qualificar(schema, q.nome);
    sb += acrescente(' INCREMENT BY ', q.incremento);
    sb += acrescente(' START WITH ', q.inicio);
    sb += acrescente(' MINVALUE ', q.minimo);
    sb += acrescente(' MAXVALUE ', q.maximo);
    if ((q.ciclo ?? '').toUpperCase() === 'YES') sb += ' CYCLE';
    sb += ';\n';
  }
  return sb ? sb + '\n' : '';
}

export async function gerarTiposCustomizados(d: Dialeto, schema: string | null, o: OpcoesDdl = {}): Promise<string> {
  let sb = '';
  for (const dom of await seguro(d.dominios(schema), [], o.avisos, 'domains')) {
    let base = dom.tipoBase;
    if (dom.tamanho != null && dom.tamanho > 0) base += '(' + dom.tamanho + ')';
    sb += 'CREATE DOMAIN ' + qualificar(schema, dom.nome) + ' AS ' + base + acrescente(' DEFAULT ', dom.padrao) + ';\n';
  }
  for (const e of await seguro(d.enums(schema), [], o.avisos, 'enums')) {
    sb += 'CREATE TYPE ' + e.nome + ' AS ENUM (' + e.valores.map((v) => "'" + v.replace(/'/g, "''") + "'").join(', ') + ');\n';
  }
  return sb ? sb + '\n' : '';
}

/** Acrescenta o tamanho aos tipos de texto/numéricos quando ele existe. */
export function formatarTipo(tipo: string, tamanho: number): string {
  const t = tipo.toLowerCase();
  const usaTamanho = ['varchar', 'character varying', 'char', 'character', 'bpchar', 'numeric', 'decimal', 'nvarchar', 'nchar', 'varchar2'].includes(t);
  return usaTamanho && tamanho > 0 ? tipo + '(' + tamanho + ')' : tipo;
}

export async function gerarCreateTable(d: Dialeto, schema: string | null, tabela: string, o: OpcoesDdl = {}): Promise<string> {
  const pks = await d.chavePrimaria(schema, tabela);
  const part = await seguro(d.particionamento(schema, tabela), { cauda: '', comando: '' }, o.avisos, 'partição');
  //# Tabela é uma partição: o comando já vem pronto e não leva colunas.
  if (part.comando) return part.comando;
  const espaciais = await seguro(d.tiposEspaciais(schema, tabela), {}, o.avisos, 'PostGIS');
  const defs: string[] = [];
  for (const c of await d.colunas(schema, tabela)) {
    let def = c.nome + ' ' + (espaciais[c.nome.toLowerCase()] ?? c.tipo);
    //# DEFAULT cru do catálogo, reemitido como veio (o importador o devolve como valor padrão do campo).
    if (c.padrao != null && c.padrao.trim() !== '') def += ' DEFAULT ' + c.padrao.trim();
    if (!c.nullable) def += ' NOT NULL';
    defs.push(def);
  }
  let sb = 'CREATE TABLE ' + qualificar(schema, tabela) + ' (\n    ' + defs.join(',\n    ');
  if (pks.length) sb += ',\n    PRIMARY KEY (' + pks.join(', ') + ')';
  return sb + '\n)' + part.cauda + ';\n\n';
}

export async function gerarForeignKeys(d: Dialeto, schema: string | null, tabela: string, filtro?: (r: FkLinha) => boolean): Promise<string> {
  const porConstraint = new Map<string, { fk: string; pkTable: string; pk: string }[]>();
  const schemaRef = new Map<string, string | null>();
  for (const r of await d.fksImportadas(schema, tabela)) {
    if (filtro && !filtro(r)) continue;
    const chave = r.nome ? r.nome : tabela + '_' + r.colunaLocal + '_fkey';
    if (!porConstraint.has(chave)) porConstraint.set(chave, []);
    porConstraint.get(chave)!.push({ fk: r.colunaLocal, pkTable: r.tabelaRef, pk: r.colunaRef });
    if (!schemaRef.has(chave)) schemaRef.set(chave, r.schemaRef ? r.schemaRef : schema);
  }
  let sb = '';
  for (const [nome, pares] of porConstraint) {
    sb += 'ALTER TABLE ' + qualificar(schema, tabela) + ' ADD CONSTRAINT ' + nome +
      ' FOREIGN KEY (' + pares.map((p) => p.fk).join(', ') + ')' +
      ' REFERENCES ' + qualificar(schemaRef.get(nome), pares[0].pkTable) +
      ' (' + pares.map((p) => p.pk).join(', ') + ');\n';
  }
  return sb;
}

export async function gerarIndices(d: Dialeto, schema: string | null, tabela: string): Promise<string> {
  const pk = new Set((await d.chavePrimaria(schema, tabela)).map((c) => c.toLowerCase()));
  const colunas = new Map<string, string[]>();
  const unico = new Map<string, boolean>();
  for (const r of await d.indices(schema, tabela)) {
    //# Linha sem coluna não descreve índice (estatística, ou expressão).
    if (!r.nome || r.coluna == null) continue;
    if (!colunas.has(r.nome)) colunas.set(r.nome, []);
    colunas.get(r.nome)!.push(r.coluna);
    unico.set(r.nome, r.unico);
  }
  let sb = '';
  for (const [nome, cols] of colunas) {
    const u = unico.get(nome) === true;
    //# Índice único cujo conjunto de colunas é exatamente a PK é a própria PK: já saiu no CREATE TABLE.
    if (u && pk.size > 0) {
      const lower = new Set(cols.map((c) => c.toLowerCase()));
      if (lower.size === pk.size && [...lower].every((c) => pk.has(c))) continue;
    }
    sb += (u ? 'CREATE UNIQUE INDEX ' : 'CREATE INDEX ') + nome + ' ON ' + qualificar(schema, tabela) + ' (' + cols.join(', ') + ');\n';
  }
  return sb ? sb + '\n' : '';
}

export async function gerarGatilhos(d: Dialeto, schema: string | null, tabela: string, o: OpcoesDdl = {}): Promise<string> {
  const linhas = await seguro(d.gatilhos(schema, tabela), [], o.avisos, 'gatilhos');
  const eventos = new Map<string, string[]>();
  const dados = new Map<string, (typeof linhas)[number]>();
  for (const l of linhas) {
    if (!eventos.has(l.nome)) eventos.set(l.nome, []);
    eventos.get(l.nome)!.push(l.evento);
    if (!dados.has(l.nome)) dados.set(l.nome, l);
  }
  let sb = '';
  for (const [nome, evs] of eventos) {
    const x = dados.get(nome)!;
    sb += 'CREATE TRIGGER ' + nome + ' ' + (x.momento == null ? 'BEFORE' : x.momento) + ' ' + evs.join(' OR ') +
      ' ON ' + qualificar(schema, tabela) + ' FOR EACH ' + ((x.orientacao ?? '').toUpperCase() === 'STATEMENT' ? 'STATEMENT' : 'ROW');
    if (x.condicao != null && x.condicao.trim() !== '') sb += ' WHEN (' + x.condicao + ')';
    const acao = (x.acao ?? '').trim();
    sb += ' ' + (acao.toUpperCase().startsWith('EXECUTE') ? acao : 'EXECUTE FUNCTION ' + acao) + ';\n';
  }
  return sb ? sb + '\n' : '';
}

export async function gerarRotinas(d: Dialeto, schema: string | null, o: OpcoesDdl = {}): Promise<string> {
  let sb = '';
  for (const r of await seguro(d.rotinas(schema), [], o.avisos, 'rotinas')) {
    //# Função em C ou interna não tem corpo legível: pulada em vez de sair quebrada.
    if (r.corpo == null || r.corpo.trim() === '') continue;
    const proc = (r.tipo ?? '').toUpperCase() === 'PROCEDURE';
    sb += (proc ? 'CREATE OR REPLACE PROCEDURE ' : 'CREATE OR REPLACE FUNCTION ') + qualificar(schema, r.nome) + '()';
    if (!proc) sb += ' RETURNS ' + (r.retorno == null || r.retorno.trim() === '' ? 'void' : r.retorno);
    sb += ' AS $$' + r.corpo + '$$ LANGUAGE ' + (r.linguagem == null || r.linguagem.trim() === '' ? 'plpgsql' : r.linguagem.toLowerCase()) + ';\n\n';
  }
  return sb;
}

export async function gerarCreateView(d: Dialeto, schema: string | null, nome: string, materializada: boolean): Promise<string> {
  const def = await d.definicaoView(schema, nome);
  if (def == null || def.trim() === '') return '-- Não foi possível ler a definição da view ' + nome + ' no catálogo do banco.\n\n';
  const t = def.trim();
  return (materializada ? 'CREATE MATERIALIZED VIEW ' : 'CREATE VIEW ') + qualificar(schema, nome) + ' AS\n' + t + (t.endsWith(';') ? '' : ';') + '\n\n';
}

/** Corpo de gerarDDLDoSchema restrito a um schema (ou a nenhum, em bancos sem o conceito). */
export async function gerarDdlDeUmSchema(d: Dialeto, schema: string | null, o: OpcoesDdl = {}): Promise<string> {
  const objetos = await d.objetos(schema);
  const tabelas = objetos.filter((x) => x.tipo === 'TABELA').map((x) => x.nome);
  const views = objetos.filter((x) => x.tipo === 'VIEW').map((x) => x.nome);
  const mats = objetos.filter((x) => x.tipo === 'VIEW_MATERIALIZADA').map((x) => x.nome);
  let ddl = '';
  //# Tipos e sequences primeiro: o CREATE TABLE pode referenciar os dois.
  ddl += await gerarTiposCustomizados(d, schema, o);
  ddl += await gerarSequencias(d, schema, o);
  for (const t of tabelas) ddl += await gerarCreateTable(d, schema, t, o);
  for (const t of tabelas) ddl += await gerarForeignKeys(d, schema, t);
  for (const t of tabelas) ddl += await gerarIndices(d, schema, t);
  for (const v of views) ddl += await gerarCreateView(d, schema, v, false);
  for (const v of mats) ddl += await gerarCreateView(d, schema, v, true);
  //# Rotinas e gatilhos por último: o gatilho depende da tabela e da função.
  ddl += await gerarRotinas(d, schema, o);
  for (const t of tabelas) ddl += await gerarGatilhos(d, schema, t, o);
  return ddl;
}

/** Schemas de usuário (sem pg_*, information_schema e papéis fixos do SQL Server). */
export async function gerarDdlDoSchema(d: Dialeto, schema: string, o: OpcoesDdl = {}): Promise<string> {
  let ddl = '';
  if (d.usaSchema && !schema) {
    //# Nenhum schema escolhido: um schema real por vez, para cada CREATE TABLE sair qualificado.
    for (const s of await d.schemas()) ddl += await gerarDdlDeUmSchema(d, s, o);
  } else {
    ddl += await gerarDdlDeUmSchema(d, d.usaSchema ? schema : null, o);
  }
  return ddl;
}

/** Só as tabelas/views escolhidas (importação seletiva): mesmo texto que o completo, restrito à seleção. */
export async function gerarDdlSelecionados(d: Dialeto, selecao: { schema: string | null; nome: string; tipo: TipoObjeto }[], o: OpcoesDdl = {}): Promise<string> {
  let ddl = '';
  const tabelas = selecao.filter((s) => s.tipo === 'TABELA');
  for (const s of tabelas) ddl += await gerarCreateTable(d, vazioSeNulo(s.schema), s.nome, o);
  for (const s of tabelas) ddl += await gerarForeignKeysRestritas(d, vazioSeNulo(s.schema), s.nome, tabelas);
  for (const s of tabelas) ddl += await gerarIndices(d, vazioSeNulo(s.schema), s.nome);
  for (const s of selecao) if (s.tipo === 'VIEW' || s.tipo === 'VIEW_MATERIALIZADA') ddl += await gerarCreateView(d, vazioSeNulo(s.schema), s.nome, s.tipo === 'VIEW_MATERIALIZADA');
  for (const s of tabelas) ddl += await gerarGatilhos(d, vazioSeNulo(s.schema), s.nome, o);
  return ddl;
}

/** FKs da tabela, mantendo só as que apontam para outra tabela também selecionada (evita referência solta). */
async function gerarForeignKeysRestritas(d: Dialeto, schema: string | null, tabela: string, sel: { schema: string | null; nome: string }[]): Promise<string> {
  const ok = new Set(sel.map((s) => s.nome.toLowerCase()));
  return gerarForeignKeys(d, schema, tabela, (r) => ok.has(r.tabelaRef.toLowerCase()));
}

/** FKs de OUTRAS tabelas que apontam para `tabela`, só as de interesse. */
export async function gerarFksQueApontamPara(d: Dialeto, schema: string | null, tabela: string, tabelasDeInteresse: Set<string>): Promise<string> {
  if (!tabelasDeInteresse.size) return '';
  const porConstraint = new Map<string, { fk: string; pk: string }[]>();
  const tabelaDe = new Map<string, string>();
  const schemaDe = new Map<string, string | null>();
  for (const r of await d.fksExportadas(schema, tabela)) {
    if (!tabelasDeInteresse.has(r.tabelaLocal.toLowerCase())) continue;
    const chave = r.nome ? r.nome : '#' + r.tabelaLocal + r.colunaLocal;
    if (!porConstraint.has(chave)) porConstraint.set(chave, []);
    porConstraint.get(chave)!.push({ fk: r.colunaLocal, pk: r.colunaRef });
    if (!tabelaDe.has(chave)) tabelaDe.set(chave, r.tabelaLocal);
    if (!schemaDe.has(chave)) schemaDe.set(chave, r.schemaLocal ? r.schemaLocal : schema);
  }
  let sb = '';
  for (const [chave, pares] of porConstraint) {
    sb += 'ALTER TABLE ' + qualificar(schemaDe.get(chave), tabelaDe.get(chave)!) + ' ADD CONSTRAINT ' + chave +
      ' FOREIGN KEY (' + pares.map((p) => p.fk).join(', ') + ')' +
      ' REFERENCES ' + qualificar(schema, tabela) + ' (' + pares.map((p) => p.pk).join(', ') + ');\n';
  }
  return sb;
}

/** DDL de um objeto só (explorador / arrastar tabela). */
export async function gerarDdlDeObjeto(d: Dialeto, schema: string | null, objeto: string, tipo: TipoObjeto, o: OpcoesDdl = {}): Promise<string> {
  const sc = d.usaSchema && schema ? schema : null;
  switch (tipo) {
    case 'VIEW': return gerarCreateView(d, sc, objeto, false);
    case 'VIEW_MATERIALIZADA': return gerarCreateView(d, sc, objeto, true);
    case 'TABELA':
      return (await gerarCreateTable(d, sc, objeto, o)) + (await gerarForeignKeys(d, sc, objeto)) + (await gerarIndices(d, sc, objeto)) + (await gerarGatilhos(d, sc, objeto, o));
    default:
      return '-- DDL não disponível para este tipo de objeto no explorador.\n';
  }
}

/**
 * Snapshot só de TABELAS (views ficam de fora de propósito,
 * para o diff de migração não sugerir DROP TABLE para cada view).
 */
export async function introspeccionarEstruturado(d: Dialeto, schema: string): Promise<InfoTabela[]> {
  const sc = d.usaSchema && schema ? schema : null;
  const res: InfoTabela[] = [];
  const tabelas: ItemBanco[] = (await d.objetos(sc)).filter((x) => x.tipo === 'TABELA');
  for (const t of tabelas) {
    const info: InfoTabela = { nome: t.nome, colunas: {}, pk: [], fks: [] };
    info.pk = (await d.chavePrimaria(sc, t.nome)).map((c) => c.toLowerCase());
    for (const c of await d.colunas(sc, t.nome)) info.colunas[c.nome.toLowerCase()] = { nome: c.nome, tipo: c.tipo, nullable: c.nullable };
    const porConstraint = new Map<string, { local: string; tabelaRef: string; ref: string }[]>();
    for (const r of await d.fksImportadas(sc, t.nome)) {
      const chave = r.nome ? r.nome : '#' + r.colunaLocal;
      if (!porConstraint.has(chave)) porConstraint.set(chave, []);
      porConstraint.get(chave)!.push({ local: r.colunaLocal, tabelaRef: r.tabelaRef, ref: r.colunaRef });
    }
    for (const partes of porConstraint.values()) {
      info.fks.push({ colunasLocais: partes.map((p) => p.local), tabelaRef: partes[0].tabelaRef, colunasRef: partes.map((p) => p.ref) });
    }
    res.push(info);
  }
  return res;
}
