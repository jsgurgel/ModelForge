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

import { Diagrama, Forma } from './types';
import { FORMAS } from '../shapes/registry';
import { organizarEmGrade } from './ops';
import * as C from './conceitual';
import { reposicionarTextosApensos } from './textoApenso';

/**
 * Algoritmos de "Organizar":
 *  - fluxo/atividade: alinha os vizinhos para a ligação ficar reta;
 *  - tabelas do Lógico: layout por força direcionada + afastamento par a par;
 *  - EAP: organiza a árvore (versão recursiva).
 * Tudo é puro: recebe o diagrama e devolve o novo.
 */

type Doc = Diagrama;
interface Caixa { x: number; y: number; w: number; h: number }

const MARGEM_CANVAS = 40;

// ---------------------------------------------------------------- utilitários

const aplicar = (doc: Doc, pos: Map<string, { x: number; y: number }>): Doc => ({
  ...doc,
  formas: doc.formas.map((f) => {
    const p = pos.get(f.id);
    return p && (p.x !== f.x || p.y !== f.y) ? { ...f, x: Math.max(0, Math.round(p.x)), y: Math.max(0, Math.round(p.y)) } : f;
  }),
});

/** Vizinhos por ligação (ids de formas). */
export function vizinhos(doc: Doc, id: string): string[] {
  const out: string[] = [];
  for (const l of doc.ligacoes) {
    if (l.de === id && l.para !== id) out.push(l.para);
    else if (l.para === id && l.de !== id) out.push(l.de);
  }
  return out;
}

/**
 * Forma.MapaPosi: posição relativa de B em relação a A, no esquema
 *   1 2 3
 *   0 A 4
 *   7 6 5
 */
export function mapaPosi(A: Caixa, B: Caixa): number {
  let dist = Math.max(A.w, B.w);
  if (Math.abs(A.x - B.x) < dist) return A.y > B.y ? 2 : 6;
  dist = Math.max(A.h, B.h);
  if (Math.abs(A.y - B.y) < dist) return A.x > B.x ? 0 : 4;
  if (A.x < B.x) return A.y < B.y ? 5 : 3;
  return A.y > B.y ? 1 : 7;
}

// ------------------------------------------------------------- força direcionada

export interface Ponto2 { x: number; y: number }

/**
 * Repulsão entre todos os pares, atração nas arestas, temperatura que esfria.
 * Devolve as novas posições (canto superior esquerdo) sem o ajuste final.
 */
export function layoutForcas(nos: Caixa[], arestas: [number, number][], iteracoes: number, ideal: number): Ponto2[] {
  const pos = nos.map((n) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 }));
  let temp = ideal;
  for (let it = 0; it < iteracoes; it++) {
    const fo = nos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < nos.length; i++) {
      for (let j = i + 1; j < nos.length; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const dist = Math.max(Math.hypot(dx, dy), 1);
        const rep = (ideal * ideal) / dist;
        fo[i].x += (dx / dist) * rep; fo[i].y += (dy / dist) * rep;
        fo[j].x -= (dx / dist) * rep; fo[j].y -= (dy / dist) * rep;
      }
    }
    for (const [a, b] of arestas) {
      const dx = pos[a].x - pos[b].x;
      const dy = pos[a].y - pos[b].y;
      const dist = Math.max(Math.hypot(dx, dy), 1);
      const atr = (dist * dist) / ideal;
      fo[a].x -= (dx / dist) * atr; fo[a].y -= (dy / dist) * atr;
      fo[b].x += (dx / dist) * atr; fo[b].y += (dy / dist) * atr;
    }
    for (let i = 0; i < nos.length; i++) {
      const mag = Math.max(Math.hypot(fo[i].x, fo[i].y), 0.001);
      const passo = Math.min(mag, temp);
      pos[i].x += (fo[i].x / mag) * passo;
      pos[i].y += (fo[i].y / mag) * passo;
    }
    temp *= 0.95;
  }
  return nos.map((n, i) => ({ x: Math.round(pos[i].x - n.w / 2), y: Math.round(pos[i].y - n.h / 2) }));
}

/** Encolhe para caber no canvas e afasta da borda `margem`. */
export function ajusteFinal(caixas: Caixa[], margem: number, largura: number, altura: number): Ponto2[] {
  if (!caixas.length) return [];
  const minL = Math.min(...caixas.map((c) => c.x));
  const minT = Math.min(...caixas.map((c) => c.y));
  const maxR = Math.max(...caixas.map((c) => c.x + c.w));
  const maxB = Math.max(...caixas.map((c) => c.y + c.h));
  const aw = Math.max(1, largura - 2 * margem);
  const ah = Math.max(1, altura - 2 * margem);
  const escala = Math.min(1, aw / Math.max(1, maxR - minL), ah / Math.max(1, maxB - minT));
  return caixas.map((c) => ({ x: margem + Math.round((c.x - minL) * escala), y: margem + Math.round((c.y - minT) * escala) }));
}

// ---------------------------------------------------------------- Tabelas

const DIST_LEFT = 160;
const DIST_TOP = 80;

/** Devolve o deslocamento a aplicar em `dest` (0 se nada). */
export function distanciaMinima(ori: Caixa, dest: Caixa): Ponto2 {
  const m = mapaPosi(ori, dest);
  let x = 0;
  let y = 0;
  switch (m) {
    case 6:
      if (dest.y - (ori.y + ori.h) < DIST_TOP) y = DIST_TOP - (dest.y - (ori.y + ori.h));
      break;
    case 5: {
      const distX = dest.x - (ori.x + ori.w);
      const distY = dest.y - (ori.y + ori.h);
      if (distY < DIST_TOP) y = DIST_TOP - distY;
      if (distX < DIST_LEFT) x = DIST_LEFT - distX;
      if (x > y) x = distX < DIST_LEFT / 4 ? Math.trunc(DIST_LEFT / 4) : 0;
      else y = distY < DIST_TOP / 4 ? Math.trunc(DIST_TOP / 4) : 0;
      break;
    }
    case 3:
    case 4:
      if (dest.x - (ori.x + ori.w) < DIST_LEFT) x = DIST_LEFT - (dest.x - (ori.x + ori.w));
      break;
    default:
  }
  return { x: x > 0 ? x : 0, y: y > 0 ? y : 0 };
}

function aplicarDistancias(caixas: Caixa[], ordem: number[]): boolean {
  let mexeu = false;
  for (const i of ordem) {
    for (const j of ordem) {
      if (i === j) continue;
      const d = distanciaMinima(caixas[i], caixas[j]);
      if (d.x > 0 || d.y > 0) { caixas[j] = { ...caixas[j], x: caixas[j].x + d.x, y: caixas[j].y + d.y }; mexeu = true; }
    }
  }
  return mexeu;
}

/** Organiza as tabelas do Lógico. */
export function organizarTabelas(doc: Doc): Doc {
  const idx = doc.formas.map((f, i) => (f.kind === 'tabela' ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 1) return doc;
  const ids = idx.map((i) => doc.formas[i].id);
  let caixas: Caixa[] = idx.map((i) => ({ x: doc.formas[i].x, y: doc.formas[i].y, w: doc.formas[i].w, h: doc.formas[i].h }));
  const posDe = new Map(ids.map((id, k) => [id, k]));
  if (caixas.length > 1) {
    const arestas: [number, number][] = [];
    for (const l of doc.ligacoes) {
      const a = posDe.get(l.de);
      const b = posDe.get(l.para);
      if (a !== undefined && b !== undefined && a !== b) arestas.push([a, b]);
    }
    const np = layoutForcas(caixas, arestas, 150, DIST_LEFT);
    caixas = caixas.map((c, k) => ({ ...c, ...np[k] }));
    const aj = ajusteFinal(caixas, MARGEM_CANVAS, doc.largura, doc.altura);
    caixas = caixas.map((c, k) => ({ ...c, ...aj[k] }));
  }
  const todos = caixas.map((_, k) => k);
  aplicarDistancias(caixas, todos);
  const porX = [...todos].sort((a, b) => caixas[a].x - caixas[b].x);
  aplicarDistancias(caixas, porX);
  for (let ciclo = 0; ciclo < 4; ciclo++) {
    const aj = ajusteFinal(caixas, MARGEM_CANVAS, doc.largura, doc.altura);
    caixas = caixas.map((c, k) => ({ ...c, ...aj[k] }));
    aplicarDistancias(caixas, todos);
    aplicarDistancias(caixas, porX);
  }
  const aj = ajusteFinal(caixas, MARGEM_CANVAS, doc.largura, doc.altura);
  const pos = new Map(ids.map((id, k) => [id, aj[k]]));
  return aplicar(doc, pos);
}

// ---------------------------------------------------------------- Fluxo / Atividade

/** Formas que mostram "organizar ligações": Início/Fim do fluxo e da atividade. */
export const ORIGENS_DE_FLUXO = ['fluxIniFim', 'inicioAtividade', 'fimAtividade'];

/**
 * Forma.OrganizeFluxo: a partir de `origemId`, percorre os vizinhos e move cada um perpendicularmente à
 * ligação para que ela fique reta (a linha só é "reta" quando as pontas estão em lados opostos).
 */
export function organizarFluxo(doc: Doc, origemId: string): Doc {
  const m = new Map(doc.formas.map((f) => [f.id, { x: f.x, y: f.y, w: f.w, h: f.h }]));
  if (!m.has(origemId)) return doc;
  const ja = new Set<string>([origemId]);
  const visita = (origem: string, dest: string) => {
    if (ja.has(dest)) return;
    const o = m.get(origem)!;
    const d = m.get(dest)!;
    const pos = mapaPosi(o, d);
    //# lados opostos (esq-dir ou topo-base): lado 0/4 = horizontal, 2/6 = vertical.
    if (pos === 4 || pos === 0) d.y += o.y + o.h / 2 - (d.y + d.h / 2);
    else if (pos === 2 || pos === 6) d.x += o.x + o.w / 2 - (d.x + d.w / 2);
    ja.add(dest);
    for (const v of vizinhos(doc, dest)) visita(dest, v);
  };
  for (const v of vizinhos(doc, origemId)) visita(origemId, v);
  return aplicar(doc, new Map([...m].map(([id, c]) => [id, { x: c.x, y: c.y }])));
}

// ---------------------------------------------------------------- EAP

export const LARG_BARRA = 10;

export interface BarraEap { id: string; principal: string; filhos: string[]; direcao: 'Vertical' | 'Horizontal'; posicao: 'Centro' | 'Esquerda' | 'Direita'; distancia: number }

export const direcaoDaBarra = (f: Forma): 'Vertical' | 'Horizontal' => (f.props.direcao === 'Vertical' ? 'Vertical' : 'Horizontal');
export const posicaoDaBarra = (f: Forma): 'Centro' | 'Esquerda' | 'Direita' => (f.props.posicao === 'Esquerda' || f.props.posicao === 'Direita' ? f.props.posicao : 'Centro');
export const distanciaDaBarra = (f: Forma): number => (typeof f.props.distancia === 'number' && f.props.distancia >= 0 ? f.props.distancia : LARG_BARRA);

/** Barras da EAP com a forma "principal" (a mais acima, como capturePrincipal) e as demais ligadas. */
export function barrasDaEap(doc: Doc): BarraEap[] {
  const out: BarraEap[] = [];
  for (const b of doc.formas) {
    if (b.kind !== 'eapBarraLigacao') continue;
    const lig = [...new Set(vizinhos(doc, b.id))].map((id) => doc.formas.find((f) => f.id === id)).filter((f): f is Forma => !!f && f.kind !== 'eapBarraLigacao');
    if (lig.length < 1) continue;
    const ord = [...lig].sort((p, q) => p.y - q.y || p.x - q.x);
    out.push({
      id: b.id, principal: ord[0].id, filhos: ord.slice(1).sort((p, q) => p.x - q.x).map((f) => f.id),
      direcao: direcaoDaBarra(b), posicao: posicaoDaBarra(b), distancia: distanciaDaBarra(b),
    });
  }
  return out;
}

interface Layout { pos: Map<string, Caixa>; tocados: Set<string> }

/** Largura horizontal ocupada por uma forma e toda a sua subárvore. */
function larguraSub(id: string, l: Layout, porPrincipal: Map<string, BarraEap[]>, vistos: Set<string>): number {
  const c = l.pos.get(id)!;
  const barras = porPrincipal.get(id);
  if (!barras || vistos.has(id)) return c.w;
  vistos.add(id);
  let total = c.w;
  for (const b of barras) {
    if (b.direcao === 'Vertical') {
      const sub = Math.max(0, ...b.filhos.map((f) => larguraSub(f, l, porPrincipal, vistos)));
      total = Math.max(total, c.w / 2 + b.distancia * 2 + sub);
    } else {
      const soma = b.filhos.reduce((s, f) => s + larguraSub(f, l, porPrincipal, vistos) + b.distancia, 0) - b.distancia;
      total = Math.max(total, soma);
    }
  }
  vistos.delete(id);
  return total;
}

/**
 * Posiciona `id` (canto superior esquerdo em `x`,`y`) e, se `recursivo`, toda a subárvore; devolve a base (y) ocupada.
 * Barra horizontal: filhos numa linha abaixo; posição Centro centraliza os filhos sob o pai, Esquerda põe o pai sobre a
 * ponta esquerda da barra, Direita sobre a direita. Barra vertical: filhos empilhados à direita da barra.
 */
function posicionar(id: string, x: number, y: number, l: Layout, porPrincipal: Map<string, BarraEap[]>, barrasPos: Map<string, Caixa>, recursivo: boolean, vistos: Set<string>): number {
  const c = l.pos.get(id)!;
  c.x = x; c.y = y;
  l.tocados.add(id);
  let base = y + c.h;
  const barras = porPrincipal.get(id);
  if (!barras || vistos.has(id)) return base;
  vistos.add(id);
  for (const b of barras) {
    const dist = b.distancia;
    if (b.filhos.length === 0) continue;
    if (b.direcao === 'Vertical') {
      const bx = c.x + Math.round((c.w - LARG_BARRA) / 2);
      const by = c.y + c.h + LARG_BARRA;
      let ty = c.y + c.h + 2 * dist;
      let ultimoMeio = by;
      for (const fid of b.filhos) {
        const f = l.pos.get(fid)!;
        const fx = bx + 2 * LARG_BARRA;
        const bas = recursivo
          ? posicionar(fid, fx, ty, l, porPrincipal, barrasPos, true, vistos)
          : (f.x = fx, f.y = ty, l.tocados.add(fid), ty + f.h);
        ultimoMeio = f.y + Math.round(f.h / 2);
        ty = Math.max(bas, f.y + f.h) + 2 * dist;
        base = Math.max(base, bas);
      }
      barrasPos.set(b.id, { x: bx, y: by, w: LARG_BARRA, h: Math.max(LARG_BARRA, ultimoMeio - by + 1) });
    } else {
      const larguras = b.filhos.map((fid) => (recursivo ? larguraSub(fid, l, porPrincipal, new Set(vistos)) : l.pos.get(fid)!.w));
      const total = larguras.reduce((s, w) => s + w, 0) + dist * (b.filhos.length - 1);
      const cx = c.x + c.w / 2;
      let inicio: number;
      //# Esquerda: o pai fica sobre o centro do primeiro filho; Direita: sobre o do último; Centro: no meio.
      if (b.posicao === 'Esquerda') inicio = cx - larguras[0] / 2;
      else if (b.posicao === 'Direita') inicio = cx - (total - larguras[larguras.length - 1] / 2);
      else inicio = cx - total / 2;
      const by = c.y + c.h + LARG_BARRA + Math.trunc(LARG_BARRA / 2);
      const ty = by + LARG_BARRA + Math.trunc(LARG_BARRA / 2);
      let x0 = inicio;
      const centros: number[] = [];
      b.filhos.forEach((fid, k) => {
        const f = l.pos.get(fid)!;
        const fx = x0 + (larguras[k] - f.w) / 2;
        const bas = recursivo
          ? posicionar(fid, fx, ty, l, porPrincipal, barrasPos, true, vistos)
          : (f.x = fx, f.y = ty, l.tocados.add(fid), ty + f.h);
        centros.push(f.x + f.w / 2);
        base = Math.max(base, bas);
        x0 += larguras[k] + dist;
      });
      const bx1 = b.filhos.length > 1 ? centros[0] : cx - LARG_BARRA / 2;
      const bx2 = b.filhos.length > 1 ? centros[centros.length - 1] : cx + LARG_BARRA / 2;
      //# A barra sempre alcança o centro do pai (a ligação do pai chega ao topo da barra).
      const bxa = Math.min(bx1, cx);
      const bxb = Math.max(bx2, cx);
      barrasPos.set(b.id, { x: bxa, y: by, w: Math.max(LARG_BARRA, bxb - bxa), h: LARG_BARRA });
    }
  }
  vistos.delete(id);
  return base;
}

function organizarBarras(doc: Doc, barras: BarraEap[], raizes: string[], recursivo: boolean): Doc {
  const l: Layout = { pos: new Map(doc.formas.map((f) => [f.id, { x: f.x, y: f.y, w: f.w, h: f.h }])), tocados: new Set() };
  const porPrincipal = new Map<string, BarraEap[]>();
  for (const b of barras) porPrincipal.set(b.principal, [...(porPrincipal.get(b.principal) ?? []), b]);
  const barrasPos = new Map<string, Caixa>();
  for (const r of raizes) {
    const c = l.pos.get(r);
    if (c) posicionar(r, c.x, c.y, l, porPrincipal, barrasPos, recursivo, new Set());
  }
  //# A árvore pode ter passado da borda esquerda (filhos à esquerda do pai): desloca a árvore inteira para dentro do canvas.
  const movidos = [...l.tocados].map((id) => l.pos.get(id)!);
  let minX = 0;
  for (const c of [...movidos, ...barrasPos.values()]) minX = Math.min(minX, c.x);
  if (minX < 0) {
    for (const c of movidos) c.x -= minX;
    for (const c of barrasPos.values()) c.x -= minX;
  }
  return {
    ...doc,
    formas: doc.formas.map((f) => {
      const b = barrasPos.get(f.id);
      const c = b ?? l.pos.get(f.id)!;
      const x = Math.max(0, Math.round(c.x));
      const y = Math.max(0, Math.round(c.y));
      const w = b ? Math.round(b.w) : f.w;
      const h = b ? Math.round(b.h) : f.h;
      return x === f.x && y === f.y && w === f.w && h === f.h ? f : { ...f, x, y, w, h };
    }),
  };
}

/** "Organizar" da barra: reposiciona só os filhos diretos dessa barra (PreOrganizeEap). */
export function organizarBarraEap(doc: Doc, barraId: string): Doc {
  const b = barrasDaEap(doc).find((x) => x.id === barraId);
  if (!b) return doc;
  return organizarBarras(doc, [b], [b.principal], false);
}

/** "Organizar completo": toda a hierarquia a partir das raízes (FullOrganizeEap). Se `barraId`, só a árvore dessa barra. */
export function organizarEapCompleto(doc: Doc, barraId?: string): Doc {
  const barras = barrasDaEap(doc);
  if (!barras.length) return doc;
  const filhosDe = new Set(barras.flatMap((b) => b.filhos));
  let raizes = [...new Set(barras.map((b) => b.principal))].filter((p) => !filhosDe.has(p));
  if (!raizes.length) raizes = [barras[0].principal];
  if (barraId) {
    const alvo = barras.find((b) => b.id === barraId);
    if (!alvo) return doc;
    raizes = [alvo.principal];
  }
  return organizarBarras(doc, barras, raizes, true);
}

// ---------------------------------------------------------------- despacho

/** Formas que "seguem" o dono no layout por força: atributos do Conceitual acompanham a entidade/relacionamento. */
function seguidoresDoConceitual(doc: Doc): Map<string, string> {
  const seg = new Map<string, string>();
  for (const f of doc.formas) {
    if (f.kind !== 'atributo' && f.kind !== 'atributoMulti') continue;
    const dono = C.donoDoAtributo(doc, f.id);
    if (dono) seg.set(f.id, dono.id);
  }
  return seg;
}

/** Layout geral por força (Conceitual, Livre, NoSQL etc.): move os "seguidores" junto do dono. */
export function organizarPorForcas(doc: Doc, incluir: (f: Forma) => boolean = () => true, seguidores = new Map<string, string>()): Doc {
  const nos = doc.formas.filter((f) => incluir(f) && !seguidores.has(f.id) && !FORMAS[f.kind]?.geo.startsWith('legend'));
  if (nos.length < 1) return doc;
  const ids = new Map(nos.map((f, i) => [f.id, i]));
  const raizDe = (id: string): string => { let x = id; let n = 0; while (seguidores.has(x) && n++ < 20) x = seguidores.get(x)!; return x; };
  const arestas: [number, number][] = [];
  for (const l of doc.ligacoes) {
    const a = ids.get(raizDe(l.de));
    const b = ids.get(raizDe(l.para));
    if (a !== undefined && b !== undefined && a !== b) arestas.push([a, b]);
  }
  let caixas: Caixa[] = nos.map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h }));
  if (nos.length > 1) {
    const np = layoutForcas(caixas, arestas, 150, 180);
    caixas = caixas.map((c, k) => ({ ...c, ...np[k] }));
  }
  const aj = ajusteFinal(caixas, MARGEM_CANVAS, doc.largura, doc.altura);
  const delta = new Map<string, Ponto2>();
  nos.forEach((f, k) => delta.set(f.id, { x: aj[k].x - f.x, y: aj[k].y - f.y }));
  return {
    ...doc,
    formas: doc.formas.map((f) => {
      const d = delta.get(f.id) ?? delta.get(raizDe(f.id));
      return d && (d.x || d.y) ? { ...f, x: Math.max(0, f.x + d.x), y: Math.max(0, f.y + d.y) } : f;
    }),
  };
}

/**
 * Comando "Organizar diagrama": escolhe o algoritmo pelo tipo. Com uma forma de origem do fluxo selecionada,
 * organiza a partir dela (equivale ao botão "Organizar ligações" da forma).
 */
export function organizarDiagrama(doc: Doc, selecao: string[] = []): Doc {
  if (!doc.formas.length) return doc;
  return reposicionarTextosApensos(organizarPorTipo(doc, selecao));
}

function organizarPorTipo(doc: Doc, selecao: string[]): Doc {
  switch (doc.tipo) {
    case 'logico':
      return organizarTabelas(doc);
    case 'fluxo':
    case 'atividade': {
      const origens = doc.formas.filter((f) => ORIGENS_DE_FLUXO.includes(f.kind));
      const escolhidas = origens.filter((f) => selecao.includes(f.id));
      let res = doc;
      for (const o of escolhidas.length ? escolhidas : origens) res = organizarFluxo(res, o.id);
      return res;
    }
    case 'eap': {
      const barra = doc.formas.find((f) => f.kind === 'eapBarraLigacao' && selecao.includes(f.id));
      return organizarEapCompleto(doc, barra?.id);
    }
    case 'conceitual':
      return organizarPorForcas(doc, () => true, seguidoresDoConceitual(doc));
    case 'nosql':
      return organizarEmGrade(doc);
    default:
      return organizarPorForcas(doc);
  }
}
