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
import { ColunaInfo, DominioInfo, EnumInfo, FkLinha, GatilhoLinha, IndiceLinha, ItemBanco, ParamsConexao, Particionamento, ResultadoSql, RotinaInfo, SequenciaInfo } from '../tipos';
import { ConexaoBase, s } from './base';

type Cliente = { query: (c: any, p?: any[]) => Promise<any>; end: () => Promise<void> };

const SCHEMAS_INTERNOS = `nspname not like 'pg\\_%' and nspname <> 'information_schema'`;

/** PostgreSQL via "pg" (JS puro). Catálogo por pg_catalog, equivalente ao que o pgjdbc expõe em DatabaseMetaData. */
export class ConexaoPostgres extends ConexaoBase {
  readonly tipo = 'postgresql' as const;
  readonly usaSchema = true;

  private constructor(private cli: Cliente) { super(); }

  static async abrir(p: ParamsConexao): Promise<ConexaoPostgres> {
    const { Client } = require('pg');
    const cli = new Client({
      host: p.host, port: p.porta, database: p.database, user: p.usuario, password: p.senha,
      ssl: p.tls ? { rejectUnauthorized: !p.confiarCertificado } : false,
      connectionTimeoutMillis: LIMITES.timeoutConexaoMs,
      statement_timeout: LIMITES.timeoutConsultaMs,
      query_timeout: LIMITES.timeoutConsultaMs,
      application_name: 'modelforge',
    });
    cli.on('error', () => undefined);
    await cli.connect();
    return new ConexaoPostgres(cli);
  }

  private async q(text: string, values: unknown[] = []): Promise<Record<string, any>[]> {
    return (await this.cli.query({ text, values })).rows;
  }

  /** Filtro por schema (parâmetro $n) ou, sem schema, "todos os de usuário". */
  private filtro(schema: string | null, alias: string, params: unknown[]): string {
    if (schema) { params.push(schema); return `${alias}.nspname = $${params.length}`; }
    return SCHEMAS_INTERNOS.replace(/nspname/g, alias + '.nspname');
  }

  async schemas(): Promise<string[]> {
    const r = await this.q(`select nspname as nome from pg_namespace where ${SCHEMAS_INTERNOS} order by lower(nspname)`);
    return r.map((x) => x.nome);
  }

  async objetos(schema: string | null): Promise<ItemBanco[]> {
    const p: unknown[] = [];
    const r = await this.q(
      `select c.relname as nome, c.relkind as k from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind in ('r','p','v','m') and ${this.filtro(schema, 'n', p)} order by lower(c.relname)`, p);
    return r.map((x) => ({ nome: x.nome, tipo: x.k === 'v' ? 'VIEW' : x.k === 'm' ? 'VIEW_MATERIALIZADA' : 'TABELA' }));
  }

  async sequencias(schema: string | null): Promise<ItemBanco[]> {
    const usa = !!schema;
    const r = await this.q(`select sequence_name as nome from information_schema.sequences${usa ? ' where sequence_schema = $1' : ''} order by sequence_name`, usa ? [schema] : []);
    return r.map((x) => ({ nome: x.nome, tipo: 'SEQUENCIA' as const }));
  }

  async rotinasNomes(schema: string | null): Promise<ItemBanco[]> {
    const usa = !!schema;
    const r = await this.q(`select routine_name as nome, routine_type as tp from information_schema.routines${usa ? ' where routine_schema = $1' : ''} order by routine_name`, usa ? [schema] : []);
    return r.map((x) => ({ nome: x.nome + (x.tp ? ` (${String(x.tp).toLowerCase()})` : ''), tipo: 'ROTINA' as const }));
  }

  async colunas(schema: string | null, tabela: string): Promise<ColunaInfo[]> {
    const p: unknown[] = [tabela];
    const r = await this.q(
      `select a.attname as nome, format_type(a.atttypid, a.atttypmod) as tipo, not a.attnotnull as nullable, pg_get_expr(d.adbin, d.adrelid) as padrao
       from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
       left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
       where c.relname = $1 and ${this.filtro(schema, 'n', p)} and a.attnum > 0 and not a.attisdropped order by a.attnum`, p);
    return r.map((x) => ({ nome: x.nome, tipo: x.tipo, nullable: x.nullable === true, padrao: s(x.padrao) }));
  }

  async chavePrimaria(schema: string | null, tabela: string): Promise<string[]> {
    const p: unknown[] = [tabela];
    const r = await this.q(
      `select a.attname as nome from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey::int2[])
       where i.indisprimary and c.relname = $1 and ${this.filtro(schema, 'n', p)}
       order by array_position(i.indkey::int2[], a.attnum)`, p);
    return r.map((x) => x.nome);
  }

  private fks(where: string, params: unknown[]): Promise<Record<string, any>[]> {
    return this.q(
      `select con.conname as nome, cl.relname as tabela_local, n.nspname as schema_local, ca.attname as coluna_local,
              cr.relname as tabela_ref, nr.nspname as schema_ref, ra.attname as coluna_ref
       from pg_constraint con
       join pg_class cl on cl.oid = con.conrelid join pg_namespace n on n.oid = cl.relnamespace
       join pg_class cr on cr.oid = con.confrelid join pg_namespace nr on nr.oid = cr.relnamespace
       cross join lateral unnest(con.conkey, con.confkey) with ordinality as k(lk, rk, ord)
       join pg_attribute ca on ca.attrelid = con.conrelid and ca.attnum = k.lk
       join pg_attribute ra on ra.attrelid = con.confrelid and ra.attnum = k.rk
       where con.contype = 'f' and ${where} order by con.conname, k.ord`, params);
  }
  private mapFk = (x: Record<string, any>): FkLinha => ({
    nome: x.nome, tabelaLocal: x.tabela_local, schemaLocal: x.schema_local, colunaLocal: x.coluna_local,
    tabelaRef: x.tabela_ref, schemaRef: x.schema_ref, colunaRef: x.coluna_ref,
  });
  async fksImportadas(schema: string | null, tabela: string): Promise<FkLinha[]> {
    const p: unknown[] = [tabela];
    return (await this.fks(`cl.relname = $1 and ${this.filtro(schema, 'n', p)}`, p)).map(this.mapFk);
  }
  async fksExportadas(schema: string | null, tabela: string): Promise<FkLinha[]> {
    const p: unknown[] = [tabela];
    return (await this.fks(`cr.relname = $1 and ${this.filtro(schema, 'nr', p)}`, p)).map(this.mapFk);
  }

  async indices(schema: string | null, tabela: string): Promise<IndiceLinha[]> {
    const p: unknown[] = [tabela];
    const r = await this.q(
      `select ic.relname as nome, i.indisunique as unico, a.attname as coluna
       from pg_index i join pg_class ic on ic.oid = i.indexrelid join pg_class c on c.oid = i.indrelid
       join pg_namespace n on n.oid = c.relnamespace
       cross join lateral unnest(i.indkey::int2[]) with ordinality as k(attnum, ord)
       left join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum and k.attnum > 0
       where c.relname = $1 and ${this.filtro(schema, 'n', p)} order by ic.relname, k.ord`, p);
    return r.map((x) => ({ nome: x.nome, unico: x.unico === true, coluna: s(x.coluna) }));
  }

  async definicaoView(schema: string | null, nome: string): Promise<string | null> {
    const p: unknown[] = [nome];
    const r = await this.q(
      `select pg_get_viewdef(c.oid, true) as def from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relname = $1 and c.relkind in ('v','m') and ${this.filtro(schema, 'n', p)} limit 1`, p);
    return r.length ? s(r[0].def) : null;
  }

  async sequenciasDetalhe(schema: string | null): Promise<SequenciaInfo[]> {
    const usa = !!schema;
    const r = await this.q(
      `select sequence_name, increment, start_value, minimum_value, maximum_value, cycle_option from information_schema.sequences${usa ? ' where sequence_schema = $1' : ''}`, usa ? [schema] : []);
    return r.map((x) => ({ nome: x.sequence_name, incremento: s(x.increment), inicio: s(x.start_value), minimo: s(x.minimum_value), maximo: s(x.maximum_value), ciclo: s(x.cycle_option) }));
  }

  async dominios(schema: string | null): Promise<DominioInfo[]> {
    const usa = !!schema;
    const r = await this.q(
      `select domain_name, data_type, character_maximum_length, domain_default from information_schema.domains${usa ? ' where domain_schema = $1' : ''}`, usa ? [schema] : []);
    return r.map((x) => ({ nome: x.domain_name, tipoBase: x.data_type, tamanho: x.character_maximum_length == null ? null : Number(x.character_maximum_length), padrao: s(x.domain_default) }));
  }

  async enums(schema: string | null): Promise<EnumInfo[]> {
    const usa = !!schema;
    const r = await this.q(
      `select t.typname, e.enumlabel from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
       ${usa ? 'where n.nspname = $1' : ''} order by t.typname, e.enumsortorder`, usa ? [schema] : []);
    const res: EnumInfo[] = [];
    for (const x of r) {
      const ult = res[res.length - 1];
      if (ult && ult.nome === x.typname) ult.valores.push(x.enumlabel);
      else res.push({ nome: x.typname, valores: [x.enumlabel] });
    }
    return res;
  }

  async rotinas(schema: string | null): Promise<RotinaInfo[]> {
    const usa = !!schema;
    const r = await this.q(
      `select routine_name, routine_type, data_type, routine_definition, external_language from information_schema.routines${usa ? ' where routine_schema = $1' : ''}`, usa ? [schema] : []);
    return r.map((x) => ({ nome: x.routine_name, tipo: s(x.routine_type), retorno: s(x.data_type), corpo: s(x.routine_definition), linguagem: s(x.external_language) }));
  }

  async gatilhos(schema: string | null, tabela: string): Promise<GatilhoLinha[]> {
    const usa = !!schema;
    const r = await this.q(
      `select trigger_name, event_manipulation, action_timing, action_orientation, action_statement, action_condition
       from information_schema.triggers where event_object_table = $1${usa ? ' and trigger_schema = $2' : ''}`, usa ? [tabela, schema] : [tabela]);
    return r.map((x) => ({ nome: x.trigger_name, evento: x.event_manipulation, momento: s(x.action_timing), orientacao: s(x.action_orientation), acao: s(x.action_statement), condicao: s(x.action_condition) }));
  }

  async particionamento(schema: string | null, tabela: string): Promise<Particionamento> {
    const vazio = { cauda: '', comando: '' };
    const usa = !!schema;
    const r = await this.q(
      `select (select pg_get_partkeydef(c.oid)) as chave_particao, (select pg_get_expr(c.relpartbound, c.oid)) as limite,
              (select p.relname from pg_inherits i join pg_class p on p.oid = i.inhparent where i.inhrelid = c.oid limit 1) as mae, c.relispartition
       from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relname = $1${usa ? ' and n.nspname = $2' : ''}`, usa ? [tabela, schema] : [tabela]);
    if (!r.length) return vazio;
    const { chave_particao: chave, limite, mae, relispartition } = r[0];
    const q = (n: string) => (schema ? schema + '.' + n : n);
    if (relispartition && mae && limite) return { cauda: '', comando: 'CREATE TABLE ' + q(tabela) + ' PARTITION OF ' + q(mae) + ' ' + limite + ';\n\n' };
    let cauda = '';
    if (mae && !relispartition) cauda += ' INHERITS (' + q(mae) + ')';
    if (chave && String(chave).trim()) cauda += ' PARTITION BY ' + chave;
    return { cauda, comando: '' };
  }

  async tiposEspaciais(schema: string | null, tabela: string): Promise<Record<string, string>> {
    const res: Record<string, string> = {};
    for (const [fonte, kind] of [['geometry_columns', 'geometry'], ['geography_columns', 'geography']]) {
      try {
        const usa = !!schema;
        const r = await this.q(`select f_${kind}_column as coluna, type, srid from ${fonte} where f_table_name = $1${usa ? ' and f_table_schema = $2' : ''}`, usa ? [tabela, schema] : [tabela]);
        for (const x of r) {
          let t = kind;
          if (x.type && String(x.type).trim()) {
            t += '(' + x.type;
            //# SRID 0 no PostGIS = "não definido": emitir 0 fixaria a ausência como se fosse escolha.
            if (Number(x.srid) > 0) t += ',' + x.srid;
            t += ')';
          }
          res[String(x.coluna).toLowerCase()] = t;
        }
      } catch { /* sem PostGIS: vale o tipo base */ }
    }
    return res;
  }

  async executar(sql: string, params: string[], limite: number): Promise<ResultadoSql> {
    const r = await this.cli.query({ text: sql, values: params, rowMode: 'array' });
    const res = Array.isArray(r) ? r[r.length - 1] : r;
    const colunas: string[] = (res.fields ?? []).map((f: { name: string }) => f.name);
    const todas: unknown[][] = colunas.length ? res.rows ?? [] : [];
    return {
      colunas,
      linhas: todas.slice(0, limite).map((l) => l.map(celula)),
      afetadas: colunas.length ? null : res.rowCount ?? null,
      truncado: todas.length > limite,
    };
  }

  async fechar(): Promise<void> {
    try { await this.cli.end(); } catch { /* já fechada */ }
  }
}
