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

import { existsSync } from 'fs';
import { celula } from '../seguranca';
import { ColunaInfo, FkLinha, IndiceLinha, ItemBanco, ParamsConexao, ResultadoSql } from '../tipos';
import { ConexaoBase, corpoDeView, s } from './base';

/** `node:sqlite` só existe no Node >= 22.5 (a imagem Docker é node:26). Em Node mais antigo, indisponível. */
export function sqliteDisponivel(): boolean {
  try {
    require('node:sqlite');
    return true;
  } catch {
    return false;
  }
}

/** SQLite via `node:sqlite` embutido do Node (sem dependência nativa). O "database" é o caminho do arquivo no servidor. */
export class ConexaoSqlite extends ConexaoBase {
  readonly tipo = 'sqlite' as const;
  readonly usaSchema = false;

  private constructor(private db: any) { super(); }

  static async abrir(p: ParamsConexao): Promise<ConexaoSqlite> {
    if (!sqliteDisponivel()) throw new Error('SQLite exige Node 22.5 ou superior neste servidor (node:sqlite).');
    //# Não cria arquivo por engano (o driver criaria um banco vazio no caminho digitado).
    if (p.database !== ':memory:' && !existsSync(p.database)) throw new Error('arquivo SQLite não encontrado no servidor');
    const { DatabaseSync } = require('node:sqlite');
    return new ConexaoSqlite(new DatabaseSync(p.database));
  }

  private q(sql: string, valores: unknown[] = []): Record<string, any>[] {
    return this.db.prepare(sql).all(...valores) as Record<string, any>[];
  }

  async schemas(): Promise<string[]> { return ['']; }

  async objetos(): Promise<ItemBanco[]> {
    const r = this.q(`select name as nome, type as t from sqlite_master where type in ('table','view') and name not like 'sqlite\\_%' escape '\\' order by lower(name)`);
    return r.map((x) => ({ nome: x.nome, tipo: x.t === 'view' ? 'VIEW' : 'TABELA' }));
  }

  private info(tabela: string) {
    return this.q('select cid, name, type, "notnull" as nn, dflt_value as padrao, pk from pragma_table_info(?)', [tabela]);
  }

  async colunas(_s: string | null, tabela: string): Promise<ColunaInfo[]> {
    return this.info(tabela).map((x) => ({ nome: x.name, tipo: String(x.type ?? ''), nullable: Number(x.nn) === 0, padrao: s(x.padrao) }));
  }

  async chavePrimaria(_s: string | null, tabela: string): Promise<string[]> {
    return this.info(tabela).filter((x) => Number(x.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk)).map((x) => x.name);
  }

  /** Nomes de FK declarados no CREATE TABLE ("CONSTRAINT nome FOREIGN KEY (a, b)"): o PRAGMA não os informa. */
  private nomesDeFk(tabela: string): Map<string, string> {
    const m = new Map<string, string>();
    const r = this.q(`select sql from sqlite_master where type = 'table' and name = ?`, [tabela]);
    const ddl = r.length ? String(r[0].sql ?? '') : '';
    const re = /constraint\s+(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|(\w+))\s+foreign\s+key\s*\(([^)]*)\)/gi;
    let x: RegExpExecArray | null;
    while ((x = re.exec(ddl))) {
      const cols = x[5].split(',').map((c) => c.trim().replace(/^["`\[]|["`\]]$/g, '').toLowerCase()).join(',');
      m.set(cols, x[1] ?? x[2] ?? x[3] ?? x[4]);
    }
    return m;
  }

  private fkDe(tabela: string): FkLinha[] {
    const r = this.q('select id, seq, "table" as tabela_ref, "from" as de, "to" as para from pragma_foreign_key_list(?) order by id, seq', [tabela]);
    const colsDoId = new Map<number, string[]>();
    for (const x of r) colsDoId.set(Number(x.id), [...(colsDoId.get(Number(x.id)) ?? []), String(x.de).toLowerCase()]);
    const nomes = this.nomesDeFk(tabela);
    return r.map((x) => {
      let colunaRef = s(x.para);
      //# "REFERENCES t" sem colunas aponta para a PK da tabela referenciada.
      if (!colunaRef) colunaRef = this.info(x.tabela_ref).filter((c) => Number(c.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk))[Number(x.seq)]?.name ?? '';
      const nome = nomes.get(colsDoId.get(Number(x.id))!.join(',')) ?? null;
      return { nome, tabelaLocal: tabela, schemaLocal: null, colunaLocal: x.de, tabelaRef: x.tabela_ref, schemaRef: null, colunaRef } as FkLinha;
    });
  }

  async fksImportadas(_s: string | null, tabela: string): Promise<FkLinha[]> {
    return this.fkDe(tabela);
  }

  async fksExportadas(_s: string | null, tabela: string): Promise<FkLinha[]> {
    const alvo = tabela.toLowerCase();
    const todas = this.q(`select name from sqlite_master where type = 'table' and name not like 'sqlite\\_%' escape '\\'`);
    return todas.flatMap((t) => this.fkDe(t.name)).filter((f) => f.tabelaRef.toLowerCase() === alvo);
  }

  async indices(_s: string | null, tabela: string): Promise<IndiceLinha[]> {
    const res: IndiceLinha[] = [];
    for (const ix of this.q('select name, "unique" as u, origin from pragma_index_list(?)', [tabela])) {
      if (ix.origin === 'pk') continue;
      //# Índice de UNIQUE inline recebe nome automático (sqlite_autoindex_...): usa um nome legível.
      const cols = this.q('select name from pragma_index_info(?) order by seqno', [ix.name]);
      const nome = String(ix.name).startsWith('sqlite_autoindex_') ? `${tabela}_${cols.map((c) => c.name).join('_')}_key` : ix.name;
      for (const c of cols) res.push({ nome, unico: Number(ix.u) === 1, coluna: s(c.name) });
    }
    return res;
  }

  async definicaoView(_s: string | null, nome: string): Promise<string | null> {
    const r = this.q(`select sql from sqlite_master where type = 'view' and name = ?`, [nome]);
    return r.length ? corpoDeView(s(r[0].sql)) : null;
  }

  async executar(sql: string, params: string[], limite: number): Promise<ResultadoSql> {
    const st = this.db.prepare(sql);
    //# StatementSync.columns() só existe a partir do Node 22.16; antes disso, decide pelo tipo do comando.
    const cols: { name: string }[] = typeof st.columns === 'function' ? st.columns() : [];
    const devolveLinhas = typeof st.columns === 'function' ? cols.length > 0 : /^\s*(select|with|pragma|values|explain)\b/i.test(sql);
    if (devolveLinhas) {
      if (typeof st.columns !== 'function') {
        const linhas = st.all(...params) as Record<string, unknown>[];
        const nomes = linhas.length ? Object.keys(linhas[0]) : [];
        return { colunas: nomes, linhas: linhas.slice(0, limite).map((l) => nomes.map((n) => celula(l[n]))), afetadas: null, truncado: linhas.length > limite };
      }
      const linhas = st.all(...params) as Record<string, unknown>[];
      const nomes = cols.map((c) => c.name);
      return { colunas: nomes, linhas: linhas.slice(0, limite).map((l) => nomes.map((n) => celula(l[n]))), afetadas: null, truncado: linhas.length > limite };
    }
    const r = st.run(...params);
    return { colunas: [], linhas: [], afetadas: Number(r.changes), truncado: false };
  }

  async fechar(): Promise<void> {
    try { this.db.close(); } catch { /* já fechada */ }
  }
}
