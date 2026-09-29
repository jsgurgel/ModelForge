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
 * Só para testes no Node < 22.5 (sem `node:sqlite`): imita o pedaço de `DatabaseSync` que o ConexaoSqlite usa, em cima do
 * sql.js (SQLite em WebAssembly, devDependency). No Node >= 22.5 o teste usa o módulo nativo de verdade.
 */
export async function prepararShimSqlite(): Promise<void> {
  const init = require('sql.js');
  (globalThis as any).__sqlJs = await init();
}

export function criarShim() {
  class Stmt {
    constructor(private db: any, private sql: string) {}
    columns() {
      const st = this.db.prepare(this.sql);
      try { return st.getColumnNames().map((name: string) => ({ name })); } finally { st.free(); }
    }
    all(...p: unknown[]) {
      const st = this.db.prepare(this.sql);
      try {
        st.bind(p);
        const res: Record<string, unknown>[] = [];
        while (st.step()) res.push(st.getAsObject());
        return res;
      } finally { st.free(); }
    }
    run(...p: unknown[]) {
      this.db.run(this.sql, p);
      return { changes: this.db.getRowsModified() };
    }
  }
  class DatabaseSync {
    private db: any;
    constructor(_arquivo: string) { this.db = new (globalThis as any).__sqlJs.Database(); }
    prepare(sql: string) { return new Stmt(this.db, sql); }
    close() { this.db.close(); }
  }
  return { DatabaseSync };
}
