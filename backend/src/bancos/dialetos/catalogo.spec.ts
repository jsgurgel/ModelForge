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

//# Teste end-to-end do catálogo usado pelo autocomplete: cria tabelas reais num SQLite
//# em memória e confere o formato exato que o frontend consome.
import * as fs from 'fs';
import * as path from 'path';
import { EntradaCatalogo, lerCatalogo } from '../catalogo';
import { ParamsConexao } from '../tipos';
import { prepararShimSqlite } from '../testes/node-sqlite-shim';
import { ConexaoSqlite } from './sqlite';

jest.mock('node:sqlite', () => {
  try { return jest.requireActual('node:sqlite'); } catch { return require('../testes/node-sqlite-shim').criarShim(); }
}, { virtual: true });

function nativo(): boolean {
  try { jest.requireActual('node:sqlite'); return true; } catch { return false; }
}

const P: ParamsConexao = { tipo: 'sqlite', host: '', porta: 0, database: ':memory:', usuario: '', senha: '', confiarCertificado: false, tls: false };

describe('catálogo para autocomplete (SQLite real)', () => {
  beforeAll(async () => { if (!nativo()) await prepararShimSqlite(); });

  it('devolve tabelas com colunas nomeadas para o autocomplete do frontend', async () => {
    const con = await ConexaoSqlite.abrir(P);
    try {
      await con.executar('CREATE TABLE clientes (id INTEGER PRIMARY KEY, nome TEXT NOT NULL, email TEXT)', [], 10);
      await con.executar('CREATE TABLE pedidos (id INTEGER PRIMARY KEY, cliente_id INTEGER, valor REAL)', [], 10);
      const cat = await lerCatalogo(con, '');
      expect(cat.schemas).toEqual([]);
      const colunasClientes = cat.objetos.filter((e: EntradaCatalogo) => e.tipo === 'coluna' && e.tabela === 'clientes');
      expect(colunasClientes.map((c: EntradaCatalogo) => c.nome).sort()).toEqual(['email', 'id', 'nome']);
      expect(colunasClientes.find((c: EntradaCatalogo) => c.nome === 'id')?.tipoColuna).toBe('INTEGER');
      const tabelas = cat.objetos.filter((e: EntradaCatalogo) => e.tipo === 'tabela');
      expect(tabelas.map((t: EntradaCatalogo) => t.nome).sort()).toEqual(['clientes', 'pedidos']);
    } finally {
      await con.fechar();
    }
  });
});