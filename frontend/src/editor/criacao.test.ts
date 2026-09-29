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
import {
  atributoNoClique, autoRelacionamentoNoLado, criarFormaConceitual, especializacaoNoClique, ligarConceitual, uniaoDeEntidades,
  zonaAssociativa,
} from './criacao';
import { atributosDe } from './conceitual';
import { moverFormas, adicionarForma, novaForma } from './ops';
import { caminhoDaLigacao } from './roteamento';
import { diagramaVazio } from './types';

const base = () => {
  let d = diagramaVazio('conceitual', 't');
  const a = novaForma(d, 'entidade', 200, 200);
  d = adicionarForma(d, a);
  const b = novaForma(d, 'entidade', 600, 220);
  d = adicionarForma(d, b);
  return { d, a, b };
};

describe('criação no Conceitual', () => {
  it('linha entre duas entidades cria relacionamento no meio com duas linhas', () => {
    const { d, a, b } = base();
    const r = ligarConceitual(d, a, b, { x: a.x, y: a.y }, { x: b.x, y: b.y });
    expect(r.doc.formas.filter((f) => f.kind === 'relacionamento')).toHaveLength(1);
    expect(r.doc.ligacoes).toHaveLength(2);
    const rel = r.doc.formas.find((f) => f.kind === 'relacionamento')!;
    expect(rel.x + rel.w / 2).toBeGreaterThan(a.x + a.w);
    expect(rel.x + rel.w / 2).toBeLessThan(b.x);
  });

  it('linha na mesma entidade vira auto-relacionamento com cardinalidades (0,1)', () => {
    const { d, a } = base();
    const r = ligarConceitual(d, a, a, { x: a.x, y: a.y }, { x: a.x + a.w, y: a.y + 10 });
    expect(r.doc.formas.some((f) => f.kind === 'autorelacionamento')).toBe(true);
    expect(r.doc.ligacoes.map((l) => l.cardDe)).toEqual(['(0,1)', '(0,n)']);
    // as duas linhas têm caminhos distintos (pontos de dobra)
    const [c1, c2] = r.doc.ligacoes.map((l) => caminhoDaLigacao(r.doc, l)!);
    expect(c1.d).not.toEqual(c2.d);
  });

  it('auto-relacionamento respeita o lado mais próximo', () => {
    const { d, a } = base();
    const esq = autoRelacionamentoNoLado(d, a, { x: a.x - 2, y: a.y + 20 });
    expect(esq.doc.formas.find((f) => f.kind === 'autorelacionamento')!.x).toBeLessThan(a.x);
    const topo = autoRelacionamentoNoLado(d, a, { x: a.x + 50, y: a.y });
    expect(topo.doc.formas.find((f) => f.kind === 'autorelacionamento')!.y).toBeLessThan(a.y);
  });

  it('ferramenta atributo em entidade cria atributo no lado e a linha', () => {
    const { d, a } = base();
    const r = atributoNoClique(d, 'atributo', a, { x: a.x + a.w, y: a.y + 20 });
    expect(atributosDe(r.doc, a.id)).toHaveLength(1);
    const at = atributosDe(r.doc, a.id)[0];
    expect(at.x).toBeGreaterThan(a.x + a.w);
    const esq = atributoNoClique(d, 'atributo', a, { x: a.x, y: a.y + 20 });
    expect(atributosDe(esq.doc, a.id)[0].props.direcao).toBe('Right');
  });

  it('atributo multivalorado cria três atributos', () => {
    const { d, a } = base();
    const r = atributoNoClique(d, 'atributoMulti', a, { x: a.x + a.w, y: a.y + 20 });
    expect(r.doc.formas.filter((f) => f.kind === 'atributoMulti')).toHaveLength(1);
    expect(r.doc.formas.filter((f) => f.kind === 'atributo')).toHaveLength(2);
    const multi = r.doc.formas.find((f) => f.kind === 'atributoMulti')!;
    expect(atributosDe(r.doc, multi.id)).toHaveLength(2);
  });

  it('união de entidades cria união, resultante e 3 linhas com principal na resultante', () => {
    const { d, a, b } = base();
    const r = uniaoDeEntidades(d, a, b);
    expect(r.doc.formas.filter((f) => f.kind === 'entidade')).toHaveLength(3);
    expect(r.doc.ligacoes).toHaveLength(3);
    expect(r.doc.ligacoes.filter((l) => l.props.principal)).toHaveLength(1);
  });

  it('especialização dupla e exclusiva ligam a entidade geral', () => {
    const { d, a } = base();
    const dup = especializacaoNoClique(d, 'especializacaoDupla', a, { x: a.x + 50, y: a.y + 10 });
    expect(dup.doc.formas.filter((f) => f.kind === 'entidade')).toHaveLength(4);
    expect(dup.doc.ligacoes).toHaveLength(3);
    const ex = criarFormaConceitual(d, 'especializacaoExclusiva', { x: a.x + 50, y: a.y + 10 }, a)!;
    expect(ex.doc.formas.filter((f) => f.kind === 'entidade')).toHaveLength(3);
    expect(ex.doc.ligacoes.filter((l) => l.props.principal && l.de === a.id)).toHaveLength(1);
  });

  it('mover a entidade leva os atributos e sub-atributos', () => {
    const { d, a } = base();
    const r = atributoNoClique(d, 'atributoMulti', a, { x: a.x + a.w, y: a.y + 20 });
    const antes = r.doc.formas.map((f) => ({ id: f.id, x: f.x }));
    const m = moverFormas(r.doc, [a.id], 30, 0);
    const outra = r.doc.formas.find((f) => f.kind === 'entidade' && f.id !== a.id)!;
    for (const f of m.formas) expect(f.x).toBe(antes.find((q) => q.id === f.id)!.x + (f.id === outra.id ? 0 : 30));
  });

  it('zona da associativa distingue o losango interno', () => {
    let d = diagramaVazio('conceitual', 't');
    const ea = novaForma(d, 'entidadeAssociativa', 300, 300);
    d = adicionarForma(d, ea);
    expect(zonaAssociativa(ea, { x: ea.x + ea.w / 2, y: ea.y + ea.h / 2 })).toBe('interna');
    expect(zonaAssociativa(ea, { x: ea.x + 3, y: ea.y + 3 })).toBe('externa');
  });
});
