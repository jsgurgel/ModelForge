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
 * Semântica do Atributo do Conceitual, pura e sem dependências do editor.
 * Props usadas: identificador, opcional, cardMin, cardMax (-1 = 'n'), direcao ('Left' | 'Right'), autosize.
 */

export const ehAtributoKind = (k: string): boolean => k === 'atributo' || k === 'atributoMulti';

/** Cardinalidade mínima efetiva. */
export const cardMinDe = (f: Pick<Forma, 'props'>): number =>
  typeof f.props.cardMin === 'number' ? f.props.cardMin : f.props.opcional ? 0 : 1;

/** Cardinalidade máxima efetiva. */
export const cardMaxDe = (f: Pick<Forma, 'props'>): number => (typeof f.props.cardMax === 'number' ? f.props.cardMax : -1);

export const cardParaTexto = (n: number): string => (n === -1 ? 'n' : String(n));

/** Texto desenhado: o nome, mais "(min, max)" só se o atributo é multivalorado. */
export function textoDoAtributo(f: Pick<Forma, 'kind' | 'texto' | 'props'>): string {
  if (f.kind !== 'atributoMulti') return f.texto;
  return `${f.texto} (${cardParaTexto(cardMinDe(f))}, ${cardParaTexto(cardMaxDe(f))})`;
}

/** Converte a entrada do usuário: "n" -> -1; inválido ou < -1 -> -1. */
export function lerCardinalidade(v: string): number {
  const t = v.trim();
  if (/^n$/i.test(t)) return -1;
  const n = /^-?\d+$/.test(t) ? parseInt(t, 10) : NaN;
  return Number.isNaN(n) || n < -1 ? -1 : n;
}

type Props = Record<string, unknown>;

/** Cardinalidade máxima e mínima, mantendo opcional coerente (mín 0 => opcional). */
function aplicarMin(p: Props, min: number): Props {
  const m = min < -1 ? 0 : min;
  const max = typeof p.cardMax === 'number' ? p.cardMax : -1;
  const out: Props = { ...p, cardMin: m };
  if (max !== -1 && m > max) out.cardMax = m === 0 ? 1 : m;
  out.opcional = m === 0;
  if (m === 0) out.identificador = false;
  return out;
}

function aplicarMax(p: Props, maxIn: number): Props {
  const max = maxIn === 0 || maxIn < -1 ? 1 : maxIn;
  const out: Props = { ...p, cardMax: max };
  const min = typeof p.cardMin === 'number' ? p.cardMin : p.opcional ? 0 : 1;
  if (max !== -1 && min > max) return aplicarMin(out, max);
  return out;
}

/** Opcional e Identificador são exclusivos; opcional zera a cardinalidade mínima e vice-versa. */
export function definirOpcional(p: Props, v: boolean): Props {
  const min = typeof p.cardMin === 'number' ? p.cardMin : p.opcional ? 0 : 1;
  const out: Props = { ...p, opcional: v };
  if (v) {
    out.identificador = false;
    out.cardMin = 0;
  } else if (min === 0) out.cardMin = 1;
  return out;
}

export function definirIdentificador(p: Props, v: boolean): Props {
  const out: Props = { ...p, identificador: v };
  if (v && p.opcional) return { ...definirOpcional(out, false), identificador: true };
  return out;
}

export const definirCardMin = (p: Props, texto: string): Props => aplicarMin(p, lerCardinalidade(texto));
export const definirCardMax = (p: Props, texto: string): Props => aplicarMax(p, lerCardinalidade(texto));

/**
 * Ao virar multivalorado, opcional segue a cardinalidade mínima; ao deixar de ser,
 * mantêm-se os valores e a mínima continua comandando "opcional".
 */
export function ajustarAoMultivalorado(p: Props): Props {
  const min = typeof p.cardMin === 'number' ? p.cardMin : p.opcional ? 0 : 1;
  return { ...p, opcional: min === 0, ...(min === 0 ? { identificador: false } : {}) };
}
