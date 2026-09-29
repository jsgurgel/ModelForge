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

import { describe, expect, it, vi } from 'vitest';

vi.mock('../ui/dialogos', () => ({ aviso: vi.fn(), abrirDialogo: vi.fn() }));
import { ehArquivoAbrivel } from './arquivo';

describe('abrir arquivos', () => {
  it('aceita só JSON (diagrama e pacote)', () => {
    expect(['a.mfd.json', 'p.mfp.json', 'x.json'].every(ehArquivoAbrivel)).toBe(true);
    expect(['a.txt', 'x.xml', 'foto.png'].some(ehArquivoAbrivel)).toBe(false);
  });
});

import { compararVersoes, versoesMaisNovas } from './arquivo';
describe('versão do arquivo', () => {
  it('compara numericamente', () => {
    expect(compararVersoes('3.35.0', '3.34.0')).toBeGreaterThan(0);
    expect(compararVersoes('3.9.0', '3.34.0')).toBeLessThan(0);
    expect(compararVersoes('3.34', '3.34.0')).toBe(0);
  });
  it('lista só os diagramas de versão mais nova', () => {
    expect(versoesMaisNovas([{ nome: 'a', versao: '3.34.0' }, { nome: 'b', versao: '4.0.0' }, { nome: 'c' }])).toEqual([{ nome: 'b', versao: '4.0.0' }]);
  });
});
