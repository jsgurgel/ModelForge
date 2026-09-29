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
import { sincronizarDocumento } from './integridade';
import { alternarPk, moverItem, propsTabela, removerCampo } from './logico';
import { Doc, apagar, ligacaoLogica } from './ops';
import { Forma, campoVazio, diagramaVazio, propsTabelaVazias } from './types';

const tab = (id: string, nomes: string[]): Forma => ({
  id, kind: 'tabela', x: 0, y: 0, w: 190, h: 80, texto: id,
  props: { ...propsTabelaVazias(), campos: nomes.map((n) => campoVazio(n, 'INTEGER')) } as unknown as Forma['props'],
});

function cenario(): Doc {
  let d: Doc = { ...diagramaVazio('logico', 'L'), formas: [tab('A', ['id', 'x']), tab('B', ['id', 'ref'])] };
  const a = d.formas[0];
  d = { ...d, formas: d.formas.map((f) => (f.id === 'A' ? alternarPk(a, propsTabela(a).campos[0].id, true) : f)) };
  // segunda constraint (UNIQUE) para poder reordenar
  const a2 = d.formas[0];
  d = { ...d, formas: d.formas.map((f) => (f.id === 'A' ? { ...f, props: { ...f.props, constraints: [{ ...propsTabela(a2).constraints[0], id: 'u0', tipo: 'UNIQUE', camposOrigem: [propsTabela(a2).campos[1].id], camposDestino: [null] }, ...propsTabela(a2).constraints] } } : f)) };
  const idA = propsTabela(d.formas[0]).campos[0].id;
  const idBref = propsTabela(d.formas[1]).campos[1].id;
  // FK de B(ref) -> PK de A (indice 1)
  d = ligacaoLogica(d, 'A', 'B', idA, idBref);
  return d;
}
const fk = (d: Doc) => propsTabela(d.formas.find((f) => f.id === 'B')!).constraints.find((c) => c.tipo === 'FK')!;
const editar = (d: Doc, id: string, fn: (f: Forma) => Forma): Doc => ({ ...d, formas: d.formas.map((f) => (f.id === id ? fn(f) : f)) });

describe('integridade do Lógico', () => {
  it('cenário base: FK aponta para a PK (índice 1)', () => {
    const d = cenario();
    expect(fk(d).constraintOrigem).toEqual({ tabelaId: 'A', indice: 1 });
  });

  it('reordenar constraints da origem reaponta o índice', () => {
    const d = cenario();
    const novo = editar(d, 'A', (f) => ({ ...f, props: { ...f.props, constraints: moverItem(propsTabela(f).constraints, 1, -1) } }));
    const r = sincronizarDocumento(novo, d);
    expect(fk(r).constraintOrigem).toEqual({ tabelaId: 'A', indice: 0 });
  });

  it('excluir constraint anterior desloca o índice; excluir a própria solta a FK', () => {
    const d = cenario();
    const semUnique = editar(d, 'A', (f) => ({ ...f, props: { ...f.props, constraints: propsTabela(f).constraints.slice(1) } }));
    expect(fk(sincronizarDocumento(semUnique, d)).constraintOrigem).toEqual({ tabelaId: 'A', indice: 0 });
    const semPk = editar(d, 'A', (f) => ({ ...f, props: { ...f.props, constraints: propsTabela(f).constraints.slice(0, 1) } }));
    const r = sincronizarDocumento(semPk, d);
    expect(fk(r).constraintOrigem).toBeNull();
    expect(fk(r).camposOrigem.every((x) => x === null)).toBe(true);
  });

  it('inserir constraint no começo mantém a FK na mesma IR', () => {
    const d = cenario();
    const novo = editar(d, 'A', (f) => ({ ...f, props: { ...f.props, constraints: [{ ...propsTabela(f).constraints[0], id: 'novo', tipo: 'CHECK', expressao: 'x>0' }, ...propsTabela(f).constraints] } }));
    expect(fk(sincronizarDocumento(novo, d)).constraintOrigem).toEqual({ tabelaId: 'A', indice: 2 });
  });

  it('mudar o tipo do campo PK propaga para a FK (e de volta)', () => {
    const d = cenario();
    const idA = propsTabela(d.formas[0]).campos[0].id;
    const novo = editar(d, 'A', (f) => ({ ...f, props: { ...f.props, campos: propsTabela(f).campos.map((c) => (c.id === idA ? { ...c, tipo: 'BIGINT' } : c)) } }));
    const r = sincronizarDocumento(novo, d);
    expect(propsTabela(r.formas[1]).campos[1].tipo).toBe('BIGINT');
    const volta = editar(r, 'B', (f) => ({ ...f, props: { ...f.props, campos: propsTabela(f).campos.map((c) => (c.nome === 'ref' ? { ...c, tipo: 'TEXT' } : c)) } }));
    expect(propsTabela(sincronizarDocumento(volta, r).formas[0]).campos[0].tipo).toBe('TEXT');
  });

  it('apagar a tabela referenciada solta a FK', () => {
    const d = cenario();
    const r = sincronizarDocumento(apagar(d, ['A']), d);
    expect(fk(r).constraintOrigem).toBeNull();
  });

  it('apagar a coluna PK referenciada anula a origem na FK e preserva o campo local', () => {
    const d = cenario();
    const idA = propsTabela(d.formas[0]).campos[0].id;
    const novo = editar(d, 'A', (f) => removerCampo(f, idA));
    const r = sincronizarDocumento(novo, d);
    expect(fk(r).camposOrigem).toEqual([null]);
    expect(fk(r).camposDestino[0]).toBe(propsTabela(r.formas[1]).campos[1].id);
    expect(fk(r).constraintOrigem).toBeNull();
  });

  it('sem mudança de props devolve o mesmo documento', () => {
    const d = cenario();
    const mov: Doc = { ...d, formas: d.formas.map((f) => ({ ...f, x: f.x + 5 })) };
    expect(sincronizarDocumento(mov, d)).toBe(mov);
  });
});
