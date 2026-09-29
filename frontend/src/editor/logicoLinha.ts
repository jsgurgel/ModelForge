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

import { Ligacao } from './types';

/**
 * Cardinalidade e seta automática da LogicoLinha. O formato guardado é sempre "(min,max)"; valores antigos ("1", "n") são normalizados.
 */

/** Ordem das cardinalidades (C11, C01, C1N, C0N): também é o "ordinal" que decide a seta. */
export const CARDS_LOGICO = ['(1,1)', '(0,1)', '(1,n)', '(0,n)'] as const;
export type CardLogico = (typeof CARDS_LOGICO)[number];

/** A começa em C01, B em C0N (padrão). */
export const CARD_PADRAO_A: CardLogico = '(0,1)';
export const CARD_PADRAO_B: CardLogico = '(0,n)';

/** Aceita "(0,1)", "0,1", "1", "n", "1:n"...; o que não reconhece cai no padrão. */
export function normalizarCard(v: string | undefined | null, padrao: CardLogico): CardLogico {
  const s = (v ?? '').replace(/[()\s]/g, '').toLowerCase();
  if (!s) return padrao;
  if ((CARDS_LOGICO as readonly string[]).includes(`(${s})`)) return `(${s})` as CardLogico;
  if (s === '1') return '(1,1)';
  if (s === 'n' || s === '*' || s === '0,*') return '(0,n)';
  if (s === '1,*') return '(1,n)';
  return padrao;
}

const ordinal = (c: CardLogico) => CARDS_LOGICO.indexOf(c);

export const cardsDaLinha = (l: Ligacao): { a: CardLogico; b: CardLogico } => ({
  a: normalizarCard(l.cardDe, CARD_PADRAO_A),
  b: normalizarCard(l.cardPara, CARD_PADRAO_B),
});

export const setaAutomatica = (l: Ligacao): boolean => l.props.setaAutomatica !== false;

/** ajusteSeta: a ponta de maior ordinal fica sem seta; iguais, as duas pontas têm seta. */
export function setasPelaCardinalidade(a: CardLogico, b: CardLogico): { setaA: boolean; setaB: boolean } {
  const oa = ordinal(a);
  const ob = ordinal(b);
  if (oa > ob) return { setaA: true, setaB: false };
  if (oa === ob) return { setaA: true, setaB: true };
  return { setaA: false, setaB: true };
}

/** Setas efetivas da linha: automática -> pela cardinalidade; manual -> props.setaA/props.setaB. */
export function setasDaLogicoLinha(l: Ligacao, padraoB = true): { setaA: boolean; setaB: boolean } {
  if (setaAutomatica(l)) {
    const { a, b } = cardsDaLinha(l);
    return setasPelaCardinalidade(a, b);
  }
  return { setaA: !!l.props.setaA, setaB: l.props.setaB === undefined ? padraoB : !!l.props.setaB };
}

/** Grava as setas calculadas nas props (quando automática). */
function comSetas(l: Ligacao): Ligacao {
  if (!setaAutomatica(l)) return l;
  const s = setasPelaCardinalidade(...(Object.values(cardsDaLinha(l)) as [CardLogico, CardLogico]));
  return { ...l, props: { ...l.props, setaA: s.setaA, setaB: s.setaB } };
}

/**
 * Ao pôr (0,n) ou (1,n) numa ponta, a outra deixa de ser "n"
 * (0,n -> 0,1 e 1,n -> 1,1); depois a seta automática se ajusta. Devolve a ligação nova.
 */
export function definirCardinalidade(l: Ligacao, lado: 'A' | 'B', valor: string): Ligacao {
  const atual = cardsDaLinha(l);
  const novo = normalizarCard(valor, lado === 'A' ? CARD_PADRAO_A : CARD_PADRAO_B);
  let a = lado === 'A' ? novo : atual.a;
  let b = lado === 'B' ? novo : atual.b;
  if (novo !== '(0,1)' && novo !== '(1,1)') {
    const outra = lado === 'A' ? b : a;
    const ajustada: CardLogico = outra === '(0,n)' ? '(0,1)' : outra === '(1,n)' ? '(1,1)' : outra;
    if (lado === 'A') b = ajustada; else a = ajustada;
  }
  return comSetas({ ...l, cardDe: a, cardPara: b });
}

/** Ligar recalcula as setas pela cardinalidade. */
export function definirSetaAutomatica(l: Ligacao, valor: boolean): Ligacao {
  const n: Ligacao = { ...l, props: { ...l.props, setaAutomatica: valor } };
  return valor ? comSetas(n) : n;
}
