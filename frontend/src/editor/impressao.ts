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

import { Diagrama } from './types';

/** Impressão: só a seleção, página atual x todas. */

/** Diagrama reduzido à seleção: formas selecionadas e ligações entre elas (ou selecionadas com as duas pontas presentes). */
export function docDaSelecao(doc: Diagrama, ids: string[]): Diagrama {
  const sel = new Set(ids);
  const formas = doc.formas.filter((f) => sel.has(f.id));
  const nos = new Set(formas.map((f) => f.id));
  const ligacoes = doc.ligacoes.filter((l) => nos.has(l.de) && nos.has(l.para) && (sel.has(l.id) || (sel.has(l.de) && sel.has(l.para))));
  return { ...doc, formas, ligacoes };
}

export type ModoImpressao = 'atual' | 'todas';

/** Índices (0-based) das páginas a imprimir. */
export function paginasAImprimir(total: number, atual: number, modo: ModoImpressao): number[] {
  if (total <= 0) return [];
  if (modo === 'todas') return Array.from({ length: total }, (_, i) => i);
  return [Math.min(Math.max(0, atual), total - 1)];
}

export const limitarPagina = (i: number, total: number): number => Math.min(Math.max(0, i), Math.max(0, total - 1));
