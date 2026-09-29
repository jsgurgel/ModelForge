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

import { Ponto } from './geometry';
import { Forma } from './types';

/**
 * Desenhador. Props da forma `desenhador`:
 *  - `tipoDesenho`: 'seta' | 'imagem' | 'livre'
 *  - seta: `anguloSeta`, `setaCor`, `setaLargura` (2), `desvioX`, `desvioY`, `pontaDireita`, `pontaEsquerda`
 *  - imagem: `src` (data URL), `imgNome`, `imgW`/`imgH` (tamanho natural), `alfa` (0..100)
 *  - livre: `itens`: ItemDesenho[] (coordenadas relativas à forma)
 */

export type TipoDesenho = 'seta' | 'imagem' | 'livre';
export const TIPOS_DESENHO: { valor: TipoDesenho; rotulo: string }[] = [
  { valor: 'seta', rotulo: 'Linha' },
  { valor: 'imagem', rotulo: 'Imagem' },
  { valor: 'livre', rotulo: 'Desenho livre' },
];

export const tipoDoDesenhador = (f: Forma): TipoDesenho => {
  const t = f.props.tipoDesenho;
  return t === 'seta' || t === 'livre' ? t : 'imagem';
};

export interface SetaGeo { x1: number; y1: number; x2: number; y2: number }

/** Extremos da seta dentro da caixa: o ângulo e os desvios movem as pontas. */
export function geometriaDaSeta(w: number, h: number, angulo: number, desvioX = 0, desvioY = 0): SetaGeo {
  const pw = w - 4;
  const ph = h - 4;
  let ang = Math.abs(angulo);
  while (ang > 180) ang -= 180;
  let sen = Math.sin((ang * Math.PI) / 180);
  if (sen === 0) sen = 0.0001;
  const catOp = ph / 2;
  const hip = catOp / sen;
  let catAd = Math.sqrt(Math.max(0, hip * hip - catOp * catOp));
  let x: number, y: number, x2: number, y2: number;
  if (catAd <= pw / 2) {
    const rec = Math.trunc((pw - 2 * catAd) / 2);
    x = rec; y = 0; y2 = ph; x2 = -rec + pw;
    if (ang > 90) [x, x2] = [x2, x];
  } else {
    catAd = pw / 2;
    let cos = Math.cos((ang * Math.PI) / 180);
    if (cos === 0) cos = 0.0001;
    const hip2 = catAd / cos;
    const catOp2 = Math.sqrt(Math.max(0, hip2 * hip2 - catAd * catAd));
    const rec = Math.trunc((ph - 2 * catOp2) / 2);
    x = 0; y = rec; y2 = ph - rec; x2 = pw;
    if (ang > 90) [y, y2] = [y2, y];
  }
  //# Usa (x+desvioX, y+desvioY, x2-desvioX, y2-desvioY) como pontos inicial e final.
  return { x1: x + desvioX, y1: y + desvioY, x2: x2 - desvioX, y2: y2 - desvioY };
}

export interface CabecaSeta { pontos: Ponto[] }

/** Cabeças da seta (drawArrow): losango achatado de `3 + largura` de altura em cada ponta. */
export function cabecasDaSeta(g: SetaGeo, largura: number, pontaDir: boolean, pontaEsq: boolean): { linha: [Ponto, Ponto]; cabecas: Ponto[][] } {
  const arr = 3 + largura;
  const dx = g.x2 - g.x1;
  const dy = g.y2 - g.y1;
  const ang = Math.atan2(dy, dx);
  const len = Math.trunc(Math.hypot(dx, dy));
  const rot = (px: number, py: number): Ponto => ({
    x: g.x1 + px * Math.cos(ang) - py * Math.sin(ang),
    y: g.y1 + px * Math.sin(ang) + py * Math.cos(ang),
  });
  const cabecas: Ponto[][] = [];
  //# "Ponta esquerda" é a ponta no fim do vetor e "ponta direita" a do início.
  if (pontaEsq) cabecas.push([rot(len, 0), rot(len - arr, -arr), rot(len - arr, arr)]);
  if (pontaDir) cabecas.push([rot(0, 0), rot(arr, -arr), rot(arr, arr)]);
  return { linha: [rot(arr, 0), rot(len - arr, 0)], cabecas };
}

// ---- desenho livre ---------------------------------------------------------

export type TipoItemDesenho = 'retangulo' | 'elipse' | 'linha' | 'caminho' | 'polilinha';

export interface ItemDesenho {
  tipo: TipoItemDesenho;
  /** Caixa (retângulo/elipse) ou vazio. */
  x: number; y: number; w: number; h: number;
  /** Vértices (linha/caminho/polilinha). */
  pontos?: Ponto[];
  cor: string;
  preencher: boolean;
  /** Espessura do traço. */
  largura: number;
  gradiente?: boolean;
  cor2?: string;
}

export const itensDoDesenho = (f: Forma): ItemDesenho[] => (Array.isArray(f.props.itens) ? (f.props.itens as ItemDesenho[]) : []);

export function itemNovo(tipo: TipoItemDesenho, a: Ponto, b: Ponto, cor: string, preencher: boolean): ItemDesenho {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const base = { cor, preencher, largura: 1 };
  if (tipo === 'retangulo' || tipo === 'elipse') return { ...base, tipo, x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
  return { ...base, tipo, x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y), pontos: [a, b] };
}

/** Caixa que envolve todos os itens (para "ajustar ao desenho"). */
export function caixaDosItens(itens: ItemDesenho[]): { x: number; y: number; w: number; h: number } | null {
  if (!itens.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const it of itens) {
    const pts = it.pontos?.length ? it.pontos : [{ x: it.x, y: it.y }, { x: it.x + it.w, y: it.y + it.h }];
    for (const p of pts) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Atributo `d` de um item de caminho/polilinha. */
export const caminhoDoItem = (it: ItemDesenho): string =>
  (it.pontos ?? []).map((p, i) => `${i ? 'L' : 'M'}${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`).join(' ') + (it.tipo === 'polilinha' && it.preencher ? ' Z' : '');

/** Reduz uma sequência densa de pontos de mão livre (Ramer-Douglas-Peucker). */
export function simplificar(pts: Ponto[], tol = 1.2): Ponto[] {
  if (pts.length < 3) return pts;
  const dist = (p: Ponto, a: Ponto, b: Ponto) => {
    const vx = b.x - a.x, vy = b.y - a.y;
    const nn = vx * vx + vy * vy;
    if (nn === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / nn));
    return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
  };
  let idx = 0, max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = dist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tol) return [pts[0], pts[pts.length - 1]];
  return [...simplificar(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplificar(pts.slice(idx), tol)];
}

/** Altura proporcional à imagem, mantendo a largura ("Proporcional"). */
export const alturaProporcional = (w: number, imgW: number, imgH: number): number => (imgW > 0 && imgH > 0 ? Math.max(10, Math.round((imgH * w) / imgW)) : 0);
