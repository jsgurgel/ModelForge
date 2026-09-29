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

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { validarConceitual, ordemTabelaHash } from './validador-conceitual';
import { formatarRelatorio } from './validador';
import type { Diagrama } from '../modelo/tipos';

const DIR = join(__dirname, '..', '..', 'test', 'fixtures-conceitual');
const arquivos = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')).sort() : [];
const rel = (d: Diagrama): string => formatarRelatorio(validarConceitual(d), `"${d.nome}" (conceitual)`);

describe('validarConceitual (fixtures de referência)', () => {
  it.each(arquivos)('%s', (arq) => {
    const fx = JSON.parse(readFileSync(join(DIR, arq), 'utf8'));
    expect(rel(fx.importacao.modelo)).toBe(fx.importacao.validacao);
    expect(rel(fx.conceitual)).toBe(fx.validacao);
    expect(rel(fx.logicoParaConceitual.modelo)).toBe(fx.logicoParaConceitual.validacao);
  });

  it('ordem dos duplicados segue a tabela hash simulada', () => {
    expect(ordemTabelaHash(['B', 'A', 'C'])).toEqual(['A', 'B', 'C'])
    // ESTACAO e REL caem no mesmo bucket (8): o último inserido vai para a frente
    expect(ordemTabelaHash(['ESTACAO', 'MEDICAO', 'POSTO', 'REL'])).toEqual(['POSTO', 'REL', 'ESTACAO', 'MEDICAO']);
  });
});
