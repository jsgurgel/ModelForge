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
 * Data Grid: consulta paginada e CRUD por chave primária.
 *
 * Os builders são funções puras (um por dialeto) e os wrappers recebem a
 * `Conexao` aberta e devolvem o resultado pronto — a mesma separação do
 * sql-exec.ts: validação aqui, execução no driver.
 *
 * Segurança: nomes de tabela/coluna são validados por regex (sem aceitar
 * qualquer texto); valores SEMPRE vão por parâmetro ($1/?/@p1), nunca
 * concatenados; UPDATE/DELETE SEMPRE carregados pela PK completa.
 */
import { BadRequestException } from '@nestjs/common';
import { Conexao } from './tipos';
import { ResultadoComando } from './sql-exec';
import { executarScript } from './sql-exec';

//# ---- validação de identificadores ---------------------------------------------------------

/** Identificador simples (letra, dígito, _); aceita nomes de tabela com schema ("public.clientes"). */
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

export function validarIdentificador(nome: string, campo: string): string {
  if (!nome || !IDENT.test(nome)) throw new BadRequestException(`${campo} inválido`);
  return nome;
}

/** Colunas vindas do catálogo: cada nome precisa casar com o IDENT simples. */
export function validarColunas(colunas: string[], campo: string): string[] {
  const limpas = colunas.map((c) => validarIdentificador(c, campo));
  if (!limpas.length) throw new BadRequestException(`${campo} inválido`);
  return limpas;
}

//# ---- SELECT paginado ------------------------------------------------------------------------

export interface OpcoesConsulta {
  tabela: string;
  /** Colunas para o WHERE (todas com AND); valor é comparado com ILIKE/LIKE textual. */
  filtro?: { coluna: string; valor: string }[];
  /** Ordenação: colunas válidas do catálogo. */
  ordenar?: { coluna: string; desc?: boolean }[];
  /** Página (0 = primeira). */
  pagina: number;
  /** Linhas por página (o controller já limita). */
  porPagina: number;
}

/** Placeholder por dialeto. */
const ph = (tipo: string, i: number): string =>
  tipo === 'postgresql' ? `$${i + 1}` : tipo === 'sqlserver' ? `@p${i + 1}` : '?';

/** Cláusula de filtro textual por dialeto (case-insensitive onde existe). */
const like = (tipo: string): string => {
  if (tipo === 'postgresql') return 'ILIKE';
  if (tipo === 'mysql') return 'LIKE';
  if (tipo === 'sqlite') return 'LIKE';
  return 'LIKE'; //# SQL Server: sem LIKE case-insensitive depende do collation (o padrão costuma ser insensitive)
};

/** Builder puro do SELECT de dados. */
export function gerarSelectDados(tipo: string, o: OpcoesConsulta, totalPh: string): { sql: string; params: string[] } {
  const params: string[] = [];
  const alvo = tipo === 'sqlserver' || tipo === 'postgresql' || tipo === 'mysql' ? o.tabela : o.tabela;
  let sql = `SELECT * FROM ${alvo}`;
  if (o.filtro?.length) {
    const partes: string[] = [];
    for (const f of o.filtro) {
      partes.push(`${f.coluna} ${like(tipo)} ${ph(tipo, params.length)}`);
      params.push(`%${f.valor}%`);
    }
    sql += ` WHERE ${partes.join(' AND ')}`;
  }
  if (o.ordenar?.length) {
    sql += ` ORDER BY ${o.ordenar.map((x) => `${x.coluna}${x.desc ? ' DESC' : ''}`).join(', ')}`;
  } else {
    //# Sem ORDER BY a paginação não é determinística: ordena pela primeira coluna do filtro ou nada.
    sql += '';
  }
  const offset = o.pagina * o.porPagina;
  if (tipo === 'postgresql' || tipo === 'mysql' || tipo === 'sqlite') {
    sql += ` LIMIT ${ph(tipo, params.length)}`;
    params.push(String(o.porPagina));
    sql += ` OFFSET ${ph(tipo, params.length)}`;
    params.push(String(offset));
  } else if (tipo === 'sqlserver') {
    sql = sql.replace(/^SELECT \*/i, 'SELECT *');
    //# SQL Server: OFFSET/FETCH exige ORDER BY.
    if (!o.ordenar?.length) sql += ' ORDER BY (SELECT NULL)';
    sql += ` OFFSET ${ph(tipo, params.length)} ROWS FETCH NEXT ${ph(tipo, params.length + 1)} ROWS ONLY`;
    params.push(String(offset), String(o.porPagina));
  }
  void totalPh;
  return { sql, params };
}

/** SELECT COUNT(*) com os mesmos filtros. */
export function gerarCountDados(tipo: string, o: OpcoesConsulta): { sql: string; params: string[] } {
  const params: string[] = [];
  let sql = `SELECT COUNT(*) AS total FROM ${o.tabela}`;
  if (o.filtro?.length) {
    const partes: string[] = [];
    for (const f of o.filtro) {
      partes.push(`${f.coluna} ${like(tipo)} ${ph(tipo, params.length)}`);
      params.push(`%${f.valor}%`);
    }
    sql += ` WHERE ${partes.join(' AND ')}`;
  }
  return { sql, params };
}

//# ---- CRUD por PK ----------------------------------------------------------------------------

export function gerarInsert(tipo: string, tabela: string, colunas: string[], pk: string[]): { sql: string; params: string[] } {
  const holders = colunas.map((_, i) => ph(tipo, i)).join(', ');
  const sql = `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${holders})`;
  void pk;
  return { sql, params: [] }; //# params vêm do wrapper (valores na ordem das colunas)
}

export function gerarUpdate(tipo: string, tabela: string, colunas: string[], pk: string[]): { sql: string; params: string[] } {
  if (!pk.length) throw new BadRequestException('tabela sem chave primária: não é possível atualizar com segurança');
  const set = colunas.map((c, i) => `${c} = ${ph(tipo, i)}`).join(', ');
  const where = pk.map((c, i) => `${c} = ${ph(tipo, colunas.length + i)}`).join(' AND ');
  return { sql: `UPDATE ${tabela} SET ${set} WHERE ${where}`, params: [] };
}

export function gerarDelete(tipo: string, tabela: string, pk: string[]): { sql: string; params: string[] } {
  if (!pk.length) throw new BadRequestException('tabela sem chave primária: não é possível excluir com segurança');
  const where = pk.map((c, i) => `${c} = ${ph(tipo, i)}`).join(' AND ');
  return { sql: `DELETE FROM ${tabela} WHERE ${where}`, params: [] };
}

/** Duplicar: INSERT SELECT da própria linha (sem as colunas da PK). */
export function gerarDuplicar(tipo: string, tabela: string, colunas: string[], pk: string[]): { sql: string; params: string[] } {
  if (!pk.length) throw new BadRequestException('tabela sem chave primária: não é possível duplicar com segurança');
  const semPk = colunas.filter((c) => !pk.includes(c));
  if (!semPk.length) throw new BadRequestException('todas as colunas são chave primária');
  const where = pk.map((c, i) => `${c} = ${ph(tipo, i)}`).join(' AND ');
  const sql = `INSERT INTO ${tabela} (${semPk.join(', ')}) SELECT ${semPk.join(', ')} FROM ${tabela} WHERE ${where}`;
  return { sql, params: [] }; //# wrapper monta os valores da PK
}

//# ---- wrappers (executam com a Conexao) ------------------------------------------------------

/** Linhas da tabela (página) + total (mesma conexão). */
export async function consultarDados(con: Conexao, o: OpcoesConsulta): Promise<{ colunas: string[]; linhas: unknown[][]; total: number; pagina: number; porPagina: number }> {
  const sel = gerarSelectDados(con.tipo, o, '');
  const cnt = gerarCountDados(con.tipo, o);
  const limite = Math.max(o.porPagina, 1);
  const r = await con.executar(sel.sql, sel.params, limite);
  const t = await con.executar(cnt.sql, cnt.params, 1);
  const total = Number(t.linhas[0]?.[0] ?? 0);
  return { colunas: r.colunas, linhas: r.linhas, total, pagina: o.pagina, porPagina: o.porPagina };
}

/** Executa um builder CRUD com os valores na ordem esperada. */
async function executarCrud(con: Conexao, b: { sql: string; params: string[] }, valores: string[], segredos: string[] = []): Promise<ResultadoComando> {
  const t0 = Date.now();
  try {
    const r = await con.executar(b.sql, valores, 1);
    return { ...r, sql: b.sql, ms: Date.now() - t0 };
  } catch (e) {
    const { mensagemSegura } = await import('./seguranca');
    return { colunas: [], linhas: [], afetadas: null, truncado: false, sql: b.sql, ms: Date.now() - t0, erro: mensagemSegura(e, segredos) };
  }
}

export async function inserirLinha(con: Conexao, tabela: string, colunas: string[], valores: string[]): Promise<ResultadoComando> {
  const b = gerarInsert(con.tipo, tabela, colunas, []);
  return executarCrud(con, b, valores);
}

export async function atualizarLinha(con: Conexao, tabela: string, colunas: string[], pk: string[], valores: string[], valoresPk: string[], segredos: string[]): Promise<ResultadoComando> {
  const b = gerarUpdate(con.tipo, tabela, colunas, pk);
  return executarCrud(con, b, [...valores, ...valoresPk], segredos);
}

export async function excluirLinha(con: Conexao, tabela: string, pk: string[], valoresPk: string[]): Promise<ResultadoComando> {
  const b = gerarDelete(con.tipo, tabela, pk);
  return executarCrud(con, b, valoresPk);
}

export async function duplicarLinha(con: Conexao, tabela: string, colunas: string[], pk: string[], valoresPk: string[]): Promise<ResultadoComando> {
  const b = gerarDuplicar(con.tipo, tabela, colunas, pk);
  return executarCrud(con, b, valoresPk);
}

//# Executar script genérico (reutilizado pelo controller) já existe em sql-exec.ts.
export { executarScript };