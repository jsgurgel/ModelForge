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

import { Forma } from './types';

/** Limiar de alinhamento, em pixels. */
export const LIMIAR_ALINHAMENTO = 8;

export interface ResultadoSnap {
  dx: number;
  dy: number;
  guiasX: number[];
  guiasY: number[];
}

type Linhas = [number, number, number];

function melhor(alvo: Linhas, outro: Linhas) {
  let menor = Infinity;
  let ajuste = 0;
  let guia = 0;
  for (const a of alvo) for (const o of outro) {
    const d = Math.abs(o - a);
    if (d < menor) { menor = d; ajuste = o - a; guia = o; }
  }
  return menor <= LIMIAR_ALINHAMENTO ? { ajuste, guia } : null;
}

const lx = (x: number, w: number): Linhas => [x, x + w / 2, x + w];

/**
 * Encaixe do grupo arrastado (caixa envolvente) nas demais formas. `caixa` já vem na posição proposta.
 */
export function calcularSnap(caixa: { x: number; y: number; w: number; h: number }, outras: Forma[]): ResultadoSnap {
  let bx: { ajuste: number; guia: number } | null = null;
  let by: { ajuste: number; guia: number } | null = null;
  for (const o of outras) {
    const ax = melhor(lx(caixa.x, caixa.w), lx(o.x, o.w));
    if (ax && (!bx || Math.abs(ax.ajuste) < Math.abs(bx.ajuste))) bx = ax;
    const ay = melhor(lx(caixa.y, caixa.h), lx(o.y, o.h));
    if (ay && (!by || Math.abs(ay.ajuste) < Math.abs(by.ajuste))) by = ay;
  }
  return { dx: bx?.ajuste ?? 0, dy: by?.ajuste ?? 0, guiasX: bx ? [bx.guia] : [], guiasY: by ? [by.guia] : [] };
}
