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

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { gerarDocumentacaoHtml } from './doc';

const DIR = join(__dirname, '../../test/fixtures');
const DATA = /Gerado pelo ModelForge em \d{2}\/\d{2}\/\d{4}/;

const fixtures = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ f, j: JSON.parse(readFileSync(join(DIR, f), 'utf8')) }))
  .filter(({ j }) => j.modelo && typeof j.doc === 'string');

describe('gerarDocumentacaoHtml (fixtures de referência)', () => {
  it('há fixtures', () => expect(fixtures.length).toBeGreaterThan(0));

  it.each(fixtures.map(({ f, j }) => [f, j]))('%s reproduz o HTML de referência (exceto a data)', (_f, j: any) => {
    const gerado = gerarDocumentacaoHtml(j.modelo).replace(DATA, 'DATA');
    expect(gerado).toBe(j.doc.replace(DATA, 'DATA'));
  });

  it('usa a data informada no formato dd/MM/yyyy', () => {
    const html = gerarDocumentacaoHtml({ nome: 'x', tipo: 'logico', formas: [], ligacoes: [] }, new Date(2026, 0, 5));
    expect(html).toContain('Gerado pelo ModelForge em 05/01/2026');
  });

  it('escapa HTML e usa <<Lógico>> para modelo sem nome', () => {
    const html = gerarDocumentacaoHtml({
      nome: '',
      tipo: 'logico',
      ligacoes: [],
      formas: [{ id: 't0', kind: 'tabela', x: 0, y: 0, w: 1, h: 1, texto: 'a<b>&"c', props: { campos: [] } }],
    });
    expect(html).toContain('<h1>&lt;&lt;Lógico&gt;&gt;</h1>');
    expect(html).toContain('a&lt;b&gt;&amp;&quot;c');
    expect(html).toContain('id="tb-a-b-c"');
  });
});
