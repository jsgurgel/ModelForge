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
import { ConexaoBase, s } from './base';

const TEXTUAIS = /^(char|varchar|tinytext|text|mediumtext|longtext|enum|set|date|time|datetime|timestamp|year)$/i;
const EXPRESSAO = /^(current_timestamp|now|curdate|curtime|localtime|localtimestamp|current_date|current_time|null|true|false)\b|^\(|^'|^-?\d/i;

/** MySQL 8 devolve o DEFAULT literal sem aspas; MariaDB já devolve entre aspas. Aspas só onde falta. */
export function padraoMysql(padrao: string | null, tipoDado: string): string | null {
  if (padrao == null) return null;
  if (TEXTUAIS.test(tipoDado) && !EXPRESSAO.test(padrao.trim())) return "'" + padrao.replace(/'/g, "''") + "'";
  return padrao;
}

/** MySQL / MariaDB via "mysql2" (JS puro). O "database" é o único escopo: não há schemas. */
export class ConexaoMysql extends ConexaoBase {
  readonly tipo = 'mysql' as const;
  readonly usaSchema = false;

  private constructor(private cli: any) { super(); }

  static async abrir(p: ParamsConexao): Promise<ConexaoMysql> {
    const mysql = require('mysql2/promise');
    const cli = await mysql.createConnection({
      host: p.host, port: p.porta, database: p.database, user: p.usuario, password: p.senha,
      //# sslMode=VERIFY_IDENTITY (ou REQUIRED se o usuário confiou no certificado).
      ssl: p.tls ? { rejectUnauthorized: !p.confiarCertificado } : undefined,
      connectTimeout: LIMITES.timeoutConexaoMs,
      dateStrings: true, supportBigNumbers: true, bigNumberStrings: true,
      multipleStatements: false,
    });
    return new ConexaoMysql(cli);
  }

  private async q(sql: string, values: unknown[] = []): Promise<Record<string, any>[]> {
    const [rows] = await this.cli.query({ sql, values, timeout: LIMITES.timeoutConsultaMs });
    return rows as Record<string, any>[];
  }

  async schemas(): Promise<string[]> { return ['']; }

  async objetos(): Promise<ItemBanco[]> {
    const r = await this.q(`select table_name as nome, table_type as t from information_schema.tables where table_schema = database() and table_type in ('BASE TABLE','VIEW') order by table_name`);
    return r.map((x) => ({ nome: x.nome, tipo: x.t === 'VIEW' ? 'VIEW' : 'TABELA' }));
  }

  async rotinasNomes(): Promise<ItemBanco[]> {
    const r = await this.q(`select routine_name as nome, routine_type as tp from information_schema.routines where routine_schema = database() order by routine_name`);
    return r.map((x) => ({ nome: x.nome + (x.tp ? ` (${String(x.tp).toLowerCase()})` : ''), tipo: 'ROTINA' as const }));
  }

  async colunas(_schema: string | null, tabela: string): Promise<ColunaInfo[]> {
    const r = await this.q(
      `select column_name as nome, column_type as tipo, data_type as dt, is_nullable as nul, column_default as padrao
       from information_schema.columns where table_schema = database() and table_name = ? order by ordinal_position`, [tabela]);
    return r.map((x) => ({ nome: x.nome, tipo: String(x.tipo), nullable: x.nul === 'YES', padrao: padraoMysql(s(x.padrao), String(x.dt)) }));
  }

  async chavePrimaria(_schema: string | null, tabela: string): Promise<string[]> {
    const r = await this.q(`select column_name as nome from information_schema.key_column_usage where table_schema = database() and table_name = ? and constraint_name = 'PRIMARY' order by ordinal_position`, [tabela]);
    return r.map((x) => x.nome);
  }

  private mapFk = (x: Record<string, any>): FkLinha => ({
    nome: x.nome, tabelaLocal: x.tabela_local, schemaLocal: null, colunaLocal: x.coluna_local,
    tabelaRef: x.tabela_ref, schemaRef: null, colunaRef: x.coluna_ref,
  });
  private static FK = `select constraint_name as nome, table_name as tabela_local, column_name as coluna_local, referenced_table_name as tabela_ref, referenced_column_name as coluna_ref
    from information_schema.key_column_usage where table_schema = database() and referenced_table_schema = database() and referenced_table_name is not null`;

  async fksImportadas(_s: string | null, tabela: string): Promise<FkLinha[]> {
    return (await this.q(ConexaoMysql.FK + ' and table_name = ? order by constraint_name, ordinal_position', [tabela])).map(this.mapFk);
  }
  async fksExportadas(_s: string | null, tabela: string): Promise<FkLinha[]> {
    return (await this.q(ConexaoMysql.FK + ' and referenced_table_name = ? order by table_name, constraint_name, ordinal_position', [tabela])).map(this.mapFk);
  }

  async indices(_s: string | null, tabela: string): Promise<IndiceLinha[]> {
    const r = await this.q(`select index_name as nome, non_unique as nu, column_name as coluna from information_schema.statistics where table_schema = database() and table_name = ? order by index_name, seq_in_index`, [tabela]);
    return r.map((x) => ({ nome: x.nome, unico: Number(x.nu) === 0, coluna: s(x.coluna) }));
  }

  async definicaoView(_s: string | null, nome: string): Promise<string | null> {
    const r = await this.q(`select view_definition as def from information_schema.views where table_schema = database() and table_name = ?`, [nome]);
    return r.length ? s(r[0].def) : null;
  }


  async executar(sql: string, params: string[], limite: number): Promise<ResultadoSql> {
    const [res, campos] = await this.cli.query({ sql, values: params, rowsAsArray: true, timeout: LIMITES.timeoutConsultaMs });
    if (Array.isArray(campos) && Array.isArray(res)) {
      const colunas: string[] = campos.map((c: { name: string }) => c.name);
      return { colunas, linhas: (res as unknown[][]).slice(0, limite).map((l) => l.map(celula)), afetadas: null, truncado: res.length > limite };
    }
    return { colunas: [], linhas: [], afetadas: typeof res?.affectedRows === 'number' ? res.affectedRows : null, truncado: false };
  }

  async fechar(): Promise<void> {
    try { await this.cli.end(); } catch { /* já fechada */ }
  }
}
