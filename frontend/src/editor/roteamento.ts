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
import {
  ehEntidadeOuRelacionamento, ladoDaConexao, ladoVoltadoPara, pontoDeConexao, pontoDoAtributo, rotaAtributo, rotaEntidadeRelacionamento, rotaGenerica,
} from './roteamentoInteligente';
import { Diagrama, Forma, Ligacao } from './types';
import { ehEspUniao, slotsDaEspecializacao } from './especializacaoSlots';

/**
 * Roteamento das ligações.
 *
 * Contrato de props da ligação (compartilhado com o render):
 *  - `pontos`: pontos de dobra manuais; a linha é uma polilinha  origem -> pontos -> destino.
 *  - `inteligente`: quando !== false e sem `pontos`, a linha é ortogonal (segmentos horizontais/verticais).
 *  - `textoDx/textoDy`: deslocamento do rótulo em relação ao ponto médio.
 */

export interface CaminhoLigacao {
  /** Vértices da polilinha, incluindo as duas pontas (para laço, só as pontas). */
  pontos: Ponto[];
  /** Atributo `d` do <path> (polilinha, ou curva de Bézier no laço). */
  d: string;
  /** Ponta na forma de origem (`de`). */
  a: Ponto;
  /** Ponta na forma de destino (`para`). */
  b: Ponto;
  /** Ponto médio ao longo do caminho (onde fica o rótulo, antes de textoDx/Dy). */
  meio: Ponto;
  /** Ponto logo antes de `a` / de `b`, para orientar as setas e cardinalidades. */
  antesA: Ponto;
  antesB: Ponto;
  /** Auto-relacionamento (mesma forma nas duas pontas). */
  laco: boolean;
}

export const pontosDeDobra = (l: Ligacao): Ponto[] => {
  const p = l.props.pontos;
  return Array.isArray(p) ? (p as Ponto[]).filter((q) => q && typeof q.x === 'number' && typeof q.y === 'number') : [];
};

export const ehInteligente = (l: Ligacao): boolean => l.props.inteligente !== false;

/** Ponto médio ao longo do comprimento de uma polilinha. */
export function pontoMedioDaPolilinha(pts: Ponto[]): Ponto {
  if (pts.length === 1) return pts[0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let resto = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const s = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (resto <= s && s > 0) {
      const t = resto / s;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    resto -= s;
  }
  return pts[pts.length - 1];
}

/** Lado da forma mais próximo do ponto: 0 esquerda, 1 topo, 2 direita, 3 base (Forma.retorneProximidade). */
export function ladoMaisProximo(f: Forma, p: Ponto): 0 | 1 | 2 | 3 {
  const d = [Math.abs(p.x - f.x), Math.abs(p.y - f.y), Math.abs(p.x - (f.x + f.w)), Math.abs(p.y - (f.y + f.h))];
  let m = 0;
  for (let i = 1; i < 4; i++) if (d[i] < d[m]) m = i;
  return m as 0 | 1 | 2 | 3;
}

/** Ponto médio de um lado da forma, no lado escolhido. */
export function pontoDoLado(f: Forma, lado: 0 | 1 | 2 | 3): Ponto {
  switch (lado) {
    case 0: return { x: f.x, y: f.y + f.h / 2 };
    case 1: return { x: f.x + f.w / 2, y: f.y };
    case 2: return { x: f.x + f.w, y: f.y + f.h / 2 };
    default: return { x: f.x + f.w / 2, y: f.y + f.h };
  }
}

/** Melhor ponto de ligação da forma para chegar a `alvo`: meio do lado mais próximo. */
export const melhorPontoDeLigacao = (f: Forma, alvo: Ponto): Ponto => pontoDoLado(f, ladoMaisProximo(f, alvo));

const arred = (n: number) => Math.round(n * 100) / 100;

/** Rota ortogonal (horizontal-vertical-horizontal ou o análogo) entre duas formas. */
export function rotaOrtogonal(a: Forma, b: Forma): Ponto[] {
  const ca = centro(a);
  const cb = centro(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const horizontal = Math.abs(dx) / ((a.w + b.w) / 2 || 1) >= Math.abs(dy) / ((a.h + b.h) / 2 || 1);
  if (horizontal) {
    const ladoA = dx >= 0 ? 2 : 0;
    const ladoB = dx >= 0 ? 0 : 2;
    const pa = pontoDoLado(a, ladoA);
    const pb = pontoDoLado(b, ladoB);
    const topo = Math.max(a.y, b.y);
    const base = Math.min(a.y + a.h, b.y + b.h);
    //# Faixas verticais sobrepostas: um segmento reto no meio da sobreposição.
    if (base - topo >= 8) {
      const y = (topo + base) / 2;
      return [{ x: pa.x, y }, { x: pb.x, y }];
    }
    const mx = (pa.x + pb.x) / 2;
    return [pa, { x: mx, y: pa.y }, { x: mx, y: pb.y }, pb];
  }
  const ladoA = dy >= 0 ? 3 : 1;
  const ladoB = dy >= 0 ? 1 : 3;
  const pa = pontoDoLado(a, ladoA);
  const pb = pontoDoLado(b, ladoB);
  const esq = Math.max(a.x, b.x);
  const dir = Math.min(a.x + a.w, b.x + b.w);
  if (dir - esq >= 8) {
    const x = (esq + dir) / 2;
    return [{ x, y: pa.y }, { x, y: pb.y }];
  }
  const my = (pa.y + pb.y) / 2;
  return [pa, { x: pa.x, y: my }, { x: pb.x, y: my }, pb];
}

const polilinha = (pts: Ponto[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${arred(p.x)},${arred(p.y)}`).join(' ');

const ehAtributo = (f: Forma) => f.kind === 'atributo' || f.kind === 'atributoMulti';

const numeroValido = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const pontoValido = (p: unknown): p is Ponto => !!p && typeof p === 'object' && numeroValido((p as Ponto).x) && numeroValido((p as Ponto).y);

/**
 * Extremo de uma ligação: uma forma (com ponto de conexão opcional 0-7 em `conexaoA/B`) ou uma ponta solta.
 * Pontas soltas (Fluxo/Atividade/Livre) guardam o ponto em `props.pontaA/pontaB`; se `de/para` é o id de outra
 * ligação, a ponta gruda nela (projetada sobre o traçado dela).
 */
export interface Extremo {
  forma: Forma;
  solto: boolean;
  conexao?: number;
  /** Vértice da Especialização/União reservado a esta ligação. */
  pontoFixo?: Ponto;
}

const PSEUDO: Forma = { id: '', kind: 'ponto', x: 0, y: 0, w: 0, h: 0, texto: '', props: {} };

function projetarNaPolilinha(p: Ponto, pts: Ponto[]): Ponto {
  let melhor = pts[0];
  let menor = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const n = vx * vx + vy * vy;
    const t = n === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / n));
    const q = { x: a.x + vx * t, y: a.y + vy * t };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < menor) { menor = d; melhor = q; }
  }
  return melhor;
}

export function extremoDaLigacao(doc: Diagrama, l: Ligacao, qual: 'A' | 'B', profundidade = 0): Extremo | null {
  const id = qual === 'A' ? l.de : l.para;
  const f = id ? doc.formas.find((x) => x.id === id) : undefined;
  if (f) {
    const c = l.props[qual === 'A' ? 'conexaoA' : 'conexaoB'];
    const conexao = numeroValido(c) && c >= 0 && c <= 7 ? Math.trunc(c) : undefined;
    const pontoFixo = conexao === undefined && doc.tipo === 'conceitual' && l.kind === 'linha' && ehEspUniao(f.kind)
      ? slotsDaEspecializacao(doc, f).get(l.id) : undefined;
    return { forma: f, solto: false, conexao, pontoFixo };
  }
  const livre = l.props[qual === 'A' ? 'pontaA' : 'pontaB'];
  if (!pontoValido(livre)) return null;
  let p: Ponto = livre;
  const alvo = id ? doc.ligacoes.find((x) => x.id === id && x.id !== l.id) : undefined;
  if (alvo && profundidade < 3) {
    const c = caminhoDaLigacao(doc, alvo, profundidade + 1);
    if (c) p = projetarNaPolilinha(livre, c.pontos);
  }
  return { forma: { ...PSEUDO, x: p.x, y: p.y }, solto: true };
}

/** A ligação tem alguma ponta solta ou grudada em outra linha? */
export const temPontaSolta = (l: Ligacao): boolean => pontoValido(l.props.pontaA) || pontoValido(l.props.pontaB);

function rotaInteligente(doc: Diagrama, l: Ligacao, A: Extremo, B: Extremo): Ponto[] {
  const de = A.forma;
  const para = B.forma;
  const semConexao = A.conexao === undefined && B.conexao === undefined && !A.solto && !B.solto && !A.pontoFixo && !B.pontoFixo;
  if (doc.tipo === 'conceitual' && l.kind === 'linha' && semConexao) {
    const ambosEntRel = ehEntidadeOuRelacionamento(de) && ehEntidadeOuRelacionamento(para);
    if (ambosEntRel) return rotaEntidadeRelacionamento(de, para, doc.formas.filter(ehEntidadeOuRelacionamento));
    if (ehAtributo(de) !== ehAtributo(para)) {
      const atr = ehAtributo(de) ? de : para;
      const outra = atr === de ? para : de;
      if (ehEntidadeOuRelacionamento(outra)) return rotaAtributo(atr, outra, outra === de);
    }
    if (ehAtributo(de) && ehAtributo(para)) {
      const pa = pontoDoAtributo(de, false);
      const pb = pontoDoAtributo(para, true);
      return rotaGenerica({ forma: de, ponto: pa.ponto, lado: pa.lado }, { forma: para, ponto: pb.ponto, lado: pb.lado });
    }
  }
  const ponta = (e: Extremo, outro: Forma) => {
    if (e.pontoFixo) return { forma: e.forma, ponto: e.pontoFixo, lado: ladoVoltadoPara(e.forma, outro) };
    if (e.conexao === undefined) return { forma: e.forma };
    const lado = ladoDaConexao(e.conexao, centro(outro), e.forma);
    return { forma: e.forma, ponto: pontoDeConexao(e.forma, e.conexao), lado };
  };
  return rotaGenerica(ponta(A, para), ponta(B, de));
}

/** Ponto onde a ponta encosta na forma, em direção a `alvo` (respeita o ponto de conexão escolhido). */
function pontaNaForma(e: Extremo, alvo: Ponto): Ponto {
  if (e.solto) return { x: e.forma.x, y: e.forma.y };
  if (e.pontoFixo) return e.pontoFixo;
  if (e.conexao !== undefined) return pontoDeConexao(e.forma, e.conexao);
  return pontoNaBorda(e.forma, alvo);
}

/**
 * Caminho de uma ligação no diagrama (ou null se uma das pontas não existe).
 * Ordem: laço (mesma forma) > pontos de dobra manuais > ortogonal (inteligente) > reta.
 */
export function caminhoDaLigacao(doc: Diagrama, l: Ligacao, profundidade = 0): CaminhoLigacao | null {
  const A = extremoDaLigacao(doc, l, 'A', profundidade);
  const B = extremoDaLigacao(doc, l, 'B', profundidade);
  if (!A || !B) return null;
  const de = A.forma;
  const para = B.forma;

  if (!A.solto && !B.solto && de.id === para.id) {
    const c = centro(de);
    const a = { x: de.x + de.w, y: c.y - de.h / 4 };
    const b = { x: de.x + de.w, y: c.y + de.h / 4 };
    return {
      pontos: [a, b], a, b, meio: { x: a.x + 44, y: c.y }, antesA: { x: a.x + 50, y: a.y - 30 }, antesB: { x: b.x + 50, y: b.y + 30 },
      laco: true, d: `M${a.x},${a.y} C${a.x + 50},${a.y - 30} ${b.x + 50},${b.y + 30} ${b.x},${b.y}`,
    };
  }

  const manuais = pontosDeDobra(l);
  let pts: Ponto[];
  if (manuais.length) {
    pts = [pontaNaForma(A, manuais[0]), ...manuais, pontaNaForma(B, manuais[manuais.length - 1])];
  } else if (ehInteligente(l)) {
    pts = rotaInteligente(doc, l, A, B);
    if (A.solto) pts = [{ x: de.x, y: de.y }, ...pts.slice(1)];
    if (B.solto) pts = [...pts.slice(0, -1), { x: para.x, y: para.y }];
  } else {
    pts = [pontaNaForma(A, centro(para)), pontaNaForma(B, centro(de))];
  }
  if (pts.length < 2) pts = [pts[0], pts[0]];
  return {
    pontos: pts, a: pts[0], b: pts[pts.length - 1], meio: pontoMedioDaPolilinha(pts),
    antesA: pts[1], antesB: pts[pts.length - 2], laco: false, d: polilinha(pts),
  };
}

// ---- edição de pontos de dobra ----------------------------------------------

/** Distância do ponto ao segmento e a projeção nele. */
export function distanciaAoSegmento(p: Ponto, a: Ponto, b: Ponto): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const n = vx * vx + vy * vy;
  const t = n === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / n));
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}

/** Índice do segmento da polilinha (entre pts[i] e pts[i+1]) mais próximo de p, ou -1 se a distância passar de `limite`. */
export function segmentoMaisProximo(pts: Ponto[], p: Ponto, limite = 8): number {
  let melhor = -1;
  let menor = limite;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distanciaAoSegmento(p, pts[i], pts[i + 1]);
    if (d <= menor) { menor = d; melhor = i; }
  }
  return melhor;
}

/** Índice do ponto de dobra (em `pontos`) perto de p, ou -1. */
export function pontoDeDobraEm(pontos: Ponto[], p: Ponto, raio = 6): number {
  return pontos.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) <= raio);
}

/**
 * Insere um ponto de dobra em `p`. `caminho` é a polilinha completa atual (com as pontas), de modo que o
 * segmento clicado define a posição da inserção em `pontos`.
 */
export function inserirPontoDeDobra(pontos: Ponto[], caminho: Ponto[], p: Ponto): Ponto[] {
  const seg = segmentoMaisProximo(caminho, p, Infinity);
  //# Sem pontos manuais o caminho tem 2+ vértices de rota automática; o novo ponto vira o primeiro manual.
  const indice = pontos.length === 0 ? 0 : Math.max(0, Math.min(pontos.length, seg));
  const novo = [...pontos];
  novo.splice(indice, 0, { x: Math.round(p.x), y: Math.round(p.y) });
  return novo;
}

export const removerPontoDeDobra = (pontos: Ponto[], i: number): Ponto[] => pontos.filter((_, k) => k !== i);

export const moverPontoDeDobra = (pontos: Ponto[], i: number, p: Ponto): Ponto[] =>
  pontos.map((q, k) => (k === i ? { x: Math.round(p.x), y: Math.round(p.y) } : q));
