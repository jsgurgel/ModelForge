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

import * as fs from 'fs';
import * as path from 'path';
import { importarDdlLogico } from '../../geradores/importador';
import { gerarDdlDeObjeto, gerarDdlDoSchema, gerarFksQueApontamPara, introspeccionarEstruturado } from '../ddl-banco';
import { gerarScriptMigracao } from '../migracao';
import { ParamsConexao } from '../tipos';
import { prepararShimSqlite } from '../testes/node-sqlite-shim';
import { ConexaoSqlite } from './sqlite';

//# Node >= 22.5: usa o node:sqlite nativo. Antes disso, um shim sobre sql.js (só nos testes) - `virtual` porque o módulo não existe.
jest.mock('node:sqlite', () => {
  try { return jest.requireActual('node:sqlite'); } catch { return require('../testes/node-sqlite-shim').criarShim(); }
}, { virtual: true });

const DIR = path.resolve(__dirname, '../../../test/fixtures-banco');
function nativo(): boolean {
  try { jest.requireActual('node:sqlite'); return true; } catch { return false; }
}
const P: ParamsConexao = { tipo: 'sqlite', host: '', porta: 0, database: ':memory:', usuario: '', senha: '', confiarCertificado: false, tls: false };

/** SQLite não tem ALTER TABLE ADD CONSTRAINT: leva as FKs para dentro do CREATE TABLE. */
function sqliteCompativel(ddl: string): string[] {
  const creates: string[] = [];
  const fks = new Map<string, string[]>();
  for (const cmd of ddl.split(/;\s*\n?/)) {
    const t = cmd.trim();
    if (!t) continue;
    if (/^ALTER TABLE/i.test(t)) {
      const m = /^ALTER TABLE (\w+) ADD CONSTRAINT (\w+) (FOREIGN KEY[\s\S]*)$/i.exec(t);
      if (m) fks.set(m[1], [...(fks.get(m[1]) ?? []), `CONSTRAINT ${m[2]} ${m[3]}`]);
    } else creates.push(t);
  }
  return creates.map((c) => {
    const m = /^CREATE TABLE (\w+) \(([\s\S]*)\)$/i.exec(c);
    return m && fks.has(m[1]) ? `CREATE TABLE ${m[1]} (${m[2]}, ${fks.get(m[1])!.join(', ')})` : c;
  });
}

describe('SQLite (node:sqlite; shim sql.js no Node < 22.5) contra as fixtures de referência', () => {
  beforeAll(async () => { if (!nativo()) await prepararShimSqlite(); });
  const arquivos = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.startsWith('migracao_')).sort() : [];

  it.each(arquivos)('%s: catálogo, DDL e migração idênticos à referência', async (arq) => {
    const f = JSON.parse(fs.readFileSync(path.join(DIR, arq), 'utf8'));
    const con = await ConexaoSqlite.abrir(P);
    try {
      for (const cmd of sqliteCompativel(f.ddlBanco)) await con.executar(cmd, [], 10);
      expect(await introspeccionarEstruturado(con, '')).toEqual(f.estruturado);
      expect(await gerarDdlDoSchema(con, '')).toBe(f.importDdl);
      const { diagrama } = importarDdlLogico(f.ddlModelo, 'modelo_' + f.entrada);
      expect(gerarScriptMigracao(diagrama, await introspeccionarEstruturado(con, ''), f.database)).toBe(f.migracao);
    } finally {
      await con.fechar();
    }
  });

  it('executar: SELECT com parâmetro, DML com afetadas, limite e truncamento', async () => {
    const con = await ConexaoSqlite.abrir(P);
    try {
      await con.executar('CREATE TABLE t (id INTEGER PRIMARY KEY, nome TEXT)', [], 10);
      const ins = await con.executar('INSERT INTO t (nome) VALUES (?), (?), (?)', ['a', 'b', 'c'], 10);
      expect(ins.afetadas).toBe(3);
      const sel = await con.executar('SELECT id, nome FROM t WHERE nome <> ? ORDER BY id', ['b'], 10);
      expect(sel.colunas).toEqual(['id', 'nome']);
      expect(sel.linhas).toEqual([[1, 'a'], [3, 'c']]);
      const corte = await con.executar('SELECT * FROM t', [], 2);
      expect(corte.linhas.length).toBe(2);
      expect(corte.truncado).toBe(true);
      await expect(con.executar('SELECT * FROM nao_existe', [], 10)).rejects.toThrow();
    } finally {
      await con.fechar();
    }
  });

  it('explorador: views, índices, FKs de entrada e DDL de objeto', async () => {
    const con = await ConexaoSqlite.abrir(P);
    try {
      for (const c of [
        'CREATE TABLE cliente (id INTEGER NOT NULL, nome TEXT UNIQUE, PRIMARY KEY (id))',
        'CREATE TABLE pedido (id INTEGER PRIMARY KEY, cliente_id INTEGER, CONSTRAINT fk_p FOREIGN KEY (cliente_id) REFERENCES cliente (id))',
        'CREATE INDEX ix_pedido_cli ON pedido (cliente_id)',
        'CREATE VIEW v_cli AS SELECT id, nome FROM cliente',
      ]) await con.executar(c, [], 10);
      const objs = await con.objetos();
      expect(objs.map((o) => `${o.tipo}:${o.nome}`)).toEqual(['TABELA:cliente', 'TABELA:pedido', 'VIEW:v_cli']);
      const ddlView = await gerarDdlDeObjeto(con, null, 'v_cli', 'VIEW');
      expect(ddlView).toBe('CREATE VIEW v_cli AS\nSELECT id, nome FROM cliente;\n\n');
      const ddlCliente = await gerarDdlDeObjeto(con, null, 'cliente', 'TABELA');
      expect(ddlCliente).toContain('CREATE UNIQUE INDEX cliente_nome_key ON cliente (nome);');
      expect(await gerarFksQueApontamPara(con, null, 'cliente', new Set(['pedido']))).toBe(
        'ALTER TABLE pedido ADD CONSTRAINT fk_p FOREIGN KEY (cliente_id) REFERENCES cliente (id);\n',
      );
      expect(await gerarFksQueApontamPara(con, null, 'cliente', new Set(['outra']))).toBe('');
    } finally {
      await con.fechar();
    }
  });
});
