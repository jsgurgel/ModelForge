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
import { aplicarCondicoes, seFalso, seValorEm, seVerdadeiro } from './condicoes';
import { Prop } from './PropertyGrid';

const p = (id: string, valor: Prop['valor'], extra: Partial<Prop> = {}): Prop => ({ rotulo: id, id, valor, editor: { tipo: 'texto' }, ...extra });

describe('condições do Inspector', () => {
  it('ForTrue/ForFalse habilitam conforme o valor', () => {
    const r = aplicarCondicoes([p('grad', false), p('c1', 'x'), p('bk', 'y')], [seVerdadeiro('grad', ['c1']), seFalso('grad', ['bk'])]);
    expect(r.find((x) => x.id === 'c1')!.desabilitado).toBe(true);
    expect(r.find((x) => x.id === 'bk')!.desabilitado).toBe(false);
    const r2 = aplicarCondicoes([p('grad', true), p('c1', 'x'), p('bk', 'y')], [seVerdadeiro('grad', ['c1']), seFalso('grad', ['bk'])]);
    expect(r2.find((x) => x.id === 'c1')!.desabilitado).toBe(false);
    expect(r2.find((x) => x.id === 'bk')!.desabilitado).toBe(true);
  });
  it('vários controladores: qualquer um desabilita', () => {
    const r = aplicarCondicoes([p('tipo', '1'), p('grad', true), p('alfa', 1)], [seValorEm('tipo', [1, 2, 3], ['alfa']), seVerdadeiro('grad', ['alfa'])]);
    expect(r[2].desabilitado).toBe(false);
    const r2 = aplicarCondicoes([p('tipo', '0'), p('grad', true), p('alfa', 1)], [seValorEm('tipo', [1, 2, 3], ['alfa']), seVerdadeiro('grad', ['alfa'])]);
    expect(r2[2].desabilitado).toBe(true);
  });
  it('forcar vence as regras', () => {
    const r = aplicarCondicoes([p('a', false), p('b', 1, { forcar: 'habilitar' }), p('c', 1, { forcar: 'desabilitar' })], [seVerdadeiro('a', ['b', 'c'])]);
    expect(r[1].desabilitado).toBe(false);
    expect(r[2].desabilitado).toBe(true);
  });
});
