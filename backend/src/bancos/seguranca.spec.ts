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

import { celula, hostPermitido, mensagemSegura, validarParams, validarParamsSql } from './seguranca';
import { dividirComandos, executarScript } from './sql-exec';
import { DialetoFalso } from './dialeto-falso';
import { padraoMysql } from './dialetos/mysql';
import { tipoSqlServer } from './dialetos/sqlserver';
import { corpoDeView } from './dialetos/base';

const base = { tipo: 'postgresql', host: 'db.local', porta: 5432, database: 'd', usuario: 'u', senha: 'segredo123' };

describe('validação de conexão', () => {
  it('aceita e normaliza', () => {
    expect(validarParams({ ...base, porta: '5433' })).toMatchObject({ host: 'db.local', porta: 5433, tls: false });
    expect(validarParams({ ...base, tipo: 'mysql', porta: undefined })).toMatchObject({ porta: 3306, tls: true });
  });
  it.each([
    [{ ...base, host: 'a b' }], [{ ...base, host: '' }], [{ ...base, porta: 70000 }], [{ ...base, tipo: 'oracle' }],
    [{ ...base, senha: 5 }], [{ ...base, database: { x: 1 } }], [null], [{ ...base, usuario: '' }],
  ])('rejeita %j', (c) => expect(() => validarParams(c)).toThrow());
  it('allowlist de hosts', () => {
    expect(hostPermitido('x.com', [])).toBe(true);
    expect(hostPermitido('a.corp', ['*.corp'])).toBe(true);
    expect(hostPermitido('corp', ['*.corp'])).toBe(false);
    expect(hostPermitido('evil.com', ['db.local'])).toBe(false);
    process.env.BANCO_HOSTS_PERMITIDOS = 'db.local';
    try { expect(() => validarParams({ ...base, host: 'outro' })).toThrow(/não permitido/); } finally { delete process.env.BANCO_HOSTS_PERMITIDOS; }
  });
  it('SQLite respeita BANCO_SQLITE_DIR', () => {
    process.env.BANCO_SQLITE_DIR = '/tmp/dados';
    try {
      expect(() => validarParams({ tipo: 'sqlite', database: '../etc/passwd' })).toThrow();
      expect(validarParams({ tipo: 'sqlite', database: 'a.db' }).database).toBe('/tmp/dados/a.db');
    } finally { delete process.env.BANCO_SQLITE_DIR; }
  });
  it('params SQL só aceitam textos', () => {
    expect(validarParamsSql(['a'])).toEqual(['a']);
    expect(() => validarParamsSql([1])).toThrow();
    expect(() => validarParamsSql({})).toThrow();
    expect(() => validarParamsSql([['a']])).toThrow();
  });
  it('mensagens não vazam senha', () => {
    expect(mensagemSegura(new Error('falha com segredo123 e mongodb://u:pw@h/'), ['segredo123'])).toBe('falha com *** e mongodb://***@h/');
  });
  it('células grandes e binárias são limitadas', () => {
    expect(celula(10n)).toBe('10');
    expect(celula(Buffer.from('ab'))).toBe('<binário 2 bytes>');
    expect((celula('x'.repeat(20000)) as string).length).toBeLessThan(10010);
  });
});

describe('dividir comandos', () => {
  it('respeita aspas, comentários e dollar-quoting', () => {
    expect(dividirComandos("select ';'; -- a;b\nselect 2; /* ; */ select 3")).toEqual(["select ';'", '-- a;b\nselect 2', '/* ; */ select 3']);
    expect(dividirComandos('create function f() as $$ a; b; $$ language sql; select 1')).toEqual(['create function f() as $$ a; b; $$ language sql', 'select 1']);
    expect(dividirComandos('select "a;b"; ;;')).toEqual(['select "a;b"']);
  });
  it('GO no SQL Server', () => {
    expect(dividirComandos('select 1\nGO\nselect 2\ngo\n', 'sqlserver')).toEqual(['select 1', 'select 2']);
  });
});

describe('executarScript', () => {
  const falso = (falha?: string) => {
    const d = new DialetoFalso({ objetos: [], colunas: {}, pk: {}, fks: {}, indices: {} });
    (d as any).executar = async (sql: string, p: string[]) => {
      if (falha && sql.includes(falha)) throw new Error('erro em ' + sql);
      return { colunas: ['x'], linhas: [[sql, p.join(',')]], afetadas: null, truncado: false };
    };
    return d;
  };
  it('para no primeiro erro', async () => {
    const r = await executarScript(falso('b'), 'a; b; c');
    expect(r.resultados.map((x) => x.erro ?? 'ok')).toEqual(['ok', 'erro em b']);
    expect(r.parou).toBe(true);
  });
  it('continua no erro e passa parâmetros por comando', async () => {
    const r = await executarScript(falso('b'), 'a; b; c', { continuarNoErro: true, paramsPorComando: [['1'], [], ['3']] });
    expect(r.resultados.length).toBe(3);
    expect(r.resultados[2].linhas[0]).toEqual(['c', '3']);
  });
});

describe('ajudas de dialeto', () => {
  it('MySQL: aspas só onde falta', () => {
    expect(padraoMysql('abc', 'varchar')).toBe("'abc'");
    expect(padraoMysql('0', 'int')).toBe('0');
    expect(padraoMysql('CURRENT_TIMESTAMP', 'timestamp')).toBe('CURRENT_TIMESTAMP');
    expect(padraoMysql("'x'", 'varchar')).toBe("'x'");
  });
  it('SQL Server: tipos', () => {
    expect(tipoSqlServer({ dt: 'nvarchar', len: -1, p: null, s: null })).toBe('nvarchar(max)');
    expect(tipoSqlServer({ dt: 'decimal', len: null, p: 10, s: 2 })).toBe('decimal(10,2)');
    expect(tipoSqlServer({ dt: 'int', len: null, p: 10, s: 0 })).toBe('int');
  });
  it('corpo de view', () => {
    expect(corpoDeView('CREATE VIEW dbo.v AS\nSELECT 1')).toBe('SELECT 1');
    expect(corpoDeView('create view [v] (a) with schemabinding as select 1')).toBe('select 1');
    expect(corpoDeView('SELECT 1')).toBe('SELECT 1');
  });
});
