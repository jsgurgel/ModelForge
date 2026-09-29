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
 * Integração com servidores reais: cada bloco só roda se a variável de ambiente existir (JSON com os dados de conexão).
 *   BANCO_TESTE_POSTGRESQL='{"host":"localhost","porta":5432,"database":"t","usuario":"u","senha":"s"}'
 *   BANCO_TESTE_MYSQL=...   BANCO_TESTE_SQLSERVER=...   BANCO_TESTE_MONGODB='{"uri":"mongodb://localhost:27017","database":"t"}'
 * Cria e remove tabelas mf_teste_* (use um banco descartável).
 */
import { abrirConexao } from './dialetos';
import { gerarDdlDoSchema, introspeccionarEstruturado } from './ddl-banco';
import { comCliente, introspeccionarNoSql, listarColecoes } from './nosql';
import { validarParams } from './seguranca';

const env = (n: string) => (process.env[n] ? JSON.parse(process.env[n]!) : null);

for (const tipo of ['postgresql', 'mysql', 'sqlserver'] as const) {
  const cfg = env('BANCO_TESTE_' + tipo.toUpperCase());
  (cfg ? describe : describe.skip)(`integração ${tipo}`, () => {
    it('cria, introspecta, gera DDL e executa SQL parametrizado', async () => {
      const con = await abrirConexao(validarParams({ tipo, tls: cfg.tls ?? false, confiarCertificado: true, ...cfg }));
      const schema = tipo === 'postgresql' ? cfg.schema ?? 'public' : tipo === 'sqlserver' ? cfg.schema ?? 'dbo' : '';
      try {
        await con.executar('DROP TABLE IF EXISTS mf_teste_b', [], 1).catch(() => undefined);
        await con.executar('DROP TABLE IF EXISTS mf_teste_a', [], 1).catch(() => undefined);
        await con.executar('CREATE TABLE mf_teste_a (id INT NOT NULL PRIMARY KEY, nome VARCHAR(50))', [], 1);
        await con.executar('CREATE TABLE mf_teste_b (id INT NOT NULL PRIMARY KEY, a_id INT, CONSTRAINT fk_mf_teste FOREIGN KEY (a_id) REFERENCES mf_teste_a (id))', [], 1);
        const tabelas = await introspeccionarEstruturado(con, schema);
        const b = tabelas.find((t) => t.nome === 'mf_teste_b')!;
        expect(b.pk).toEqual(['id']);
        expect(b.fks[0]).toMatchObject({ colunasLocais: ['a_id'], tabelaRef: 'mf_teste_a', colunasRef: ['id'] });
        expect(await gerarDdlDoSchema(con, schema)).toContain('CREATE TABLE ' + (schema ? schema + '.' : '') + 'mf_teste_a');
        const ph = tipo === 'postgresql' ? '$1' : tipo === 'sqlserver' ? '@p1' : '?';
        await con.executar(`INSERT INTO mf_teste_a (id, nome) VALUES (1, ${ph})`, ['x'], 1);
        const r = await con.executar('SELECT id, nome FROM mf_teste_a', [], 10);
        expect(r.colunas.map((c) => c.toLowerCase())).toEqual(['id', 'nome']);
        expect(r.linhas.length).toBe(1);
      } finally {
        await con.executar('DROP TABLE IF EXISTS mf_teste_b', [], 1).catch(() => undefined);
        await con.executar('DROP TABLE IF EXISTS mf_teste_a', [], 1).catch(() => undefined);
        await con.fechar();
      }
    }, 60000);
  });
}

const mongo = env('BANCO_TESTE_MONGODB');
(mongo ? describe : describe.skip)('integração MongoDB', () => {
  it('lista e infere campos', async () => {
    await comCliente(mongo.uri, (c) => c.db(mongo.database).collection('mf_teste').insertOne({ nome: 'a', n: 1, e: { x: 1 } }));
    try {
      expect(await listarColecoes(mongo.uri, mongo.database)).toContain('mf_teste');
      const r = await introspeccionarNoSql(mongo.uri, mongo.database, 10, ['mf_teste']);
      expect(r[0].campos.map((c) => c.tipo)).toEqual(['objectid', 'string', 'number', 'embedded']);
    } finally {
      await comCliente(mongo.uri, (c) => c.db(mongo.database).collection('mf_teste').drop());
    }
  }, 30000);
});
