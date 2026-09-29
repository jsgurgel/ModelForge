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

import { describe, it, expect, beforeEach } from 'vitest';

describe('sqlStudioTypes', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* */ }
  });

  it('novaAba cria aba com id único e título', async () => {
    const { novaAba } = await import('./sqlStudioTypes');
    const a = novaAba('Query 1');
    expect(a.titulo).toBe('Query 1');
    expect(a.sql).toBe('');
    expect(a.alterado).toBe(false);
    expect(a.id).toBeTruthy();
    const b = novaAba('Query 2');
    expect(b.id).not.toBe(a.id);
  });

  it('novoId gera ids únicos', async () => {
    const { novoId } = await import('./sqlStudioTypes');
    const a = novoId();
    const b = novoId();
    expect(a).not.toBe(b);
  });
});