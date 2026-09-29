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
import { alvoDoPonteiro, realceDoRoque } from './roque';
import { alternarPk, propsTabela } from './logico';
import { Doc, ligacaoLogica } from './ops';
import { Forma, campoVazio, diagramaVazio, propsTabelaVazias } from './types';

const tab = (id: string, y: number): Forma => ({
  id, kind: 'tabela', x: 0, y, w: 190, h: 100, texto: id,
  props: { ...propsTabelaVazias(), campos: [campoVazio('id', 'INTEGER'), campoVazio('ref', 'INTEGER')] } as unknown as Forma['props'],
});

function cenario(): Doc {
  let d: Doc = { ...diagramaVazio('logico', 'L'), formas: [tab('A', 0), tab('B', 300)] };
  d = { ...d, formas: d.formas.map((f) => (f.id === 'A' ? alternarPk(f, propsTabela(f).campos[0].id, true) : f)) };
  return ligacaoLogica(d, 'A', 'B', propsTabela(d.formas[0]).campos[0].id, propsTabela(d.formas[1]).campos[1].id);
}

describe('roque (realce da FK ao passar o mouse)', () => {
  it('pela ligação: campos e IR das duas tabelas', () => {
    const d = cenario();
    const l = d.ligacoes[0];
    const r = realceDoRoque(d, { ligacaoId: l.id });
    const pkA = propsTabela(d.formas[0]).constraints[0].id;
    const fkB = propsTabela(d.formas[1]).constraints[0].id;
    expect(r.constraints).toEqual(new Set([pkA, fkB]));
    expect(r.campos.size).toBe(2);
    expect(r.ligacoes.has(l.id)).toBe(true);
  });
  it('pela linha de IR FK na tabela', () => {
    const d = cenario();
    const fkB = propsTabela(d.formas[1]).constraints[0].id;
    const r = realceDoRoque(d, { tabelaId: 'B', constraintId: fkB });
    expect(r.ligacoes.size).toBe(1);
    expect(r.campos.size).toBe(2);
  });
  it('alvo do ponteiro: linha de IR FK (modo IR em linhas)', () => {
    const d = cenario();
    const b = { ...d.formas[1], props: { ...d.formas[1].props, plainIR: false } };
    const y = b.y + 24 + 2 * 18 + 4 + 5;
    expect(alvoDoPonteiro(d, 10, y, null, b, 12)?.constraintId).toBe(propsTabela(b)!.constraints[0].id);
    expect(alvoDoPonteiro(d, 10, b.y + 30, null, b, 12)).toBeNull();
  });
});
