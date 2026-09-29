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
import { Diagrama } from '../modelo/tipos';
import { delimitadorPara, gerarDdl } from './ddl';
import { escapeSqlIdentifier, extrairClausulaDefault, qualificarNome, removerClausulaDefault } from './util';

const dir = path.join(__dirname, '..', '..', 'test', 'fixtures');
const fixtures = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ f, d: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }))
  .filter((x) => x.d.modelo && typeof x.d.ddl === 'string');

describe('gerarDdl (fixtures de referência)', () => {
  it('há fixtures', () => expect(fixtures.length).toBeGreaterThan(0));
  for (const { f, d } of fixtures) {
    it(`fixture ${f}`, () => {
      expect(gerarDdl(d.modelo as Diagrama)).toBe(d.ddl);
    });
  }
});

describe('util SQL', () => {
  it('escapeSqlIdentifier', () => {
    expect(escapeSqlIdentifier('a"b')).toBe('"a""b"');
    expect(escapeSqlIdentifier('')).toBe('""');
  });
  it('qualificarNome: schema prevalece sobre o prefixo', () => {
    expect(qualificarNome(' hidro ', 'App_', 'est')).toBe('"hidro"."est"');
    expect(qualificarNome('', 'App_', 'est')).toBe('App_"est"');
  });
  it('DEFAULT', () => {
    expect(removerClausulaDefault('NOT NULL DEFAULT now() CHECK (a)')).toBe('NOT NULL CHECK (a)');
    expect(extrairClausulaDefault("NOT NULL DEFAULT 'a b'")).toBe("'a b'");
    expect(removerClausulaDefault('COLLATE pg_catalog."default" NOT NULL')).toBe('COLLATE pg_catalog."default" NOT NULL');
  });
  it('delimitadorPara', () => {
    expect(delimitadorPara('select 1')).toBe('$$');
    expect(delimitadorPara('a $$ b')).toBe('$corpo1$');
    expect(delimitadorPara('a $$ $corpo1$ b')).toBe('$corpo2$');
  });
});

/**
 * Casos que o importador de DDL não consegue montar a partir de um .sql (ON DELETE/UPDATE, prefixo do diagrama,
 * identificadores com aspas, coluna sem tipo, gatilho/índice sem nome, referências incompletas). Os resultados
 * esperados foram definidos à mão.
 */
describe('gerarDdl: ramos fora do alcance do importador', () => {
  const campo = (id: string, nome: string, tipo = 'INTEGER', extra: object = {}) => ({
    id, nome, tipo, complemento: '', padrao: '', dicionario: '', observacao: '', srid: '', subtipoGeometria: '',
    pk: false, fk: false, unique: false, separador: false, ...extra,
  });
  const cons = (id: string, tipo: string, extra: object = {}) => ({
    id, tipo, nomeada: false, nome: '', expressao: '', camposOrigem: [], camposDestino: [], constraintOrigem: null,
    onDelete: '', onUpdate: '', ...extra,
  });
  const tabela = (id: string, texto: string, props: object) => ({
    id, kind: 'tabela', x: 0, y: 0, w: 10, h: 10, texto,
    props: { schema: '', descricao: '', observacao: '', estrategiaParticao: '', chaveParticao: '', tabelaPai: '', limiteParticao: '',
      campos: [], constraints: [], indices: [], gatilhos: [], ...props },
  });
  const modelo = (formas: any[], extra: object = {}): Diagrama => ({ nome: '', tipo: 'logico', formas, ligacoes: [], ...extra }) as Diagrama;

  it('prefixo, aspas, coluna sem tipo, FK com ON DELETE/UPDATE e nomes gerados', () => {
    const pai = tabela('t0', 'Pai "x"', {
      campos: [campo('c0', 'id', 'INTEGER', { pk: true })],
      constraints: [cons('k0', 'PK', { camposOrigem: ['c0'] })],
    });
    const filha = tabela('t1', 'filha', {
      campos: [campo('c1', 'pai_id', ''), campo('c2', 'b', 'INTEGER')],
      constraints: [
        cons('k1', 'FK', { camposDestino: ['c1'], camposOrigem: ['c0'], constraintOrigem: { tabelaId: 't0', indice: 0 }, onDelete: 'CASCADE', onUpdate: 'SET NULL' }),
        cons('k2', 'FK', { camposDestino: ['c2'], camposOrigem: [null] }),
        cons('k3', 'FK', { camposDestino: ['c2'], camposOrigem: ['c0'], constraintOrigem: { tabelaId: 't0', indice: 0 }, onUpdate: 'CASCADE' }),
      ],
      indices: [{ id: 'i0', nome: '', unico: false, metodo: '', condicao: '', campos: [] }],
      gatilhos: [{ id: 'g0', nome: '', momento: 'BEFORE', eventos: '', porLinha: false, condicao: '', funcao: '' }],
    });
    const ddl = gerarDdl(modelo([pai, filha], { prefixo: 'App_' }));
    expect(ddl).toBe(
      [
        '/* <<Lógico>>: */',
        '',
        'CREATE TABLE App_"Pai ""x""" (',
        '    "id" INTEGER PRIMARY KEY',
        ');',
        '',
        'CREATE TABLE App_"filha" (',
        '    "pai_id" TIPO_NAO_DEFINIDO,',
        '    "b" INTEGER',
        ');',
        ' ',
        'ALTER TABLE App_"filha" ADD CONSTRAINT "FK_filha_1"',
        '    FOREIGN KEY (pai_id)',
        '    REFERENCES App_"Pai ""x""" (id)',
        '    ON DELETE CASCADE ON UPDATE SET NULL;',
        ' ',
        'ALTER TABLE App_"filha" ADD CONSTRAINT "FK_filha_2"',
        '    FOREIGN KEY (b[])',
        '    REFERENCES ??? (???);',
        ' ',
        'ALTER TABLE App_"filha" ADD CONSTRAINT "FK_filha_3"',
        '    FOREIGN KEY (b)',
        '    REFERENCES App_"Pai ""x""" (id)',
        '    ON UPDATE CASCADE;',
        ' ',
        'CREATE INDEX App_"idx_filha_1" ON App_"filha" (???);',
        ' ',
        'CREATE TRIGGER "trg_filha_1" BEFORE ??? ON App_"filha" FOR EACH STATEMENT EXECUTE FUNCTION ???();',
      ].join('\n').replace('FOREIGN KEY (b[])', 'FOREIGN KEY (b???)'),
    );
  });

  it('separador SQL configurável e diagrama nomeado', () => {
    const t = tabela('t0', 'x', { campos: [campo('c0', 'a')] });
    expect(gerarDdl(modelo([t], { nome: 'meu', separadorSql: ';;' }))).toBe('/* meu: */\n\nCREATE TABLE "x" (\n    "a" INTEGER\n);;');
  });
});
