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
import { diagramaParaDsl, dslParaDdl } from './dsl';

const DIR = path.join(__dirname, '../../test/fixtures');
const DIR_DSL = path.join(__dirname, '../../test/fixtures-dsl');
const ler = (d: string) =>
  fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'))) : [];

describe('diagramaParaDsl (fixtures de referência)', () => {
  const fixtures = ler(DIR).filter((f) => typeof f.dsl === 'string' && f.modelo);
  it('há fixtures', () => expect(fixtures.length).toBeGreaterThan(0));
  for (const fx of fixtures) it(fx.entrada, () => expect(diagramaParaDsl(fx.modelo)).toBe(fx.dsl));
});

describe('dslParaDdl (fixtures de referência)', () => {
  const fixtures = ler(DIR_DSL);
  it('há fixtures', () => expect(fixtures.length).toBeGreaterThan(0));
  for (const fx of fixtures) {
    it(fx.entrada, () => {
      const r = dslParaDdl(fx.dsl);
      expect(r.ddl).toBe(fx.ddl);
      expect(r.erros).toEqual(fx.erros);
    });
  }
});
