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
import { docDaSelecao, limitarPagina, paginasAImprimir } from './impressao';
import { diagramaVazio } from './types';
import { CONFIG_PADRAO, dividirEmPaginas } from './pdf';

const doc = () => {
  const d = diagramaVazio('livre', 'x');
  const f = (id: string) => ({ id, kind: 'livreRetangulo', x: 0, y: 0, w: 10, h: 10, texto: id, props: {} });
  d.formas = [f('a'), f('b'), f('c')];
  d.ligacoes = [{ id: 'l1', kind: 'livreLigacao', de: 'a', para: 'b', texto: '', cardDe: '', cardPara: '', props: {} }, { id: 'l2', kind: 'livreLigacao', de: 'b', para: 'c', texto: '', cardDe: '', cardPara: '', props: {} }];
  return d;
};

describe('impressão', () => {
  it('seleção: só formas escolhidas e ligações entre elas', () => {
    const r = docDaSelecao(doc(), ['a', 'b']);
    expect(r.formas.map((f) => f.id)).toEqual(['a', 'b']);
    expect(r.ligacoes.map((l) => l.id)).toEqual(['l1']);
  });
  it('página atual x todas', () => {
    expect(paginasAImprimir(4, 2, 'atual')).toEqual([2]);
    expect(paginasAImprimir(4, 9, 'atual')).toEqual([3]);
    expect(paginasAImprimir(3, 0, 'todas')).toEqual([0, 1, 2]);
    expect(paginasAImprimir(0, 0, 'todas')).toEqual([]);
    expect(limitarPagina(-1, 3)).toBe(0);
  });
  it('colunas x linhas fixas (não proporcional) fazem a grade pedida', () => {
    const p = dividirEmPaginas(3000, 2000, { ...CONFIG_PADRAO, proporcional: false, colunas: 3, linhas: 2 });
    expect(p.cols).toBe(3);
    expect(p.rows).toBe(2);
    expect(p.paginas).toHaveLength(6);
  });
  it('proporcional ignora colunas/linhas', () => {
    const p = dividirEmPaginas(300, 200, { ...CONFIG_PADRAO, proporcional: true, colunas: 5, linhas: 5 });
    expect(p.paginas).toHaveLength(1);
  });
});
