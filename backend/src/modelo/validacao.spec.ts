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

import { validarDiagrama } from './validacao';

const base = (ligacoes: unknown[]) => ({
  nome: 'x', tipo: 'fluxo',
  formas: [{ id: 'a', kind: 'fluxProcesso', x: 0, y: 0, w: 10, h: 10, texto: '', props: {} }],
  ligacoes,
});
const lig = (de: string, para: string, props: Record<string, unknown> = {}, id = 'l1') => ({ id, kind: 'fluxSeta', de, para, texto: '', cardDe: '', cardPara: '', props });

describe('validarDiagrama - pontas soltas', () => {
  it('aceita ligação forma -> ponto livre', () => {
    expect(validarDiagrama(base([lig('a', '', { pontaB: { x: 5, y: 6 } })]))).toEqual([]);
  });
  it('aceita ponta grudada em outra ligação', () => {
    expect(validarDiagrama(base([lig('a', 'a', {}, 'l0'), lig('a', 'l0', { pontaB: { x: 1, y: 2 } }, 'l2')]))).toEqual([]);
  });
  it('recusa ponta solta sem ponto', () => {
    expect(validarDiagrama(base([lig('a', '')])).join()).toContain('solta sem ponto');
  });
  it('recusa forma inexistente', () => {
    expect(validarDiagrama(base([lig('a', 'zzz')])).join()).toContain('forma inexistente');
  });
  it('aceita ligações normais', () => {
    expect(validarDiagrama(base([lig('a', 'a')]))).toEqual([]);
  });
});
