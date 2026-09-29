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
import { importarDdlLogico } from '../geradores/importador';
import { DialetoFalso } from './dialeto-falso';
import { gerarDdlDoSchema } from './ddl-banco';
import { gerarScriptMigracao } from './migracao';

const DIR = path.resolve(__dirname, '../../test/fixtures-banco');
const casos = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.startsWith('migracao_') && f.endsWith('.json')).sort() : [];

describe('script de migração e importar do banco (fixtures de referência sobre SQLite)', () => {
  it('há fixtures de referência', () => expect(casos.length).toBeGreaterThanOrEqual(7));

  describe.each(casos)('%s', (arq) => {
    const f = JSON.parse(fs.readFileSync(path.join(DIR, arq), 'utf8'));

    it('migração idêntica à referência', () => {
      const { diagrama, erros } = importarDdlLogico(f.ddlModelo, 'modelo_' + f.entrada);
      expect(erros).toEqual([]);
      expect(gerarScriptMigracao(diagrama, f.estruturado, f.database)).toBe(f.migracao);
    });

    it('DDL do "importar do banco" idêntico à referência', async () => {
      expect(await gerarDdlDoSchema(new DialetoFalso(f.catalogo), '')).toBe(f.importDdl);
    });
  });
});
