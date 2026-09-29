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

import { describe, expect, it } from 'vitest';
import { gravarAutosaveEm } from './autosave';
import { diagramaVazio } from './types';

const memoria = (falha = false) => {
  const m = new Map<string, string>();
  return { m, setItem: (k: string, v: string) => { if (falha) throw new DOMException('cheio', 'QuotaExceededError'); m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
};

describe('autosave', () => {
  it('grava os alterados e informa a quantidade', () => {
    const a = memoria();
    expect(gravarAutosaveEm(a, 'k', [diagramaVazio('livre', 'x')], '3.34.0')).toEqual({ estado: 'gravado', quantos: 1 });
    expect(JSON.parse(a.m.get('k')!).docs).toHaveLength(1);
  });
  it('sem alterados limpa a chave', () => {
    const a = memoria();
    a.m.set('k', 'x');
    expect(gravarAutosaveEm(a, 'k', [], '3.34.0')).toEqual({ estado: 'limpo' });
    expect(a.m.has('k')).toBe(false);
  });
  it('cota cheia vira resultado "falhou" (sem lançar)', () => {
    const r = gravarAutosaveEm(memoria(true), 'k', [diagramaVazio('livre', 'x')], '3.34.0');
    expect(r.estado).toBe('falhou');
  });
});
