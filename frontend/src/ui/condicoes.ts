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

import type { Prop } from './PropertyGrid';

/**
 * Habilitar/desabilitar propriedades conforme o valor de outra (condições por verdadeiro/falso/valor e
 * forçar habilitado/desabilitado). As linhas são identificadas por `Prop.id`.
 */
export interface Regra {
  /** id da propriedade que controla. */
  fonte: string;
  /** Recebe o valor atual (boolean, número ou texto) e diz se os afetados ficam habilitados. */
  habilitaSe: (valor: Prop['valor']) => boolean;
  afetados: string[];
}

/** AddCondicaoForTrue: os afetados só ficam habilitados quando `fonte` é verdadeiro. */
export const seVerdadeiro = (fonte: string, afetados: string[]): Regra => ({ fonte, habilitaSe: (v) => v === true || v === 'true', afetados });
/** AddCondicaoForFalse: os afetados só ficam habilitados quando `fonte` é falso. */
export const seFalso = (fonte: string, afetados: string[]): Regra => ({ fonte, habilitaSe: (v) => !(v === true || v === 'true'), afetados });
/** AddCondicao(enableIf, afetados): habilitados quando o valor (como texto) estiver em `valores`. */
export const seValorEm = (fonte: string, valores: (string | number)[], afetados: string[]): Regra => ({
  fonte, habilitaSe: (v) => valores.map(String).includes(String(v)), afetados,
});

/**
 * Aplica as regras: um afetado fica desabilitado se QUALQUER regra que o cita o desabilita
 *. `forcar` da própria linha vence as regras.
 */
export function aplicarCondicoes(props: Prop[], regras: Regra[]): Prop[] {
  const desab = new Set<string>();
  for (const r of regras) {
    const src = props.find((p) => p.id === r.fonte);
    if (!src) continue;
    if (!r.habilitaSe(src.valor)) for (const a of r.afetados) desab.add(a);
  }
  return props.map((p) => {
    let d = !!p.id && desab.has(p.id);
    if (p.forcar === 'desabilitar') d = true;
    else if (p.forcar === 'habilitar') d = false;
    return p.desabilitado === d ? p : { ...p, desabilitado: d };
  });
}
