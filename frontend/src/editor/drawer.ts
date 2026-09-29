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

/**
 * LivreDrawer: bloco de medidas (réguas, unidade,
 * proporção), quadro e itens (Retângulo, Elipse, Curva, Arco, Path, Imagem) com geometria em texto.
 * Só lógica pura; o desenho fica em shapes/renderDrawer.tsx.
 *
 * Props da forma (todas opcionais): unidadeMedida, proporcaoPx, proporcaoMedida, metricaEsq/Topo/Baixo/Dir (padrão true),
 * corRegua (#00cccc), margem (24), mostrarTextoRegua (true), pintarBorda (true), roundrect (22), delimite (false),
 * itens (ItemDesenho[], com os campos extras de ItemDrawer).
 */

export interface MedidasDrawer {
  unidade: string;
  /** Quantidade de pixels que equivale a `medida` (Proporção). */
  px: number;
  medida: number;
  esq: boolean; topo: boolean; baixo: boolean; dir: boolean;
  corRegua: string;
  margem: number;
  mostrarTexto: boolean;
  pintarBorda: boolean;
  roundrect: number;
  delimite: boolean;
}

export const MARGEM_PADRAO = 24;
export const COR_REGUA_PADRAO = '#00cccc';
const LARG_TRACO = 4;

const numOu = (v: unknown, pad: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : pad);
const boolOu = (v: unknown, pad: boolean): boolean => (typeof v === 'boolean' ? v : pad);

/** Lê o bloco de medidas com os padrões do baseDrawer. */
export function medidasDoDrawer(f: Forma): MedidasDrawer {
  const p = f.props;
  return {
    unidade: typeof p.unidadeMedida === 'string' ? p.unidadeMedida : '',
    px: Math.max(1, Math.trunc(numOu(p.proporcaoPx, 1))),
    medida: Math.max(1, Math.trunc(numOu(p.proporcaoMedida, 1))),
    esq: boolOu(p.metricaEsq, true), topo: boolOu(p.metricaTopo, true), baixo: boolOu(p.metricaBaixo, true), dir: boolOu(p.metricaDir, true),
    corRegua: typeof p.corRegua === 'string' && p.corRegua ? p.corRegua : COR_REGUA_PADRAO,
    margem: Math.max(0, Math.trunc(numOu(p.margem, MARGEM_PADRAO))),
    mostrarTexto: boolOu(p.mostrarTextoRegua, true),
    pintarBorda: boolOu(p.pintarBorda, true),
    roundrect: Math.max(0, Math.trunc(numOu(p.roundrect, 22))),
    delimite: boolOu(p.delimite, false),
  };
}

/** Proporção (pixels e medida): menor que 2 vira 1. */
export const normalizarProporcao = (v: number): number => (Number.isFinite(v) && Math.trunc(v) >= 2 ? Math.trunc(v) : 1);

/** Margem: fora de [0, largura/2] e [0, altura/2] volta para 14. */
export const normalizarMargem = (m: number, w: number, h: number): number => (!Number.isFinite(m) || m > w / 2 || m > h / 2 || m < 0 ? 14 : Math.trunc(m));

/** Área interna de pintura (DimensioneParaPintura): a forma menos a margem dos dois lados. */
export const areaDoDrawer = (f: Forma, m: MedidasDrawer): { L: number; T: number; W: number; H: number } => ({ L: m.margem, T: m.margem, W: f.w - 2 * m.margem, H: f.h - 2 * m.margem });

/** Alguma régua ligada? (define o ForceDisable de "Mostrar texto"). */
export const temRegua = (m: Pick<MedidasDrawer, 'esq' | 'topo' | 'baixo' | 'dir'>): boolean => m.esq || m.topo || m.baixo || m.dir;

/** DecimalFormat("0.00") ou "0.##" com vírgula decimal. */
export function converterMedida(valor: number, m: Pick<MedidasDrawer, 'px' | 'medida'>): string {
  const r = (valor * m.medida) / m.px;
  const t = m.medida !== m.px ? r.toFixed(2) : String(Math.round(r * 100) / 100);
  return t.replace('.', ',');
}

export const formatarUnidade = (valor: number, m: MedidasDrawer): string => converterMedida(valor, m) + m.unidade;

/** Largura/altura em unidade de medida: texto na unidade -> tamanho em pixels da forma (inclui as duas margens). */
export function tamanhoPelaMedida(texto: string, m: MedidasDrawer): number | null {
  const n = Number(texto.trim().replace(',', '.'));
  if (!Number.isFinite(n) || texto.trim() === '') return null;
  return Math.round((n * m.px) / m.medida) + 2 * m.margem;
}

// ---------------------------------------------------------------- régua

export interface Segmento { x1: number; y1: number; x2: number; y2: number }

/** calculeSubEspaco: passo (px) entre os marcos maiores, dobrando a proporção até chegar a pelo menos 32. */
export function passoDaRegua(m: Pick<MedidasDrawer, 'px' | 'medida'>): number {
  let pro = m.px / m.medida;
  while (pro < 32) pro *= 2;
  return Math.round(pro);
}

/** modInteiro: divisor (5, 4, 3, 2) usado nos marcos menores; 0 se o passo for primo com todos. */
export function divisorDoPasso(v: number): number {
  for (const d of [5, 4, 3, 2]) if (v % d === 0) return d;
  return 0;
}

/** Régua superior (topo) ou inferior: traço horizontal com marcas (bordaTopDown). Coordenadas locais da forma. */
export function reguaHorizontal(f: Forma, m: MedidasDrawer, topo: boolean): Segmento[] {
  const xini = m.margem;
  const xfim = f.w - m.margem;
  const preY = topo ? 0 : f.h;
  const yfim = preY + (topo ? 2 : -2);
  let traco = Math.min(LARG_TRACO, m.margem);
  traco = topo ? traco : -traco;
  const yt = yfim;
  const seg: Segmento[] = [
    { x1: xini, y1: yt, x2: xini, y2: yt + 2 * traco },
    { x1: xfim, y1: yt, x2: xfim, y2: yt + 2 * traco },
    { x1: xini, y1: yfim, x2: xfim, y2: yfim },
  ];
  const blc = passoDaRegua(m);
  const dv = divisorDoPasso(blc);
  const sub = dv > 0 ? Math.trunc(blc / dv) : 0;
  let sr = xini;
  while (sr < xfim) {
    if (dv > 0 && sub > 0) {
      for (let a = sub; a < blc; a += sub) if (sr + a < xfim) seg.push({ x1: sr + a, y1: yt, x2: sr + a, y2: yt + Math.trunc(traco / 2) });
    }
    sr += blc;
    if (sr < xfim) seg.push({ x1: sr, y1: yt, x2: sr, y2: yt + traco });
  }
  return seg;
}

/** Régua esquerda ou direita. O passo usa a largura. */
export function reguaVertical(f: Forma, m: MedidasDrawer, direita: boolean): Segmento[] {
  const preX = direita ? f.w : 0;
  let traco = Math.min(LARG_TRACO, m.margem);
  traco = direita ? -traco : traco;
  const xIni = preX + (direita ? -2 : 2);
  let xFim = xIni + 2 * traco;
  const yIni = m.margem;
  const yFim = f.h - m.margem;
  const seg: Segmento[] = [
    { x1: xIni, y1: yIni, x2: xFim, y2: yIni },
    { x1: xIni, y1: yFim, x2: xFim, y2: yFim },
    { x1: xIni, y1: yIni, x2: xIni, y2: yFim },
  ];
  const blc = passoDaRegua(m);
  xFim -= traco;
  const dv = divisorDoPasso(blc);
  const sub = dv > 0 ? Math.trunc(blc / dv) : 0;
  let sr = yIni;
  while (sr < yFim) {
    if (dv > 0 && sub > 0) {
      for (let a = blc - sub; a > 0; a -= sub) if (sr + a < yFim) seg.push({ x1: xIni, y1: sr + a, x2: xFim - Math.trunc(traco / 2), y2: sr + a });
    }
    seg.push({ x1: xIni, y1: sr, x2: xFim, y2: sr });
    sr += blc;
  }
  return seg;
}

// ---------------------------------------------------------------- expressões e geometria dos itens

export interface Vars { L: number; T: number; W: number; H: number }

/**
 * Avalia uma expressão inteira (Expr/ProcessadorExprSimples): números, L/T/W/H (sem distinguir caixa), + - * / e parênteses.
 * Devolve NaN se inválida. O resultado é truncado para inteiro.
 */
export function avaliarExpr(texto: string, v: Vars): number {
  const s = texto.replace(/\s+/g, '').replace(/[lL]/g, `(${v.L})`).replace(/[tT]/g, `(${v.T})`).replace(/[wW]/g, `(${v.W})`).replace(/[hH]/g, `(${v.H})`);
  if (!s || /[^0-9+\-*/().]/.test(s)) return NaN;
  let i = 0;
  const peek = () => s[i];
  const fator = (): number => {
    if (peek() === '-') { i++; return -fator(); }
    if (peek() === '+') { i++; return fator(); }
    if (peek() === '(') {
      i++;
      const r = soma();
      if (peek() !== ')') return NaN;
      i++;
      return r;
    }
    const m = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (!m) return NaN;
    i += m[0].length;
    return Number(m[0]);
  };
  const termo = (): number => {
    let r = fator();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      const b = fator();
      r = op === '*' ? r * b : b === 0 ? NaN : r / b;
    }
    return r;
  };
  const soma = (): number => {
    let r = termo();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const b = termo();
      r = op === '+' ? r + b : r - b;
    }
    return r;
  };
  const res = soma();
  return i === s.length && Number.isFinite(res) ? Math.trunc(res) : NaN;
}

/** Lista de pontos separada por vírgulas; qualquer erro devolve [0, 0] (o item aparece como "?"). */
export function numerosDaExpr(texto: string, v: Vars): number[] {
  const partes = texto.split(',');
  const res = partes.map((p) => avaliarExpr(p, v));
  return res.some((n) => Number.isNaN(n)) ? [0, 0] : res;
}

export type TipoItemDrawer = 'retangulo' | 'elipse' | 'curva' | 'arco' | 'path' | 'imagem';

export const TIPOS_ITEM_DRAWER: { valor: TipoItemDrawer; rotulo: string }[] = [
  { valor: 'retangulo', rotulo: 'Retângulo' },
  { valor: 'elipse', rotulo: 'Circulo/Elipse' },
  { valor: 'curva', rotulo: 'Curva' },
  { valor: 'arco', rotulo: 'Arco' },
  { valor: 'path', rotulo: 'Path (pontos)' },
  { valor: 'imagem', rotulo: 'Imagem' },
];

/** Valores padrão de baseDrawerItem. */
export const EXPR_PADRAO = {
  retangulo: 'L,T,W-2,H-2',
  elipse: 'L, T, W - 2, H - 2',
  curva: 'L, T, L + W - 2, T + H - 2, L, T + H - 2, L, T',
  arco: 'L,T,W,H,90,135,0',
  path: 'L, T, L + W - 2, T + H - 2, L, T + H - 2, L, T',
  imagem: 'L,T,200,200',
} as const;

/** Campos que um item do Drawer pode ter além dos de ItemDesenho (todos opcionais). */
export interface ItemDrawerExtra {
  /** Geometria em texto (Retângulo/Elipse/Curva/Arco/Path/Posição da imagem). */
  expr?: string;
  /** "Herdar pintura": usa a pintura (gradiente/cor) do próprio quadro. */
  herdar?: boolean;
  gradDir?: 'Vertical' | 'Horizontal';
  /** Cor inicial do gradiente do item (a final é `cor2`). */
  grad1?: string;
  src?: string;
  imgNome?: string;
  imgW?: number;
  imgH?: number;
}

export type ItemDrawer = {
  tipo: string;
  x: number; y: number; w: number; h: number;
  pontos?: { x: number; y: number }[];
  cor: string; preencher: boolean; largura: number;
  gradiente?: boolean; cor2?: string;
} & ItemDrawerExtra;

const ehTipoNovo = (t: string): t is TipoItemDrawer => TIPOS_ITEM_DRAWER.some((x) => x.valor === t);

/** Item novo do editor ("Novo"): retângulo cobrindo a área. */
export const novoItemDrawer = (tipo: TipoItemDrawer = 'retangulo'): ItemDrawer => ({
  tipo, x: 0, y: 0, w: 0, h: 0, cor: '#000000', preencher: true, largura: 1, expr: EXPR_PADRAO[tipo],
});

/**
 * Converte um item do desenho livre antigo (coordenadas numéricas) para o modelo por expressão, quando possível;
 * caminho/polilinha/linha continuam como estão (o editor os mostra como somente cor/pintura).
 */
export function itemComExpr(it: ItemDrawer): ItemDrawer {
  if (it.expr !== undefined || !ehTipoNovo(it.tipo)) {
    if (it.expr !== undefined) return it;
    if (it.tipo === 'retangulo') return { ...it, expr: `${it.x},${it.y},${it.w},${it.h}` };
    if (it.tipo === 'elipse') return { ...it, expr: `${it.x},${it.y},${it.w},${it.h}` };
  }
  if (it.tipo === 'retangulo' || it.tipo === 'elipse') return { ...it, expr: `${Math.round(it.x)},${Math.round(it.y)},${Math.round(it.w)},${Math.round(it.h)}` };
  return it;
}

export type Geo =
  | { forma: 'retangulo'; x: number; y: number; w: number; h: number; rx?: number; ry?: number }
  | { forma: 'elipse'; x: number; y: number; w: number; h: number }
  | { forma: 'caminho'; d: string }
  | { forma: 'imagem'; x: number; y: number; w: number; h: number }
  | { forma: 'erro' };

const f2 = (n: number) => String(Math.round(n * 100) / 100);

/** Caminho SVG do arco de Arc2D (início e extensão em graus, sentido anti-horário; tipo 0 aberto, 1 corda, 2 pizza). */
export function caminhoDoArco(x: number, y: number, w: number, h: number, ini: number, ext: number, tipo: number): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const pt = (a: number) => [cx + rx * Math.cos((a * Math.PI) / 180), cy - ry * Math.sin((a * Math.PI) / 180)];
  if (Math.abs(ext) >= 360) {
    return `M${f2(cx - rx)},${f2(cy)} A${f2(rx)},${f2(ry)} 0 1 0 ${f2(cx + rx)},${f2(cy)} A${f2(rx)},${f2(ry)} 0 1 0 ${f2(cx - rx)},${f2(cy)} Z`;
  }
  const [sx, sy] = pt(ini);
  const [ex, ey] = pt(ini + ext);
  const grande = Math.abs(ext) > 180 ? 1 : 0;
  const sweep = ext > 0 ? 0 : 1;
  let d = `M${f2(sx)},${f2(sy)} A${f2(rx)},${f2(ry)} 0 ${grande} ${sweep} ${f2(ex)},${f2(ey)}`;
  if (tipo === 2) d += ` L${f2(cx)},${f2(cy)} Z`;
  else if (tipo === 1) d += ' Z';
  return d;
}

/** Geometria do item. */
export function geometriaDoItem(it: ItemDrawer, v: Vars): Geo {
  const expr = it.expr;
  const tipo = it.tipo;
  if (expr === undefined) return { forma: 'erro' };
  const p = numerosDaExpr(expr, v);
  switch (tipo) {
    case 'elipse':
      return p.length === 4 ? { forma: 'elipse', x: p[0], y: p[1], w: p[2], h: p[3] } : { forma: 'erro' };
    case 'retangulo':
      if (p.length === 4) return { forma: 'retangulo', x: p[0], y: p[1], w: p[2], h: p[3] };
      if (p.length === 6) return { forma: 'retangulo', x: p[0], y: p[1], w: p[2], h: p[3], rx: p[4] / 2, ry: p[5] / 2 };
      return { forma: 'erro' };
    case 'curva':
      if (p.length === 8) return { forma: 'caminho', d: `M${p[0]},${p[1]} C${p[2]},${p[3]} ${p[4]},${p[5]} ${p[6]},${p[7]}` };
      if (p.length === 6) return { forma: 'caminho', d: `M${p[0]},${p[1]} Q${p[2]},${p[3]} ${p[4]},${p[5]}` };
      return { forma: 'erro' };
    case 'arco':
      return p.length === 7 ? { forma: 'caminho', d: caminhoDoArco(p[0], p[1], p[2], p[3], p[4], p[5], p[6]) } : { forma: 'erro' };
    case 'imagem':
      return p.length === 4 ? { forma: 'imagem', x: p[0], y: p[1], w: p[2], h: p[3] } : { forma: 'erro' };
    case 'path': {
      const partes = expr.split(',');
      if (partes.length < 3) return { forma: 'erro' };
      const nums = partes.length % 2 ? [...p, 0] : p;
      if (nums.length < 4 || (nums.length === 2 && p[0] === 0)) return { forma: 'erro' };
      const pts: string[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push(`${i ? 'L' : 'M'}${nums[i]},${nums[i + 1]}`);
      return { forma: 'caminho', d: `${pts.join(' ')} Z` };
    }
    default:
      return { forma: 'erro' };
  }
}

/** "Proporcional" da imagem: mantém a largura da posição e ajusta a altura à proporção da imagem. */
export function posicaoProporcional(expr: string, imgW: number, imgH: number, v: Vars): string {
  const partes = expr.split(',');
  if (partes.length < 4 || imgW <= 0 || imgH <= 0) return expr;
  const p = numerosDaExpr(expr, v);
  if (p.length < 4) return expr;
  partes[3] = String(Math.trunc((imgH * p[2]) / imgW));
  return partes.join(',');
}

/** Itens do drawer com o campo `expr` (converte os antigos ao ler). */
export const itensDoDrawer = (f: Forma): ItemDrawer[] => (Array.isArray(f.props.itens) ? (f.props.itens as ItemDrawer[]).map(itemComExpr) : []);
