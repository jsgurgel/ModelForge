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

/** Mensagem de status do autosave. */
export const MSG_AUTOSAVE = 'Auto-salvando...';
export const MSG_AUTOSAVE_FALHOU = 'ATENÇÃO: o auto-salvamento falhou (armazenamento do navegador cheio ou bloqueado). Salve os diagramas em arquivo.';

export interface ArmazenamentoMinimo { setItem(k: string, v: string): void; removeItem(k: string): void }

export type ResultadoAutosave = { estado: 'gravado'; quantos: number } | { estado: 'limpo' } | { estado: 'falhou'; motivo: string };

/** Grava os diagramas alterados (ou limpa a chave quando não há nenhum) e diz o que aconteceu, sem lançar. */
export function gravarAutosaveEm(armazem: ArmazenamentoMinimo, chave: string, docs: Diagrama[], versao: string): ResultadoAutosave {
  try {
    if (!docs.length) { armazem.removeItem(chave); return { estado: 'limpo' }; }
    armazem.setItem(chave, JSON.stringify({ v: versao, docs }));
    return { estado: 'gravado', quantos: docs.length };
  } catch (e) {
    return { estado: 'falhou', motivo: e instanceof Error ? e.message : String(e) };
  }
}
