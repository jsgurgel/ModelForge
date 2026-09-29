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

import { Ponto, centro, pontoNaBorda } from './geometry';
import { FORMAS } from '../shapes/registry';
import { Forma } from './types';

/**
 * Roteamento "Inteligente".
 *
 *  - `rotaGenerica`: ciente do par de lados (0 esq, 1 topo, 2 dir, 3 base): a linha sai reta do ponto de ligação até o anel
 *    de 10px em volta da forma e só então dobra, com o mínimo de curvas, sem cruzar as duas formas.
 *  - `rotaEntidadeRelacionamento`: reta ou um único cotovelo de 90 graus (eixo dominante); reta desvia de obstáculos (DesvieDeObstaculo).
 *  - `rotaAtributo`: cotovelo quando o dono liga por cima/baixo (OrganizeRotaAtributo).
 */

export type Lado = 0 | 1 | 2 | 3;
export const ANEL = 10;
const FOLGA_DESVIO = 20;
const TOLERANCIA = 2;
const PENALIDADE_CURVA = 30;

interface Ret { x: number; y: number; w: number; h: number }

const VETOR: Record<Lado, Ponto> = { 0: { x: -1, y: 0 }, 1: { x: 0, y: -1 }, 2: { x: 1, y: 0 }, 3: { x: 0, y: 1 } };
/** Meio de um lado da forma (0 esq, 1 topo, 2 dir, 3 base). */
export function pontoDoLado(f: Pick<Forma, 'x' | 'y' | 'w' | 'h'>, lado: Lado): Ponto {
  switch (lado) {
    case 0: return { x: f.x, y: f.y + f.h / 2 };
    case 1: return { x: f.x + f.w / 2, y: f.y };
    case 2: return { x: f.x + f.w, y: f.y + f.h / 2 };
    default: return { x: f.x + f.w / 2, y: f.y + f.h };
  }
}
const oposto = (l: Lado): Lado => ((l + 2) % 4) as Lado;
const crescer = (r: Ret, n: number): Ret => ({ x: r.x - n, y: r.y - n, w: r.w + 2 * n, h: r.h + 2 * n });
const direita = (r: Ret) => r.x + r.w;
const base = (r: Ret) => r.y + r.h;

/** Simplifica a polilinha: remove pontos repetidos e colineares. */
export function simplificar(pts: Ponto[]): Ponto[] {
  const sem = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
  const out: Ponto[] = [];
  for (const p of sem) {
    while (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      const colinear = (a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y);
      if (!colinear) break;
      out.pop();
    }
    out.push(p);
  }
  return out;
}

// ---- bordas ------------------------------------------------------------------

/** Ponto da borda na altura `y`, à direita ou à esquerda (para retas horizontais exatas). */
export function bordaHorizontal(f: Forma, y: number, paraDireita: boolean): Ponto {
  const c = centro(f);
  const a = f.w / 2;
  const b = f.h / 2;
  const t = b === 0 ? 0 : Math.min(1, Math.abs(y - c.y) / b);
  let dx = a;
  switch (FORMAS[f.kind]?.geo) {
    case 'ellipse': case 'circle': case 'attr': case 'multiattr': case 'inicio': case 'fim': case 'junction': case 'fluxconector': case 'pill':
      dx = a * Math.sqrt(Math.max(0, 1 - t * t));
      break;
    case 'diamond': case 'special': case 'union': case 'triangle': dx = a * (1 - t); break;
    default: dx = a;
  }
  return { x: paraDireita ? c.x + dx : c.x - dx, y };
}

/** Ponto da borda na coluna `x`, embaixo ou em cima. */
export function bordaVertical(f: Forma, x: number, paraBaixo: boolean): Ponto {
  const c = centro(f);
  const a = f.w / 2;
  const b = f.h / 2;
  const t = a === 0 ? 0 : Math.min(1, Math.abs(x - c.x) / a);
  let dy = b;
  switch (FORMAS[f.kind]?.geo) {
    case 'ellipse': case 'circle': case 'attr': case 'multiattr': case 'inicio': case 'fim': case 'junction': case 'fluxconector': case 'pill':
      dy = b * Math.sqrt(Math.max(0, 1 - t * t));
      break;
    case 'diamond': case 'special': case 'union': case 'triangle': dy = b * (1 - t); break;
    default: dy = b;
  }
  return { x, y: paraBaixo ? c.y + dy : c.y - dy };
}

/**
 * Pontos de ligação de uma forma: 0-3 cantos (esq-topo, dir-topo, dir-base, esq-base) e
 * 4-7 meios dos lados (topo, direita, base, esquerda). Cantos de formas curvas caem sobre a borda.
 */
export function pontoDeConexao(f: Forma, i: number): Ponto {
  switch (i) {
    case 4: return pontoDoLado(f, 1);
    case 5: return pontoDoLado(f, 2);
    case 6: return pontoDoLado(f, 3);
    case 7: return pontoDoLado(f, 0);
    case 0: return pontoNaBorda(f, { x: f.x, y: f.y });
    case 1: return pontoNaBorda(f, { x: f.x + f.w, y: f.y });
    case 2: return pontoNaBorda(f, { x: f.x + f.w, y: f.y + f.h });
    default: return pontoNaBorda(f, { x: f.x, y: f.y + f.h });
  }
}

/** Lado (direção de saída) de cada ponto de ligação; cantos saem pelo lado voltado ao alvo. */
export function ladoDaConexao(i: number, alvo: Ponto, f: Forma): Lado {
  switch (i) {
    case 4: return 1;
    case 5: return 2;
    case 6: return 3;
    case 7: return 0;
    default: {
      const c = centro(f);
      const dx = alvo.x - c.x;
      const dy = alvo.y - c.y;
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      if (i === 0) return horizontal ? 0 : 1;
      if (i === 1) return horizontal ? 2 : 1;
      if (i === 2) return horizontal ? 2 : 3;
      return horizontal ? 0 : 3;
    }
  }
}

// ---- busca ortogonal ----------------------------------------------------------

const dentroEstrito = (r: Ret, x: number, y: number) => x > r.x && x < direita(r) && y > r.y && y < base(r);

/** O segmento (horizontal ou vertical) atravessa o interior do retângulo? */
function cruza(r: Ret, a: Ponto, b: Ponto): boolean {
  if (a.y === b.y) {
    if (a.y <= r.y || a.y >= base(r)) return false;
    return Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < direita(r);
  }
  if (a.x <= r.x || a.x >= direita(r)) return false;
  return Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < base(r);
}

/**
 * Menor caminho ortogonal entre s e t (grade de Hanan), com custo por curva, começando na direção `dirIni`
 * e chegando na direção `dirFim`, sem cruzar os retângulos (interior). Devolve null se não houver caminho.
 */
export function buscaOrtogonal(s: Ponto, t: Ponto, dirIni: Lado, dirFim: Lado, proibidos: Ret[]): Ponto[] | null {
  const xs = new Set<number>([s.x, t.x, (s.x + t.x) / 2]);
  const ys = new Set<number>([s.y, t.y, (s.y + t.y) / 2]);
  for (const r of proibidos) { xs.add(r.x); xs.add(direita(r)); ys.add(r.y); ys.add(base(r)); }
  const X = [...xs].sort((a, b) => a - b);
  const Y = [...ys].sort((a, b) => a - b);
  const nx = X.length;
  const ny = Y.length;
  const livre = (i: number, j: number) => !proibidos.some((r) => dentroEstrito(r, X[i], Y[j]));
  const idx = (i: number, j: number) => j * nx + i;
  const si = X.indexOf(s.x);
  const sj = Y.indexOf(s.y);
  const ti = X.indexOf(t.x);
  const tj = Y.indexOf(t.y);
  const N = nx * ny * 4;
  const custo = new Float64Array(N).fill(Infinity);
  const veio = new Int32Array(N).fill(-1);
  const feito = new Uint8Array(N);
  const estado = (i: number, j: number, d: number) => idx(i, j) * 4 + d;
  const dirs: [number, number, Lado][] = [[-1, 0, 0], [0, -1, 1], [1, 0, 2], [0, 1, 3]];
  custo[estado(si, sj, dirIni)] = 0;
  // fila de prioridade simples (a grade é pequena)
  const fila: number[] = [estado(si, sj, dirIni)];
  let alvo = -1;
  let melhor = Infinity;
  while (fila.length) {
    let k = 0;
    for (let q = 1; q < fila.length; q++) if (custo[fila[q]] < custo[fila[k]]) k = q;
    const e = fila.splice(k, 1)[0];
    if (feito[e]) continue;
    feito[e] = 1;
    const d = e % 4;
    const cel = (e - d) / 4;
    const i = cel % nx;
    const j = (cel - i) / nx;
    if (i === ti && j === tj) {
      const total = custo[e] + (d === dirFim ? 0 : PENALIDADE_CURVA);
      if (total < melhor) { melhor = total; alvo = e; }
      continue;
    }
    if (custo[e] >= melhor) break;
    for (const [dx, dy, nd] of dirs) {
      if (nd === oposto(d as Lado)) continue; // sem retorno
      const ni = i + dx;
      const nj = j + dy;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny || !livre(ni, nj)) continue;
      const a = { x: X[i], y: Y[j] };
      const b = { x: X[ni], y: Y[nj] };
      if (proibidos.some((r) => cruza(r, a, b))) continue;
      const passo = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const c = custo[e] + passo + (nd === d ? 0 : PENALIDADE_CURVA);
      const ne = estado(ni, nj, nd);
      if (c < custo[ne]) { custo[ne] = c; veio[ne] = e; fila.push(ne); }
    }
  }
  if (alvo < 0) return null;
  const pts: Ponto[] = [];
  for (let e = alvo; e >= 0; e = veio[e]) {
    const d = e % 4;
    const cel = (e - d) / 4;
    const i = cel % nx;
    pts.push({ x: X[i], y: Y[(cel - i) / nx] });
  }
  return pts.reverse();
}

// ---- rota genérica ----------------------------------------------

export interface PontaRota {
  forma: Forma;
  /** Ponto de ligação já escolhido (senão: meio do lado voltado ao outro). */
  ponto?: Ponto;
  lado?: Lado;
}

/** Lado da forma voltado para o alvo (eixo dominante, normalizado pelos tamanhos). */
export function ladoVoltadoPara(f: Forma, alvo: Forma): Lado {
  const ca = centro(f);
  const cb = centro(alvo);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const horizontal = Math.abs(dx) / ((f.w + alvo.w) / 2 || 1) >= Math.abs(dy) / ((f.h + alvo.h) / 2 || 1);
  return horizontal ? (dx >= 0 ? 2 : 0) : dy >= 0 ? 3 : 1;
}

const ret = (f: Forma): Ret => ({ x: f.x, y: f.y, w: f.w, h: f.h });

export function rotaGenerica(A: PontaRota, B: PontaRota): Ponto[] {
  const fa = A.forma;
  const fb = B.forma;
  const ladoA = A.lado ?? ladoVoltadoPara(fa, fb);
  const ladoB = B.lado ?? ladoVoltadoPara(fb, fa);

  //# Faixas sobrepostas no eixo perpendicular: uma reta exata entre os lados voltados (sem pontos escolhidos).
  if (!A.ponto && !B.ponto) {
    const horizontal = ladoA === 0 || ladoA === 2;
    if (horizontal && ladoB === oposto(ladoA)) {
      const topo = Math.max(fa.y, fb.y);
      const fundo = Math.min(fa.y + fa.h, fb.y + fb.h);
      if (fundo - topo >= 8) {
        const y = (topo + fundo) / 2;
        return [bordaHorizontal(fa, y, ladoA === 2), bordaHorizontal(fb, y, ladoB === 2)];
      }
    } else if (!horizontal && ladoB === oposto(ladoA)) {
      const esq = Math.max(fa.x, fb.x);
      const dir = Math.min(fa.x + fa.w, fb.x + fb.w);
      if (dir - esq >= 8) {
        const x = (esq + dir) / 2;
        return [bordaVertical(fa, x, ladoA === 3), bordaVertical(fb, x, ladoB === 3)];
      }
    }
  }

  const pa = A.ponto ?? pontoDoLado(fa, ladoA);
  const pb = B.ponto ?? pontoDoLado(fb, ladoB);
  const s = { x: pa.x + VETOR[ladoA].x * ANEL, y: pa.y + VETOR[ladoA].y * ANEL };
  const t = { x: pb.x + VETOR[ladoB].x * ANEL, y: pb.y + VETOR[ladoB].y * ANEL };
  const proibidos = [crescer(ret(fa), ANEL - 1), crescer(ret(fb), ANEL - 1)].filter((r) => r.w > 0 && r.h > 0);
  const meio = buscaOrtogonal(s, t, ladoA, oposto(ladoB), proibidos.map((r) => ({ ...r })));
  if (!meio) return [pa, pb];
  return simplificar([pa, ...meio, pb]);
}

// ---- Entidade/Relacionamento (Ligacao.OrganizeRotaOrtogonal) -------------------

const ehEntRelKind = (k: string) => k === 'entidade' || k === 'entidadeAssociativa' || k === 'relacionamento' || k === 'autorelacionamento';
export const ehEntidadeOuRelacionamento = (f: Forma) => ehEntRelKind(f.kind);

function encontreObstaculo(obst: Forma[], x0: number, x1: number, y0: number, y1: number): Forma | undefined {
  return obst.find((f) => f.x + f.w > x0 && f.x < x1 && f.y + f.h > y0 && f.y < y1);
}

export function rotaEntidadeRelacionamento(A: Forma, B: Forma, obstaculos: Forma[]): Ponto[] {
  const ca = centro(A);
  const cb = centro(B);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const obst = obstaculos.filter((f) => f.id !== A.id && f.id !== B.id);

  if (Math.abs(dx) <= TOLERANCIA && Math.abs(dy) <= TOLERANCIA) return [pontoNaBorda(A, cb), pontoNaBorda(B, ca)];

  if (Math.abs(dy) <= TOLERANCIA || Math.abs(dx) <= TOLERANCIA) {
    const vertical = Math.abs(dx) <= TOLERANCIA;
    let a: Ponto;
    let b: Ponto;
    if (vertical) {
      a = bordaVertical(A, ca.x, dy >= 0);
      b = { ...bordaVertical(B, ca.x, dy < 0), x: a.x };
    } else {
      a = bordaHorizontal(A, ca.y, dx >= 0);
      b = { ...bordaHorizontal(B, ca.y, dx < 0), y: a.y };
    }
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    const o = encontreObstaculo(obst, x0, x1, y0, y1);
    if (!o) return [a, b];
    //# DesvieDeObstaculo: degrau de 3 pernas com folga de 20px; se não houver espaço de um lado, tenta o outro.
    if (vertical) {
      const dir = o.x + o.w + FOLGA_DESVIO;
      const novoX = encontreObstaculo(obst, dir, dir, y0, y1) ? o.x - FOLGA_DESVIO : dir;
      return [a, { x: novoX, y: a.y }, { x: novoX, y: b.y }, b];
    }
    const baixo = o.y + o.h + FOLGA_DESVIO;
    const novoY = encontreObstaculo(obst, x0, x1, baixo, baixo) ? o.y - FOLGA_DESVIO : baixo;
    return [a, { x: a.x, y: novoY }, { x: b.x, y: novoY }, b];
  }

  //# Um só cotovelo, pelo eixo dominante: sai na horizontal e dobra até B (ou o inverso).
  const horizontalPrimeiro = Math.abs(dx) >= Math.abs(dy);
  const tenta = (h: boolean): Ponto[] | null => {
    const p1 = h ? { x: cb.x, y: ca.y } : { x: ca.x, y: cb.y };
    if (dentroEstrito(ret(A), p1.x, p1.y) || dentroEstrito(ret(B), p1.x, p1.y)) return null;
    const a = h ? bordaHorizontal(A, ca.y, dx >= 0) : bordaVertical(A, ca.x, dy >= 0);
    const b = h ? bordaVertical(B, cb.x, dy < 0) : bordaHorizontal(B, cb.y, dx < 0);
    return [a, p1, b];
  };
  return tenta(horizontalPrimeiro) ?? tenta(!horizontalPrimeiro) ?? [pontoNaBorda(A, cb), pontoNaBorda(B, ca)];
}

// ---- Atributo (Ligacao.OrganizeRotaAtributo) -----------------------------------

/** Lado da forma dona voltado ao atributo: topo/base se o atributo está acima/abaixo, senão esquerda/direita. */
export function ladoDoDonoParaAtributo(dono: Forma, atr: Forma): Lado {
  const c = centro(atr);
  const foraX = Math.max(dono.x - c.x, c.x - (dono.x + dono.w), 0);
  const foraY = Math.max(dono.y - c.y, c.y - (dono.y + dono.h), 0);
  if (foraY >= foraX && foraY > 0) return c.y < dono.y ? 1 : 3;
  if (foraX > 0) return c.x < dono.x ? 0 : 2;
  return ladoVoltadoPara(dono, atr);
}

/** Ponto de ligação do atributo: lado do círculo (ligação principal) ou lado do texto (ligações dos sub-atributos). */
export function pontoDoAtributo(atr: Forma, principal: boolean): { ponto: Ponto; lado: Lado } {
  const esquerda = atr.props.direcao !== 'Right'; // padrão: Left
  const noCirculo = principal;
  const lado: Lado = esquerda === noCirculo ? 0 : 2;
  return { ponto: pontoDoLado(atr, lado), lado };
}

/**
 * Rota entre um atributo e o dono. `donoEhDe` mantém a ordem dos pontos (de -> para). Devolve o caminho na
 * ordem dono -> atributo quando donoEhDe, ou atributo -> dono.
 */
export function rotaAtributo(atr: Forma, dono: Forma, donoEhDe: boolean): Ponto[] {
  const { ponto: pa, lado: ladoAtr } = pontoDoAtributo(atr, true);
  const ladoDono = ladoDoDonoParaAtributo(dono, atr);
  let rota: Ponto[];
  if (ladoDono === 1 || ladoDono === 3) {
    //# Sai do atributo na horizontal e chega ao dono na vertical: cotovelo em (x do dono, y do atributo).
    const po = pontoDoLado(dono, ladoDono);
    if (Math.abs(po.x - pa.x) <= TOLERANCIA || Math.abs(po.y - pa.y) <= TOLERANCIA) rota = [po, pa];
    else rota = [po, { x: po.x, y: pa.y }, pa];
  } else {
    const dy = centro(dono).y - centro(atr).y;
    if (Math.abs(dy) <= TOLERANCIA) {
      rota = [bordaHorizontal(dono, centro(atr).y, ladoDono === 2), { ...pa, y: centro(atr).y }];
    } else {
      rota = rotaGenerica({ forma: dono, lado: ladoDono }, { forma: atr, ponto: pa, lado: ladoAtr }).slice();
    }
  }
  return donoEhDe ? rota : [...rota].reverse();
}
