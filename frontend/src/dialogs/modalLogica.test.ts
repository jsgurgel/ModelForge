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
import { deveConfirmarNoEnter, enterPertenceAoAlvo, proximoFoco } from './modalLogica';

const base = { tecla: 'Enter', tag: 'INPUT', tipo: 'text', temConfirmar: true, cancelado: false, mods: false };

describe('Enter como botão padrão do modal', () => {
  it('confirma em campo de texto simples', () => expect(deveConfirmarNoEnter(base)).toBe(true));
  it('não confirma sem ação padrão, com Esc/outras teclas ou com modificadores', () => {
    expect(deveConfirmarNoEnter({ ...base, temConfirmar: false })).toBe(false);
    expect(deveConfirmarNoEnter({ ...base, tecla: 'a' })).toBe(false);
    expect(deveConfirmarNoEnter({ ...base, mods: true })).toBe(false);
    expect(deveConfirmarNoEnter({ ...base, cancelado: true })).toBe(false);
  });
  it('Enter é do elemento em textarea, botão, select, checkbox e contenteditable', () => {
    for (const tag of ['TEXTAREA', 'BUTTON', 'SELECT']) expect(deveConfirmarNoEnter({ ...base, tag })).toBe(false);
    expect(deveConfirmarNoEnter({ ...base, tipo: 'checkbox' })).toBe(false);
    expect(enterPertenceAoAlvo('div', undefined, true)).toBe(true);
  });
});

describe('foco preso (Tab)', () => {
  it('avança e dá a volta', () => {
    expect(proximoFoco(3, 0, false)).toBe(1);
    expect(proximoFoco(3, 2, false)).toBe(0);
  });
  it('Shift+Tab volta e dá a volta', () => {
    expect(proximoFoco(3, 1, true)).toBe(0);
    expect(proximoFoco(3, 0, true)).toBe(2);
  });
  it('foco fora do diálogo entra pelo primeiro/último; vazio devolve -1', () => {
    expect(proximoFoco(3, -1, false)).toBe(0);
    expect(proximoFoco(3, -1, true)).toBe(2);
    expect(proximoFoco(0, -1, false)).toBe(-1);
  });
});
