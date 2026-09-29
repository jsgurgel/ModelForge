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
import { layoutApenso, opcoesApenso, propsMovimentoManual } from './textoApenso';
import { Ligacao } from './types';

const lig = (props: Record<string, unknown> = {}): Ligacao => ({ id: 'l', kind: 'livreLigacao', de: 'a', para: 'b', texto: 'ola', cardDe: '', cardPara: '', props } as Ligacao);

describe('texto apenso', () => {
  it('padrões', () => {
    const o = opcoesApenso(lig());
    expect(o).toMatchObject({ alinhamento: 'Centro', centrarVertical: true, autosize: true, manual: false, tipo: 'embranco', pintarTitulo: false });
    expect(opcoesApenso(lig({ textoDx: 5 })).manual).toBe(true);
    expect(opcoesApenso(lig({ textoAlinhamento: 'x' })).alinhamento).toBe('Centro');
  });
  it('caixa centrada no meio, com deslocamento manual', () => {
    const a = layoutApenso(lig(), 'ola', 12, 6, { x: 100, y: 50 });
    expect(a.caixa.w).toBe(26);
    expect(a.caixa.x).toBe(87);
    const b = layoutApenso(lig({ textoDx: 10, textoDy: -4 }), 'ola', 12, 6, { x: 100, y: 50 });
    expect(b.caixa.x).toBe(97);
    expect(b.caixa.y).toBe(a.caixa.y - 4);
  });
  it('alinhamento e caixa fixa', () => {
    const a = layoutApenso(lig({ textoAutosize: false, textoLargura: 100, textoAlinhamento: 'Esquerda' }), 'x', 12, 6, { x: 100, y: 50 });
    expect(a.anchor).toBe('start');
    expect(a.caixa.w).toBe(100);
    expect(a.x).toBe(54);
    const d = layoutApenso(lig({ textoAutosize: false, textoLargura: 100, textoAlinhamento: 'Direita' }), 'x', 12, 6, { x: 100, y: 50 });
    expect(d.x).toBe(146);
  });
  it('título pintado ocupa uma linha', () => {
    const a = layoutApenso(lig({ textoTitulo: 'T', textoPintarTitulo: true }), 'x', 12, 6, { x: 0, y: 0 });
    expect(a.titulo?.texto).toBe('T');
    expect(a.caixa.h).toBeGreaterThan(layoutApenso(lig(), 'x', 12, 6, { x: 0, y: 0 }).caixa.h);
  });
  it('desligar movimento manual zera o deslocamento', () => {
    expect(propsMovimentoManual(lig({ textoDx: 4, textoDy: 2 }), false)).toMatchObject({ textoManual: false, textoDx: 0, textoDy: 0 });
    expect(propsMovimentoManual(lig({ textoDx: 4 }), true).textoDx).toBe(4);
  });
});
