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
import { buscarTopicos, destacarHtml, htmlDoTopico, htmlSobre, linksDoTopico, Topico } from './ajudaBusca';

const raiz: Topico = { id: 0, titulo: 'Ajuda', html: 'x', filhos: [
  { id: 1, titulo: 'Modelo', html: '<p class="tabela">Uma <b>tabela</b> aqui</p>', filhos: [], links: [2, 99] },
  { id: 2, titulo: 'Outro', html: 'nada', filhos: [] },
] };

describe('ajuda', () => {
  it('Sobre com produto, desenvolvedor, e-mail e data', () => {
    const h = htmlSobre();
    expect(h).toContain('ModelForge 1.0.0');
    expect(h).toContain('Desenvolvedor: Jairo dos Santos Gurgel');
    expect(h).toContain('mailto:jsgurgel@hotmail.com');
    expect(h).toContain('28/09/2026');
    expect(htmlDoTopico(raiz, raiz)).toBe(h);
  });
  it('destaca só no texto, não em atributos', () => {
    expect(destacarHtml('<p class="tabela">Uma <b>tabela</b></p>', 'tabela')).toBe('<p class="tabela">Uma <b><mark>tabela</mark></b></p>');
  });
  it('busca em título e texto sem casar tags', () => {
    expect(buscarTopicos(raiz, 'tabela').map((t) => t.id)).toEqual([1]);
    expect(buscarTopicos(raiz, 'outro').map((t) => t.id)).toEqual([2]);
    expect(buscarTopicos(raiz, 'class')).toEqual([]);
  });
  it('links numerados, ignorando ids inexistentes', () => {
    expect(linksDoTopico(raiz.filhos[0], raiz)).toEqual([{ n: 1, id: 2, titulo: 'Outro' }]);
  });
});
