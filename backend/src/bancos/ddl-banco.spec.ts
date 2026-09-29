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

import { DialetoFalso } from './dialeto-falso';
import { gerarDdlDoSchema, gerarDdlSelecionados } from './ddl-banco';

/** Dialeto de PostgreSQL falso, com os extras (sequences, enums, rotinas, gatilhos, partições) que o SQLite não tem. */
function pg(extra: Record<string, unknown> = {}) {
  return new DialetoFalso(
    {
      objetos: [{ nome: 't', tipo: 'TABELA' }, { nome: 'filha', tipo: 'TABELA' }, { nome: 'v', tipo: 'VIEW' }, { nome: 'mv', tipo: 'VIEW_MATERIALIZADA' }],
      colunas: { t: [{ nome: 'id', tipo: 'integer', nullable: false, padrao: "nextval('s'::regclass)" }, { nome: 'geom', tipo: 'geometry', nullable: true, padrao: null }], filha: [], v: [], mv: [] },
      pk: { t: ['id'] }, fks: { t: [{ nome: null, tabelaLocal: 't', schemaLocal: 'app', colunaLocal: 'id', tabelaRef: 'o', schemaRef: 'outro', colunaRef: 'id' }] },
      indices: { t: [{ nome: 't_pkey', unico: true, coluna: 'id' }, { nome: 'ix', unico: false, coluna: 'geom' }] },
      views: { v: 'SELECT 1', mv: 'SELECT 2;' },
    },
    'postgresql', true,
    {
      schemas: async () => ['app'],
      sequenciasDetalhe: async () => [{ nome: 's', incremento: '1', inicio: '1', minimo: '1', maximo: '9', ciclo: 'YES' }],
      dominios: async () => [{ nome: 'd', tipoBase: 'character varying', tamanho: 10, padrao: "'x'" }],
      enums: async () => [{ nome: 'cor', valores: ["a'b", 'c'] }],
      tiposEspaciais: async () => ({ geom: 'geometry(Point,4326)' }),
      particionamento: async (_s: string | null, t: string) => (t === 'filha' ? { cauda: '', comando: 'CREATE TABLE app.filha PARTITION OF app.t FOR VALUES IN (1);\n\n' } : { cauda: ' PARTITION BY RANGE (id)', comando: '' }),
      rotinas: async () => [{ nome: 'f', tipo: 'FUNCTION', retorno: 'integer', corpo: ' select 1 ', linguagem: 'SQL' }, { nome: 'c', tipo: 'FUNCTION', retorno: null, corpo: null, linguagem: null }],
      gatilhos: async (_s: string | null, t: string) => (t === 't' ? [
        { nome: 'g', evento: 'INSERT', momento: 'BEFORE', orientacao: 'ROW', acao: 'EXECUTE FUNCTION f()', condicao: null },
        { nome: 'g', evento: 'UPDATE', momento: 'BEFORE', orientacao: 'ROW', acao: 'EXECUTE FUNCTION f()', condicao: null },
      ] : []),
      ...extra,
    } as any,
  );
}

describe('DDL do banco (extras de PostgreSQL, dialeto falso)', () => {
  it('ordem e formato de referência', async () => {
    expect(await gerarDdlDoSchema(pg(), '')).toBe(
      `CREATE DOMAIN app.d AS character varying(10) DEFAULT 'x';
CREATE TYPE cor AS ENUM ('a''b', 'c');

CREATE SEQUENCE app.s INCREMENT BY 1 START WITH 1 MINVALUE 1 MAXVALUE 9 CYCLE;

CREATE TABLE app.t (
    id integer DEFAULT nextval('s'::regclass) NOT NULL,
    geom geometry(Point,4326),
    PRIMARY KEY (id)
) PARTITION BY RANGE (id);

CREATE TABLE app.filha PARTITION OF app.t FOR VALUES IN (1);

ALTER TABLE app.t ADD CONSTRAINT t_id_fkey FOREIGN KEY (id) REFERENCES outro.o (id);
CREATE INDEX ix ON app.t (geom);

CREATE VIEW app.v AS
SELECT 1;

CREATE MATERIALIZED VIEW app.mv AS
SELECT 2;

CREATE OR REPLACE FUNCTION app.f() RETURNS integer AS $$ select 1 $$ LANGUAGE sql;

CREATE TRIGGER g BEFORE INSERT OR UPDATE ON app.t FOR EACH ROW EXECUTE FUNCTION f();

`,
    );
  });

  it('falha em leitura acessória vira aviso e não derruba a importação', async () => {
    const avisos: string[] = [];
    const d = pg({ sequenciasDetalhe: async () => { throw new Error('sem permissão'); } });
    const ddl = await gerarDdlDoSchema(d, 'app', { avisos });
    expect(ddl).toContain('CREATE TABLE app.t');
    expect(avisos[0]).toContain('sem permissão');
  });

  it('seleção: FK para tabela fora da seleção é omitida', async () => {
    const ddl = await gerarDdlSelecionados(pg(), [{ schema: 'app', nome: 't', tipo: 'TABELA' }]);
    expect(ddl).toContain('CREATE TABLE app.t');
    expect(ddl).not.toContain('FOREIGN KEY');
  });
});
