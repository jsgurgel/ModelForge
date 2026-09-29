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
import { editarCampoDicionario, editarTabelaDicionario, linhasDeCampos, tabelasDo } from './dicionario';
import { campoVazio, diagramaVazio } from './types';

describe('dicionário editável', () => {
  it('edita Dicionário/Observação do campo e da tabela', () => {
    const d = diagramaVazio('logico', 'x');
    const c = campoVazio('id');
    d.formas = [{ id: 't', kind: 'tabela', x: 0, y: 0, w: 100, h: 80, texto: 'T', props: { campos: [c], constraints: [], indices: [], gatilhos: [] } }];
    const d2 = editarCampoDicionario(d, 't', c.id, { dicionario: 'chave', observacao: 'obs' });
    const l = linhasDeCampos(d2, tabelasDo(d2))[0];
    expect(l.dicionario).toBe('chave');
    expect(l.observacao).toBe('obs');
    expect(l.tabelaId).toBe('t');
    expect(editarTabelaDicionario(d2, 't', { descricao: 'tab' }).formas[0].props.descricao).toBe('tab');
  });
});
