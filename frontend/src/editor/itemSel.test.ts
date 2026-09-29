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
import { excluirItemSelecionado, itemNoPonto, moverAtributo, moverItemSelecionado, podeMoverItem } from './itemSel';
import { propsTabela } from './logico';
import { adicionarForma, novaForma } from './ops';
import { adicionarAtributo } from './conceitual';
import { campoVazio, diagramaVazio } from './types';

const tabela = () => {
  let d = diagramaVazio('logico', 't');
  const t = novaForma(d, 'tabela', 200, 100);
  t.props = { ...t.props, campos: ['a', 'b', 'c'].map((n) => campoVazio(n)) };
  d = adicionarForma(d, t);
  return { d, t };
};

describe('item selecionado da tabela', () => {
  it('acha o campo pela posição e move/exclui', () => {
    const { d, t } = tabela();
    const s = itemNoPonto(t, t.y + 24 + 18 + 4)!;
    expect(s.tipo).toBe('campo');
    const p = propsTabela(t);
    expect(s.id).toBe(p.campos[1].id);
    expect(podeMoverItem(t, s, -1)).toBe(true);
    const sobe = moverItemSelecionado(d, s, -1);
    expect(propsTabela(sobe.formas[0]).campos.map((c) => c.nome)).toEqual(['b', 'a', 'c']);
    const sem = excluirItemSelecionado(d, s);
    expect(propsTabela(sem.formas[0]).campos.map((c) => c.nome)).toEqual(['a', 'c']);
  });
  it('não passa dos limites', () => {
    const { t } = tabela();
    const s = { formaId: t.id, tipo: 'campo' as const, id: propsTabela(t).campos[0].id };
    expect(podeMoverItem(t, s, -1)).toBe(false);
  });
});

describe('atributos do Conceitual', () => {
  it('sobe e desce entre irmãos', () => {
    let d = diagramaVazio('conceitual', 't');
    const e = novaForma(d, 'entidade', 200, 200);
    d = adicionarForma(d, e);
    const a1 = adicionarAtributo(d, e.id, 'x'); d = a1.doc;
    const a2 = adicionarAtributo(d, e.id, 'y'); d = a2.doc;
    const ordem = (doc: typeof d) => doc.ligacoes.filter((l) => l.de === e.id).map((l) => doc.formas.find((f) => f.id === l.para)!.texto);
    expect(ordem(d)).toEqual(['x', 'y']);
    expect(ordem(moverAtributo(d, a2.id, -1))).toEqual(['y', 'x']);
    expect(moverAtributo(d, a1.id, -1)).toBe(d);
  });
});

import { apagarSubItemNoPonto, retanguloDoItem } from './itemSel';
import { layoutTabela } from './logico';
import { IndiceTabela, GatilhoTabela, novoId } from './types';

describe('item selecionado: índice, gatilho, forma simples e IR simplificada', () => {
  const comTudo = () => {
    const { d, t } = tabela();
    const p = propsTabela(t);
    const ix: IndiceTabela = { id: novoId(), nome: 'i1', unico: false, metodo: '', condicao: '', campos: [p.campos[0].id] };
    const gt: GatilhoTabela = { id: novoId(), nome: 'g1', momento: 'BEFORE', eventos: 'INSERT', porLinha: true, condicao: '', funcao: 'f()' };
    const t2 = { ...t, props: { ...t.props, indices: [ix], gatilhos: [gt], constraints: [
      { id: 'k1', tipo: 'PK', nomeada: false, nome: '', expressao: '', camposOrigem: [p.campos[0].id], camposDestino: [null], constraintOrigem: null, onDelete: '', onUpdate: '' },
      { id: 'k2', tipo: 'UNIQUE', nomeada: false, nome: '', expressao: '', camposOrigem: [p.campos[1].id], camposDestino: [null], constraintOrigem: null, onDelete: '', onUpdate: '' },
    ], plainIR: false } };
    return { d: { ...d, formas: [t2] }, t: t2, ix, gt };
  };

  it('acha índice e gatilho pela linha e exclui só o item', () => {
    const { d, t, ix, gt } = comTudo();
    const L = layoutTabela(t, 12);
    const si = itemNoPonto(t, t.y + L.yIndices! + 3, 12, t.x + 5)!;
    expect(si).toMatchObject({ tipo: 'indice', id: ix.id });
    const sg = itemNoPonto(t, t.y + L.yGatilhos! + 3, 12, t.x + 5)!;
    expect(sg).toMatchObject({ tipo: 'gatilho', id: gt.id });
    expect(propsTabela(excluirItemSelecionado(d, sg).formas[0]).gatilhos).toHaveLength(0);
    expect(propsTabela(excluirItemSelecionado(d, si).formas[0]).indices).toHaveLength(0);
    expect(propsTabela(excluirItemSelecionado(d, si).formas[0]).campos).toHaveLength(3);
  });

  it('IR simplificada: o ícone é achado pelo x', () => {
    const { t } = comTudo();
    const plain = { ...t, props: { ...t.props, plainIR: true } };
    const L = layoutTabela(plain, 12);
    const y = plain.y + L.yIR! + 4;
    expect(itemNoPonto(plain, y, 12, plain.x + 5)?.id).toBe('k1');
    expect(itemNoPonto(plain, y, 12, plain.x + 1 + (L.rowIR + 2) + 5)?.id).toBe('k2');
    expect(itemNoPonto(plain, y, 12, plain.x + 150)).toBeNull();
    expect(retanguloDoItem(plain, { formaId: plain.id, tipo: 'constraint', id: 'k2' })?.x).toBe(1 + L.rowIR + 2);
  });

  it('forma simples: o campo é achado pelo x na linha', () => {
    const { t } = comTudo();
    const simples = { ...t, w: 400, props: { ...t.props, showInPlain: true } };
    const L = layoutTabela(simples, 12);
    const ln = L.plain!.linhas[0];
    const it = ln.itens[1];
    const s = itemNoPonto(simples, simples.y + ln.y, 12, simples.x + it.x + 2);
    expect(s).toMatchObject({ tipo: 'campo', id: it.campoId });
    expect(itemNoPonto(simples, simples.y + ln.y, 12)).toBeNull();
  });

  it('ferramenta Apagar: só o campo/IR; fora deles devolve null (apaga a tabela)', () => {
    const { d, t } = comTudo();
    const r = apagarSubItemNoPonto(d, t, t.x + 5, t.y + 24 + 4)!;
    expect(propsTabela(r.formas[0]).campos.map((c) => c.nome)).toEqual(['b', 'c']);
    expect(r.formas).toHaveLength(1);
    expect(apagarSubItemNoPonto(d, t, t.x + 5, t.y + 2)).toBeNull();
  });
});
