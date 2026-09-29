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
import { medirTexto } from './medidaTexto';
import { Forma, Ligacao } from './types';

/**
 * Cardinalidade das ligações do Conceitual: quatro valores, padrão (0,n); o texto desenhado é
 * "(card) papel"; posição automática junto à ponta (a menos de "Movimento manual"); tamanho automático pelo texto.
 * Props da ligação: papel, cardAuto (padrão true), cardManual, cardDx/cardDy (desloc. da ponta A) e cardBDx/cardBDy (ponta B).
 */

export const CARDS_CONCEITUAL = ['(1,1)', '(0,1)', '(1,n)', '(0,n)'] as const;
export type CardConceitual = (typeof CARDS_CONCEITUAL)[number];
export const CARD_PADRAO: CardConceitual = '(0,n)';

/** Aceita "(0,n)", "0,n", "0 , N"... e devolve um dos quatro valores; o resto cai em (0,n). */
export function normalizarCardConceitual(v: string | undefined): CardConceitual {
  const s = String(v ?? '').replace(/[()\s]/g, '').toLowerCase();
  const achado = CARDS_CONCEITUAL.find((c) => c.replace(/[()]/g, '') === s);
  return achado ?? CARD_PADRAO;
}

export type PontaCard = 'A' | 'B';

/** Texto desenhado: "(0,n)" ou "(0,n) papel" (FullCard). */
export function textoCardinalidade(l: Pick<Ligacao, 'cardDe' | 'cardPara' | 'props'>, ponta: PontaCard = 'A'): string {
  const card = ponta === 'A' ? l.cardDe : l.cardPara;
  if (!card) return '';
  const papel = ponta === 'A' ? String(l.props.papel ?? '') : String(l.props.papelB ?? '');
  return papel ? `${card} ${papel}` : card;
}

export const cardAutomatica = (l: Pick<Ligacao, 'props'>): boolean => l.props.cardAuto !== false;
export const cardManual = (l: Pick<Ligacao, 'props'>): boolean => !!l.props.cardManual;

export const DIST_SELECAO = 2;
const CORRECAO = 4;

export interface CaixaCard {
  x: number;
  y: number;
  w: number;
  h: number;
  texto: string;
  lado: 0 | 1 | 2 | 3;
}

export interface FonteCard { nome?: string; tamanho: number; negrito?: boolean; italico?: boolean }

/** Tamanho automático: largura = texto + largura de "M"; altura = altura da fonte (~1,15 x o corpo). */
export function tamanhoDaCardinalidade(texto: string, f: FonteCard): { w: number; h: number } {
  const m = medirTexto('M', f.tamanho, f);
  return { w: Math.ceil(medirTexto(texto, f.tamanho, f) + m), h: Math.ceil(f.tamanho * 1.15) };
}

/** Lado da forma (0 esq, 1 topo, 2 dir, 3 base) em que a ponta está. */
export function ladoDoPonto(f: Pick<Forma, 'x' | 'y' | 'w' | 'h'>, p: Ponto): 0 | 1 | 2 | 3 {
  const d = [Math.abs(p.x - f.x), Math.abs(p.y - f.y), Math.abs(p.x - (f.x + f.w)), Math.abs(p.y - (f.y + f.h))];
  let m = 0;
  for (let i = 1; i < 4; i++) if (d[i] < d[m]) m = i;
  return m as 0 | 1 | 2 | 3;
}

/** Posição automática: canto superior esquerdo da caixa, à direita/acima da linha, para não sobrepô-la. */
export function posicaoAutomatica(p: Ponto, lado: 0 | 1 | 2 | 3, w: number, h: number): Ponto {
  switch (lado) {
    case 0: return { x: p.x - w - 2 * DIST_SELECAO, y: p.y - h - DIST_SELECAO + CORRECAO };
    case 2: return { x: p.x + 2 * DIST_SELECAO, y: p.y - h - DIST_SELECAO + CORRECAO };
    case 1: return { x: p.x - w - DIST_SELECAO + CORRECAO, y: p.y - h - 2 * DIST_SELECAO };
    default: return { x: p.x - w - DIST_SELECAO + CORRECAO, y: p.y + 2 * DIST_SELECAO };
  }
}

const chaves = (ponta: PontaCard) => (ponta === 'A' ? (['cardDx', 'cardDy'] as const) : (['cardBDx', 'cardBDy'] as const));

export const deslocamentoCard = (l: Pick<Ligacao, 'props'>, ponta: PontaCard): Ponto => {
  const [kx, ky] = chaves(ponta);
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return { x: n(l.props[kx]), y: n(l.props[ky]) };
};

/**
 * Caixa da cardinalidade numa ponta. `ponto` é a ponta da linha, `forma` a forma onde ela termina (define o lado).
 * Com "Movimento manual" soma o deslocamento guardado; sem ele a posição é sempre a automática.
 */
export function caixaDaCardinalidade(
  l: Pick<Ligacao, 'cardDe' | 'cardPara' | 'props'>, ponta: PontaCard, ponto: Ponto, forma: Pick<Forma, 'x' | 'y' | 'w' | 'h'>, fonte: FonteCard,
): CaixaCard | null {
  const texto = textoCardinalidade(l, ponta);
  if (!texto) return null;
  const auto = tamanhoDaCardinalidade(texto, fonte);
  const w = cardAutomatica(l) ? auto.w : Math.max(10, Number(l.props.cardW ?? auto.w));
  const h = cardAutomatica(l) ? auto.h : Math.max(8, Number(l.props.cardH ?? auto.h));
  const lado = ladoDoPonto(forma, ponto);
  const base = posicaoAutomatica(ponto, lado, w, h);
  const d = cardManual(l) ? deslocamentoCard(l, ponta) : { x: 0, y: 0 };
  return { x: base.x + d.x, y: base.y + d.y, w, h, texto, lado };
}

/**
 * Arrastar a etiqueta (mouseDragged liga MovimentacaoManual): novo deslocamento = deslocamento inicial + delta do mouse.
 */
export function patchArrastoCardinalidade(l: Pick<Ligacao, 'props'>, ponta: PontaCard, base: Ponto, dx: number, dy: number): Record<string, unknown> {
  const [kx, ky] = chaves(ponta);
  return { ...l.props, cardManual: true, [kx]: Math.round(base.x + dx), [ky]: Math.round(base.y + dy) };
}

/** Desligar "Movimento manual" devolve a etiqueta à posição automática. */
export function patchCardManual(l: Pick<Ligacao, 'props'>, manual: boolean): Record<string, unknown> {
  return manual ? { ...l.props, cardManual: true } : { ...l.props, cardManual: false, cardDx: 0, cardDy: 0, cardBDx: 0, cardBDy: 0 };
}
