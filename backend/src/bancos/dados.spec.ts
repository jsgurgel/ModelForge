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

/** Testes dos builders puros (por dialeto) e do CRUD real no SQLite. */
import { gerarCountDados, gerarDelete, gerarDuplicar, gerarInsert, gerarSelectDados, gerarUpdate, validarColunas, validarIdentificador, consultarDados } from './dados';
import { DialetoFalso } from './dialeto-falso';
import { ParamsConexao } from './tipos';
import { prepararShimSqlite } from './testes/node-sqlite-shim';
import { ConexaoSqlite } from './dialetos/sqlite';

function nativo(): boolean {
  try { jest.requireActual('node:sqlite'); return true; } catch { return false; }
}

jest.mock('node:sqlite', () => {
  try { return jest.requireActual('node:sqlite'); } catch { return require('./testes/node-sqlite-shim').criarShim(); }
}, { virtual: true });

const P: ParamsConexao = { tipo: 'sqlite', host: '', porta: 0, database: ':memory:', usuario: '', senha: '', confiarCertificado: false, tls: false };

describe('validação de identificadores', () => {
  it('aceita nome simples e com schema', () => {
    expect(validarIdentificador('clientes', 'tabela')).toBe('clientes');
    expect(validarIdentificador('public.clientes', 'tabela')).toBe('public.clientes');
  });
  it('rejeita SQL injection e nomes vazios', () => {
    expect(() => validarIdentificador('clientes; DROP TABLE x', 'tabela')).toThrow();
    expect(() => validarIdentificador('', 'tabela')).toThrow();
    expect(() => validarIdentificador('nome com espaço', 'tabela')).toThrow();
    expect(() => validarIdentificador('1abc', 'tabela')).toThrow();
  });
  it('validarColunas exige lista não vazia de nomes válidos', () => {
    expect(validarColunas(['id', 'nome'], 'colunas')).toEqual(['id', 'nome']);
    expect(() => validarColunas([], 'colunas')).toThrow();
    expect(() => validarColunas(['ok', 'ruim nome'], 'colunas')).toThrow();
  });
});

describe('builders de SELECT por dialeto', () => {
  const base = { tabela: 'clientes', pagina: 2, porPagina: 50 };

  it('PostgreSQL: LIMIT/OFFSET com $n e ILIKE', () => {
    const { sql, params } = gerarSelectDados('postgresql', { ...base, filtro: [{ coluna: 'nome', valor: 'jo' }] }, '');
    expect(sql).toBe('SELECT * FROM clientes WHERE nome ILIKE $1 LIMIT $2 OFFSET $3');
    expect(params).toEqual(['%jo%', '50', '100']);
  });

  it('MySQL: LIMIT/OFFSET com ? e LIKE', () => {
    const { sql, params } = gerarSelectDados('mysql', { ...base }, '');
    expect(sql).toBe('SELECT * FROM clientes LIMIT ? OFFSET ?');
    expect(params).toEqual(['50', '100']);
  });

  it('SQL Server: OFFSET/FETCH exige ORDER BY', () => {
    const { sql } = gerarSelectDados('sqlserver', { ...base, ordenar: [{ coluna: 'id' }] }, '');
    expect(sql).toBe('SELECT * FROM clientes ORDER BY id OFFSET @p1 ROWS FETCH NEXT @p2 ROWS ONLY');
  });

  it('SQL Server sem ordenação: ORDER BY (SELECT NULL)', () => {
    const { sql } = gerarSelectDados('sqlserver', { ...base }, '');
    expect(sql).toContain('ORDER BY (SELECT NULL)');
  });

  it('SQLite: LIMIT/OFFSET com ?', () => {
    const { sql, params } = gerarSelectDados('sqlite', { ...base, filtro: [{ coluna: 'nome', valor: 'a' }] }, '');
    expect(sql).toBe('SELECT * FROM clientes WHERE nome LIKE ? LIMIT ? OFFSET ?');
    expect(params).toEqual(['%a%', '50', '100']);
  });

  it('count com os mesmos filtros', () => {
    const { sql, params } = gerarCountDados('postgresql', { ...base, filtro: [{ coluna: 'nome', valor: 'x' }] });
    expect(sql).toBe('SELECT COUNT(*) AS total FROM clientes WHERE nome ILIKE $1');
    expect(params).toEqual(['%x%']);
  });

  it('ordenar DESC', () => {
    const { sql } = gerarSelectDados('postgresql', { ...base, ordenar: [{ coluna: 'id', desc: true }] }, '');
    expect(sql).toContain('ORDER BY id DESC');
  });
});

describe('builders de CRUD', () => {
  it('INSERT', () => {
    const { sql } = gerarInsert('postgresql', 'clientes', ['nome', 'email'], []);
    expect(sql).toBe('INSERT INTO clientes (nome, email) VALUES ($1, $2)');
  });
  it('UPDATE com WHERE por PK', () => {
    const { sql } = gerarUpdate('postgresql', 'clientes', ['nome'], ['id']);
    expect(sql).toBe('UPDATE clientes SET nome = $1 WHERE id = $2');
  });
  it('UPDATE sem PK rejeita', () => {
    expect(() => gerarUpdate('postgresql', 'clientes', ['nome'], [])).toThrow(/chave primária/);
  });
  it('DELETE por PK', () => {
    const { sql } = gerarDelete('mysql', 'clientes', ['id']);
    expect(sql).toBe('DELETE FROM clientes WHERE id = ?');
  });
  it('duplicar copia só colunas fora da PK', () => {
    const { sql } = gerarDuplicar('postgresql', 'clientes', ['id', 'nome', 'email'], ['id']);
    expect(sql).toBe('INSERT INTO clientes (nome, email) SELECT nome, email FROM clientes WHERE id = $1');
  });
  it('duplicar com PK composta', () => {
    const { sql } = gerarDuplicar('sqlite', 'itens', ['a', 'b', 'v'], ['a', 'b']);
    expect(sql).toBe('INSERT INTO itens (v) SELECT v FROM itens WHERE a = ? AND b = ?');
  });
});

describe('CRUD real no SQLite', () => {
  beforeAll(async () => { if (!nativo()) await prepararShimSqlite(); });

  it('consultarDados pagina e conta', async () => {
    const con = await ConexaoSqlite.abrir(P);
    try {
      await con.executar('CREATE TABLE clientes (id INTEGER PRIMARY KEY, nome TEXT)', [], 10);
      for (let i = 1; i <= 7; i++) await con.executar(`INSERT INTO clientes VALUES (${i}, 'nome${i}')`, [], 10);
      const pag1 = await consultarDados(con, { tabela: 'clientes', pagina: 0, porPagina: 3 });
      expect(pag1.linhas.length).toBe(3);
      expect(pag1.total).toBe(7);
      const pag3 = await consultarDados(con, { tabela: 'clientes', pagina: 2, porPagina: 3 });
      expect(pag3.linhas.length).toBe(1);
    } finally { await con.fechar(); }
  });

  it('inserir, atualizar, excluir e duplicar', async () => {
    const con = await ConexaoSqlite.abrir(P);
    try {
      await con.executar('CREATE TABLE pessoas (id INTEGER PRIMARY KEY, nome TEXT, email TEXT)', [], 10);
      const { inserirLinha } = await import('./dados');
      const ins = await inserirLinha(con, 'pessoas', ['nome', 'email'], ['Ana', 'ana@x.com']);
      expect(ins.erro).toBeUndefined();
      const sel = await con.executar('SELECT id, nome, email FROM pessoas', [], 10);
      const id = String(sel.linhas[0][0]);
      const { atualizarLinha, excluirLinha, duplicarLinha } = await import('./dados');
      const upd = await atualizarLinha(con, 'pessoas', ['nome'], ['id'], ['Ana Maria'], [id], []);
      expect(upd.erro).toBeUndefined();
      const dup = await duplicarLinha(con, 'pessoas', ['id', 'nome', 'email'], ['id'], [id]);
      expect(dup.erro).toBeUndefined();
      const sel2 = await con.executar('SELECT COUNT(*) FROM pessoas', [], 10);
      expect(String(sel2.linhas[0][0])).toBe('2');
      const del = await excluirLinha(con, 'pessoas', ['id'], [id]);
      expect(del.erro).toBeUndefined();
      const sel3 = await con.executar('SELECT COUNT(*) FROM pessoas', [], 10);
      expect(String(sel3.linhas[0][0])).toBe('1');
    } finally { await con.fechar(); }
  });
});

describe('filtros com valor contendo aspas (injection)', () => {
  it('valor vai por parâmetro, não entra no SQL', () => {
    const { sql } = gerarSelectDados('postgresql', { tabela: 't', pagina: 0, porPagina: 10, filtro: [{ coluna: 'nome', valor: "'; DROP TABLE clientes; --" }] }, '');
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).toBe('SELECT * FROM t WHERE nome ILIKE $1 LIMIT $2 OFFSET $3');
  });
});