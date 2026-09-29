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

import { Ponto } from '../editor/geometry';

/**
 * Geometria pura das formas não retangulares (documento, nota, formas livres, triângulo e pontas de seta). Todas as coordenadas são relativas ao canto da forma.
 */

const i = Math.trunc;
const n = (v: number) => Math.round(v * 100) / 100;

/** Documento: base ondulada. */
export function caminhoDocumento(w: number, h: number): string {
  const v1 = i(h / 3);
  const h1 = i(w / 2);
  const repo = i(v1 / 3);
  const TH = h - repo;
  return `M${w},${TH} L${w},0 L0,0 L0,${TH} C${h1},${TH + v1} ${w - h1},${TH - v1} ${w},${TH} Z`;
}

/** Nota do fluxo/livre: topo e base ondulados. */
export function caminhoNotaOndulada(w: number, h: number): string {
  const v1 = i(h / 3);
  const h1 = i(w / 2);
  const repo = i(v1 / 3);
  const TH = h - repo;
  const v2 = i(v1 / 3);
  return `M0,${v2} C${h1},${v1 + v2} ${w - h1},${-v1 + v2} ${w},${v2} L${w},${TH} C${w - h1},${TH - v1} ${h1},${TH + v1} 0,${TH} L0,${v2} Z`;
}

/** Vários documentos. */
export function caminhoVariosDocumentos(w: number, h: number): string {
  const v1 = i(h / 3);
  const h1 = i(w / 2);
  const repo = i(v1 / 3);
  const recuo = i(h1 / 8);
  const T = recuo;
  const TH = T + h - repo - recuo;
  const LW = w - recuo;
  const p1 = `M${LW},${TH} L${LW},${T} L0,${T} L0,${TH} C${h1},${TH + v1} ${LW - h1},${TH - v1} ${LW},${TH}`;
  let t = i(recuo / 2);
  const p2 = `M${t},${T} L${t},${T - t} L${LW + t},${T - t} L${LW + t},${TH - t} L${LW},${TH - t} L${LW},${T} L${t},${T}`;
  t = recuo;
  const m = i(t / 2);
  const p3 = `M${t},${T - m} L${t},${T - t} L${LW + t},${T - t} L${LW + t},${TH - t} L${LW + m},${TH - t} L${LW + m},${T - m} L${t},${T - m} Z`;
  return `${p1} ${p2} ${p3}`;
}

/** Nota com canto dobrado (Texto tpNota / LivreComentario). */
export function caminhoComentario(w: number, h: number): string {
  const tam = i(Math.min(w / 6, h / 6));
  const curv = i(tam / 4);
  const lw = w;
  return (
    `M0,0 L${lw - tam},0 L${lw},${tam} L${lw},${h} L0,${h} Z ` +
    `M${lw - tam},0 C${lw - tam},0 ${lw - tam + curv},${curv} ${lw - tam},${tam - 1} M${lw - tam},${tam - 1} L${lw},${tam}`
  );
}

export type DirecaoTriangulo = 'Up' | 'Right' | 'Down' | 'Left';
export const DIRECOES_TRIANGULO: DirecaoTriangulo[] = ['Up', 'Right', 'Down', 'Left'];

/** Vértices do triângulo, com o ápice voltado para `dir`. */
export function pontosTriangulo(w: number, h: number, dir: string): Ponto[] {
  switch (dir) {
    case 'Right': return [{ x: w, y: h / 2 }, { x: 0, y: h }, { x: 0, y: 0 }];
    case 'Down': return [{ x: w / 2, y: h }, { x: 0, y: 0 }, { x: w, y: 0 }];
    case 'Left': return [{ x: 0, y: h / 2 }, { x: w, y: 0 }, { x: w, y: h }];
    default: return [{ x: w / 2, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  }
}

/** Próxima direção ao "girar" o triângulo. */
export const girarDirecao = (dir: string): DirecaoTriangulo =>
  DIRECOES_TRIANGULO[(Math.max(0, DIRECOES_TRIANGULO.indexOf(dir as DirecaoTriangulo)) + 1) % 4];

/** Largura de seta aceita: fora de 10..99 volta a 10. */
export const larguraDeSetaValida = (v: number): number => (v > 99 || v < 10 || !Number.isFinite(v) ? 10 : Math.round(v));

/**
 * Ponta de seta em `tip` voltada para longe de `outro`: metade da largura é o
 * comprimento; "aberta" recorta um V perto da ponta (formato de flecha).
 */
export function pontosDeSeta(tip: Ponto, outro: Ponto, largura: number, aberta: boolean): Ponto[] {
  const len = largura / 2;
  const ang = Math.atan2(outro.y - tip.y, outro.x - tip.x);
  const rot = (dx: number, dy: number): Ponto => ({
    x: tip.x + dx * Math.cos(ang) - dy * Math.sin(ang),
    y: tip.y + dx * Math.sin(ang) + dy * Math.cos(ang),
  });
  const pts = [rot(0, 0), rot(len, -len)];
  if (aberta) pts.push(rot(2, 0));
  pts.push(rot(len, len));
  return pts;
}

export const pontosParaSvg = (pts: Ponto[]): string => pts.map((p) => `${n(p.x)},${n(p.y)}`).join(' ');

/** Raio do "retângulo arredondado": arco = largura/3 na horizontal e altura inteira na vertical. */
export function raioPilula(w: number, h: number): { rx: number; ry: number } {
  return { rx: Math.min(w / 6, w / 2), ry: Math.min(h / 2, h / 2) };
}
