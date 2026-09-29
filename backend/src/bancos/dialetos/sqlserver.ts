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

import { LIMITES, celula } from '../seguranca';
import { ColunaInfo, FkLinha, IndiceLinha, ItemBanco, ParamsConexao, ResultadoSql, RotinaInfo } from '../tipos';
import { ConexaoBase, corpoDeView, s } from './base';

const CARACTERES = new Set(['char', 'varchar', 'nchar', 'nvarchar', 'binary', 'varbinary']);
const SCHEMAS_FIXOS = new Set(['sys', 'guest', 'information_schema', 'db_owner', 'db_accessadmin', 'db_securityadmin', 'db_ddladmin', 'db_backupoperator', 'db_datareader', 'db_datawriter', 'db_denydatareader', 'db_denydatawriter']);

export function tipoSqlServer(x: { dt: string; len: number | null; p: number | null; s: number | null }): string {
  const dt = String(x.dt);
  if (CARACTERES.has(dt.toLowerCase()) && x.len != null) return `${dt}(${Number(x.len) === -1 ? 'max' : x.len})`;
  if ((dt === 'decimal' || dt === 'numeric') && x.p != null) return `${dt}(${x.p},${x.s ?? 0})`;
  return dt;
}

/** SQL Server via "mssql" (tedious, JS puro). Catálogo por INFORMATION_SCHEMA e sys.*. */
export class ConexaoSqlServer extends ConexaoBase {
  readonly tipo = 'sqlserver' as const;
  readonly usaSchema = true;

  private constructor(private pool: any, private sql: any) { super(); }

  static async abrir(p: ParamsConexao): Promise<ConexaoSqlServer> {
    const sql = require('mssql');
    const pool = new sql.ConnectionPool({
      server: p.host, port: p.porta, database: p.database, user: p.usuario, password: p.senha,
      connectionTimeout: LIMITES.timeoutConexaoMs, requestTimeout: LIMITES.timeoutConsultaMs,
      pool: { max: 1, min: 0 },
      options: { encrypt: p.tls, trustServerCertificate: p.confiarCertificado, enableArithAbort: true },
    });
    pool.on('error', () => undefined);
    await pool.connect();
    return new ConexaoSqlServer(pool, sql);
  }

  private async q(texto: string, valores: unknown[] = []): Promise<Record<string, any>[]> {
    const req = this.pool.request();
    valores.forEach((v, i) => req.input(`p${i + 1}`, this.sql.NVarChar, v));
    return (await req.query(texto)).recordset ?? [];
  }

  async schemas(): Promise<string[]> {
    const r = await this.q('select name as nome from sys.schemas');
    return r.map((x) => x.nome as string).filter((n) => !SCHEMAS_FIXOS.has(n.toLowerCase())).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }

  async objetos(schema: string | null): Promise<ItemBanco[]> {
    const r = await this.q(`select table_name as nome, table_type as t from information_schema.tables ${schema ? 'where table_schema = @p1' : ''} order by table_name`, schema ? [schema] : []);
    return r.filter((x) => x.t === 'BASE TABLE' || x.t === 'VIEW').map((x) => ({ nome: x.nome, tipo: x.t === 'VIEW' ? 'VIEW' : 'TABELA' }));
  }

  async rotinasNomes(schema: string | null): Promise<ItemBanco[]> {
    const r = await this.q(`select routine_name as nome, routine_type as tp from information_schema.routines ${schema ? 'where routine_schema = @p1' : ''} order by routine_name`, schema ? [schema] : []);
    return r.map((x) => ({ nome: x.nome + (x.tp ? ` (${String(x.tp).toLowerCase()})` : ''), tipo: 'ROTINA' as const }));
  }

  async colunas(schema: string | null, tabela: string): Promise<ColunaInfo[]> {
    const p: unknown[] = [tabela];
    const r = await this.q(
      `select column_name as nome, data_type as dt, character_maximum_length as len, numeric_precision as p, numeric_scale as s, is_nullable as nul, column_default as padrao
       from information_schema.columns where table_name = @p1 ${schema ? (p.push(schema), 'and table_schema = @p2') : ''} order by ordinal_position`, p);
    return r.map((x) => ({ nome: x.nome, tipo: tipoSqlServer(x as any), nullable: x.nul === 'YES', padrao: s(x.padrao) }));
  }

  async chavePrimaria(schema: string | null, tabela: string): Promise<string[]> {
    const p: unknown[] = [tabela];
    const r = await this.q(
      `select kcu.column_name as nome from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema and kcu.table_name = tc.table_name
       where tc.constraint_type = 'PRIMARY KEY' and tc.table_name = @p1 ${schema ? (p.push(schema), 'and tc.table_schema = @p2') : ''} order by kcu.ordinal_position`, p);
    return r.map((x) => x.nome);
  }

  private fks(where: string, params: unknown[]): Promise<FkLinha[]> {
    return this.q(
      `select fk.name as nome, cl.name as tabela_local, sl.name as schema_local, pc.name as coluna_local, sr.name as schema_ref, cr.name as tabela_ref, rc.name as coluna_ref
       from sys.foreign_keys fk join sys.foreign_key_columns fkc on fkc.constraint_object_id = fk.object_id
       join sys.tables cl on cl.object_id = fk.parent_object_id join sys.schemas sl on sl.schema_id = cl.schema_id
       join sys.tables cr on cr.object_id = fk.referenced_object_id join sys.schemas sr on sr.schema_id = cr.schema_id
       join sys.columns pc on pc.object_id = fkc.parent_object_id and pc.column_id = fkc.parent_column_id
       join sys.columns rc on rc.object_id = fkc.referenced_object_id and rc.column_id = fkc.referenced_column_id
       where ${where} order by fk.name, fkc.constraint_column_id`, params,
    ).then((r) => r.map((x) => ({ nome: x.nome, tabelaLocal: x.tabela_local, schemaLocal: x.schema_local, colunaLocal: x.coluna_local, tabelaRef: x.tabela_ref, schemaRef: x.schema_ref, colunaRef: x.coluna_ref })));
  }
  fksImportadas(schema: string | null, tabela: string): Promise<FkLinha[]> {
    return this.fks(`cl.name = @p1 ${schema ? 'and sl.name = @p2' : ''}`, schema ? [tabela, schema] : [tabela]);
  }
  fksExportadas(schema: string | null, tabela: string): Promise<FkLinha[]> {
    return this.fks(`cr.name = @p1 ${schema ? 'and sr.name = @p2' : ''}`, schema ? [tabela, schema] : [tabela]);
  }

  async indices(schema: string | null, tabela: string): Promise<IndiceLinha[]> {
    const r = await this.q(
      `select i.name as nome, i.is_unique as unico, c.name as coluna from sys.indexes i
       join sys.index_columns ic on ic.object_id = i.object_id and ic.index_id = i.index_id
       join sys.columns c on c.object_id = ic.object_id and c.column_id = ic.column_id
       join sys.tables t on t.object_id = i.object_id join sys.schemas sc on sc.schema_id = t.schema_id
       where t.name = @p1 ${schema ? 'and sc.name = @p2' : ''} and i.name is not null and ic.is_included_column = 0 and i.type > 0
       order by i.name, ic.key_ordinal`, schema ? [tabela, schema] : [tabela]);
    return r.map((x) => ({ nome: x.nome, unico: x.unico === true || x.unico === 1, coluna: s(x.coluna) }));
  }

  async definicaoView(schema: string | null, nome: string): Promise<string | null> {
    const r = await this.q(
      `select m.definition as def from sys.sql_modules m join sys.views v on v.object_id = m.object_id join sys.schemas sc on sc.schema_id = v.schema_id
       where v.name = @p1 ${schema ? 'and sc.name = @p2' : ''}`, schema ? [nome, schema] : [nome]);
    return r.length ? corpoDeView(s(r[0].def)) : null;
  }


  async executar(sql: string, params: string[], limite: number): Promise<ResultadoSql> {
    const req = this.pool.request();
    req.arrayRowMode = true;
    params.forEach((v, i) => req.input(`p${i + 1}`, this.sql.NVarChar, v));
    const r = await req.query(sql);
    const rs = r.recordsets?.[0] as unknown as (unknown[][] & { columns?: Record<string, { index: number; name: string }> }) | undefined;
    if (rs && rs.columns) {
      const colunas = Object.values(rs.columns).sort((a, b) => a.index - b.index).map((c) => c.name);
      return { colunas, linhas: rs.slice(0, limite).map((l) => l.map(celula)), afetadas: null, truncado: rs.length > limite };
    }
    return { colunas: [], linhas: [], afetadas: r.rowsAffected?.reduce((a: number, b: number) => a + b, 0) ?? null, truncado: false };
  }

  async fechar(): Promise<void> {
    try { await this.pool.close(); } catch { /* já fechada */ }
  }
}
