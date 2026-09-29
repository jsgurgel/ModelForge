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
import { alternarFk, alternarPk, alternarUnique, propsTabela, removerCampo } from './logico';
import { Forma, campoVazio, propsTabelaVazias } from './types';

const tabela = (): Forma => ({
  id: 't1', kind: 'tabela', x: 0, y: 0, w: 190, h: 80, texto: 'Tabela_1',
  props: { ...propsTabelaVazias(), campos: [campoVazio('a', 'INTEGER'), campoVazio('b', 'INTEGER'), campoVazio('c', 'INTEGER')] } as unknown as Forma['props'],
});

describe('logico: flags e constraints andam juntos', () => {
  it('marcar PK cria a constraint PK e acrescenta campos a ela', () => {
    let t = tabela();
    const [a, b] = propsTabela(t).campos;
    t = alternarPk(t, a.id, true);
    t = alternarPk(t, b.id, true);
    const p = propsTabela(t);
    expect(p.constraints).toHaveLength(1);
    expect(p.constraints[0]).toMatchObject({ tipo: 'PK', camposOrigem: [a.id, b.id], camposDestino: [null, null] });
    expect(p.campos.filter((c) => c.pk)).toHaveLength(2);
  });

  it('desmarcar o último campo da PK remove a constraint', () => {
    let t = tabela();
    const a = propsTabela(t).campos[0];
    t = alternarPk(alternarPk(t, a.id, true), a.id, false);
    expect(propsTabela(t).constraints).toHaveLength(0);
    expect(propsTabela(t).campos[0].pk).toBe(false);
  });

  it('UNIQUE usa a primeira constraint UNIQUE e sai de todas ao desmarcar', () => {
    let t = tabela();
    const [a, b] = propsTabela(t).campos;
    t = alternarUnique(alternarUnique(t, a.id, true), b.id, true);
    expect(propsTabela(t).constraints).toHaveLength(1);
    expect(propsTabela(t).constraints[0].camposOrigem).toEqual([a.id, b.id]);
    t = alternarUnique(t, a.id, false);
    expect(propsTabela(t).constraints[0].camposOrigem).toEqual([b.id]);
  });

  it('FK manual cria constraint FK aberta e a desmarcação a remove', () => {
    let t = tabela();
    const a = propsTabela(t).campos[0];
    t = alternarFk(t, a.id, true);
    expect(propsTabela(t).constraints[0]).toMatchObject({ tipo: 'FK', camposDestino: [a.id], camposOrigem: [null] });
    t = alternarFk(t, a.id, false);
    expect(propsTabela(t).constraints).toHaveLength(0);
  });

  it('remover campo limpa constraints e índices que dependiam só dele', () => {
    let t = tabela();
    const a = propsTabela(t).campos[0];
    t = alternarPk(t, a.id, true);
    t = { ...t, props: { ...t.props, indices: [{ id: 'i', nome: 'x', unico: false, metodo: '', condicao: '', campos: [a.id] }] } };
    t = removerCampo(t, a.id);
    const p = propsTabela(t);
    expect(p.campos).toHaveLength(2);
    expect(p.constraints).toHaveLength(0);
    expect(p.indices).toHaveLength(0);
  });
});
