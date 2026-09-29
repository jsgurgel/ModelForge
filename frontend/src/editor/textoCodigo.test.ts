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

import { describe, expect, it } from 'vitest';
import { ajustarZoomCodigo, limparCaracteresEspeciais, ZOOM_CODIGO_INICIAL } from './textoCodigo';

describe('mostrador de código', () => {
  it('limpa acentos como Utilidades.textoParaTabela', () => {
    expect(limparCaracteresEspeciais('Ação, coração, Ñandú, ÀÉÎÕÜ, Çà')).toBe('Acao, coracao, Nandu, AEIOU, Ca');
    expect(limparCaracteresEspeciais('CREATE TABLE t (id int);')).toBe('CREATE TABLE t (id int);');
  });
  it('zoom 1..72 sem passar dos limites', () => {
    expect(ZOOM_CODIGO_INICIAL).toBe(12);
    expect(ajustarZoomCodigo(12, 1)).toBe(13);
    expect(ajustarZoomCodigo(72, 1)).toBe(72);
    expect(ajustarZoomCodigo(1, -1)).toBe(1);
  });
});
