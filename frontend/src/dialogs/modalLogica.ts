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

/** Lógica pura do Modal (teclado e foco), separada para teste. */

/** Elementos em que o Enter tem significado próprio (não deve disparar o botão padrão do diálogo). */
export function enterPertenceAoAlvo(tag: string, tipo?: string, editavel?: boolean): boolean {
  const t = tag.toLowerCase();
  if (editavel) return true;
  if (t === 'textarea' || t === 'button' || t === 'select' || t === 'a' || t === 'summary') return true;
  if (t === 'input' && (tipo === 'button' || tipo === 'submit' || tipo === 'checkbox' || tipo === 'radio')) return true;
  return false;
}

/** Decide o que o Enter faz: dispara `aoConfirmar` quando o diálogo define um e o Enter não é do elemento focado. */
export function deveConfirmarNoEnter(o: { tecla: string; tag: string; tipo?: string; editavel?: boolean; temConfirmar: boolean; cancelado: boolean; mods: boolean }): boolean {
  return o.tecla === 'Enter' && o.temConfirmar && !o.cancelado && !o.mods && !enterPertenceAoAlvo(o.tag, o.tipo, o.editavel);
}

/** Próximo índice de foco para o Tab preso (com Shift volta). `total` = elementos focáveis; `atual` = índice do focado (-1 se fora). */
export function proximoFoco(total: number, atual: number, voltar: boolean): number {
  if (total <= 0) return -1;
  if (atual < 0) return voltar ? total - 1 : 0;
  return voltar ? (atual - 1 + total) % total : (atual + 1) % total;
}

export const SELETOR_FOCAVEL = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
