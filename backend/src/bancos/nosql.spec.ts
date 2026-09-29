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
import { colecoesParaFormas, gerarScriptMongosh, inferirCampos, tirarCredenciais, validarUriMongo } from './nosql';

const DIR = path.resolve(__dirname, '../../test/fixtures-banco');
const casos = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.startsWith('nosql_')).sort() : [];

describe('script mongosh (fixtures de referência)', () => {
  it.each(casos)('%s idêntico à referência', (arq) => {
    const f = JSON.parse(fs.readFileSync(path.join(DIR, arq), 'utf8'));
    const d: Diagrama = {
      nome: f.nomeDiagrama, tipo: 'nosql', ligacoes: [],
      formas: f.colecoes.map((c: any, i: number) => ({ id: 'c' + i, kind: 'colecao', x: 0, y: 0, w: 200, h: 100, texto: c.nome, props: { campos: c.campos } })),
    };
    expect(gerarScriptMongosh(d)).toBe(f.script);
  });
});

describe('inferência de campos', () => {
  const oid = { _bsontype: 'ObjectId' };
  it('tipos, embutidos, arrays de documentos e referências', () => {
    const campos = inferirCampos([
      { _id: oid, nome: 'a', idade: 3, ativo: true, quando: new Date(), tags: ['x'], nulo: null, end: { rua: 'r' }, itens: [{ sku: 's' }], dono: { $ref: 'usuarios', $id: 1 } },
      { nome: 'b', nulo: 5, end: { cidade: 'c', geo: { lat: 1 } }, itens: [{ qtd: 2 }] },
    ]);
    expect(campos.map((c) => [c.nome, c.tipo])).toEqual([
      ['_id', 'objectid'], ['nome', 'string'], ['idade', 'number'], ['ativo', 'boolean'], ['quando', 'date'], ['tags', 'array'],
      ['end', 'embedded'], ['itens', 'array_embedded'], ['dono', 'reference'], ['nulo', 'number'],
    ]);
    expect(campos.find((c) => c.nome === 'end')!.subCampos!.map((c) => c.nome)).toEqual(['rua', 'cidade', 'geo']);
    expect(campos.find((c) => c.nome === 'itens')!.subCampos!.map((c) => c.nome)).toEqual(['sku', 'qtd']);
    expect(campos.find((c) => c.nome === 'dono')!.colecaoReferenciada).toBe('usuarios');
  });

  it('grade de coleções', () => {
    const fs = colecoesParaFormas(Array.from({ length: 5 }, (_, i) => ({ nome: 'c' + i, campos: [] })));
    expect(fs.map((f) => [f.x, f.y])).toEqual([[40, 40], [280, 40], [520, 40], [40, 240], [280, 240]]);
  });
});

describe('connection string', () => {
  it('tira credenciais e valida esquema', () => {
    expect(tirarCredenciais('mongodb://u:p@h:1/db')).toBe('mongodb://h:1/db');
    expect(() => validarUriMongo('http://x')).toThrow();
    expect(validarUriMongo('mongodb://h1:1,h2:2/db')).toBe('mongodb://h1:1,h2:2/db');
  });
  it('respeita BANCO_HOSTS_PERMITIDOS', () => {
    process.env.BANCO_HOSTS_PERMITIDOS = 'ok.local,*.corp';
    try {
      expect(() => validarUriMongo('mongodb://u:p@evil.com/db')).toThrow();
      expect(() => validarUriMongo('mongodb://a.corp/db')).not.toThrow();
    } finally { delete process.env.BANCO_HOSTS_PERMITIDOS; }
  });
});
