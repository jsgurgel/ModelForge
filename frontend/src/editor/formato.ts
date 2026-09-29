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

import { Doc } from './ops';
import { Fonte, Forma } from './types';

/** Formatação copiável de uma forma: cores e fonte. */
export interface Formato {
  cor?: string;
  corBorda?: string;
  corTexto?: string;
  fonte?: Partial<Fonte>;
}

export function copiarFormato(f: Forma): Formato {
  return { cor: f.cor, corBorda: f.corBorda, corTexto: f.corTexto, fonte: f.fonte ? { ...f.fonte } : undefined };
}

/** Aplica o formato às formas indicadas (e a cor de borda às ligações indicadas). */
export function colarFormato(doc: Doc, ids: string[], fmt: Formato): Doc {
  const s = new Set(ids);
  return {
    ...doc,
    formas: doc.formas.map((f) => (s.has(f.id)
      ? { ...f, cor: fmt.cor, corBorda: fmt.corBorda, corTexto: fmt.corTexto, fonte: fmt.fonte ? { ...fmt.fonte } : undefined }
      : f)),
    ligacoes: doc.ligacoes.map((l) => (s.has(l.id) ? { ...l, corBorda: fmt.corBorda } : l)),
  };
}

/**
 * Realçar: a seleção, o que está ligado a ela e as ligações entre eles ficam em destaque;
 * o resto do diagrama esmaece.
 */
export function idsRealcados(doc: Doc, selecao: string[]): Set<string> {
  const res = new Set<string>();
  for (const id of selecao) {
    res.add(id);
    const l = doc.ligacoes.find((x) => x.id === id);
    if (l) {
      res.add(l.de);
      res.add(l.para);
      continue;
    }
    for (const x of doc.ligacoes) {
      if (x.de === id || x.para === id) {
        res.add(x.id);
        res.add(x.de === id ? x.para : x.de);
      }
    }
  }
  return res;
}

/**
 * Micro-ajuste (setas): move 3px, ou 1px com Ctrl; com Shift redimensiona (largura/altura) em vez de mover.
 * Ignora formas ancoradas.
 */
export function passoMicroajuste(tecla: 'left' | 'right' | 'up' | 'down', ctrl: boolean): { dx: number; dy: number } {
  const inc = ctrl ? 1 : 3;
  return { dx: tecla === 'left' ? -inc : tecla === 'right' ? inc : 0, dy: tecla === 'up' ? -inc : tecla === 'down' ? inc : 0 };
}
