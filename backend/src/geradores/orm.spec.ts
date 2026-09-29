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
import { gerarOrm, paraCamelCase, paraPascalCase } from './orm';

const DIR = path.join(__dirname, '../../test/fixtures');
const fixtures = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')))
  .filter((f) => f.orm && f.modelo);

describe('gerarOrm (fixtures de referência)', () => {
  it('há fixtures', () => expect(fixtures.length).toBeGreaterThan(0));
  for (const fx of fixtures) {
    for (const l of ['jpa', 'sqlalchemy', 'prisma'] as const) {
      it(`${fx.entrada} / ${l}`, () => {
        expect(gerarOrm(fx.modelo, l)).toBe(fx.orm[l]);
      });
    }
  }

  it('case helpers', () => {
    expect(paraPascalCase('tb_foo_bar')).toBe('TbFooBar');
    expect(paraCamelCase('tb_foo_bar')).toBe('tbFooBar');
    expect(paraPascalCase('___')).toBe('___');
  });
});
