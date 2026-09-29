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
import { adicionarAtributo, associativaParaRelacionamento, atributosDe, ehAutoRelacionamento, infoEspecializacao, relacionamentoParaAssociativa, relacionar, removerAtributo } from './conceitual';
import { adicionarForma, novaForma, novaLigacao } from './ops';
import { diagramaVazio } from './types';

const base = () => {
  let d = diagramaVazio('conceitual', 't');
  const a = novaForma(d, 'entidade', 100, 100);
  d = adicionarForma(d, a);
  const b = novaForma(d, 'entidade', 400, 100);
  d = adicionarForma(d, b);
  return { d, a, b };
};

describe('conceitual', () => {
  it('relacionar cria relacionamento com duas ligações (0,n) e auto quando é a mesma entidade', () => {
    const { d, a, b } = base();
    const r = relacionar(d, a.id, b.id);
    expect(r.formas.filter((f) => f.kind === 'relacionamento')).toHaveLength(1);
    expect(r.ligacoes.map((l) => l.cardDe)).toEqual(['(0,n)', '(0,n)']);
    const auto = relacionar(d, a.id, a.id);
    const rel = auto.formas.find((f) => f.kind === 'autorelacionamento')!;
    expect(ehAutoRelacionamento(auto, rel.id)).toBe(true);
  });

  it('atributos: adicionar, listar e remover com sub-atributos', () => {
    const { d, a } = base();
    const r1 = adicionarAtributo(d, a.id);
    const r2 = adicionarAtributo(r1.doc, r1.id, 'sub');
    expect(atributosDe(r2.doc, a.id)).toHaveLength(1);
    const sem = removerAtributo(r2.doc, r1.id);
    expect(sem.formas.filter((f) => f.kind === 'atributo')).toHaveLength(0);
  });

  it('relacionamento <-> entidade associativa', () => {
    const { d, a, b } = base();
    const r = relacionar(d, a.id, b.id);
    const rel = r.formas.find((f) => f.kind === 'relacionamento')!;
    const ass = relacionamentoParaAssociativa(r, rel.id);
    expect(ass.formas.find((f) => f.id === rel.id)!.kind).toBe('entidadeAssociativa');
    expect(ass.ligacoes.every((l) => l.props.interno)).toBe(true);
    const volta = associativaParaRelacionamento(ass, rel.id);
    expect(volta.formas.find((f) => f.id === rel.id)!.kind).toBe('relacionamento');
  });

  it('especialização: a primeira entidade ligada é a principal', () => {
    const { d, a, b } = base();
    const e = novaForma(d, 'especializacao', 250, 200);
    let doc = adicionarForma(d, e);
    doc = novaLigacao(doc, 'linha', a.id, e.id);
    doc = novaLigacao(doc, 'linha', b.id, e.id);
    const info = infoEspecializacao(doc, e);
    expect(info.principal?.id).toBe(a.id);
    expect(doc.ligacoes.filter((l) => l.props.principal)).toHaveLength(1);
  });
});

import { larguraMinimaTabela, reenquadrar } from './geometry';
import { campoVazio } from './types';

describe('largura da tabela', () => {
  it('cresce para caber o campo mais longo e nunca encolhe', () => {
    let d = diagramaVazio('logico', 't');
    const t = novaForma(d, 'tabela', 100, 100);
    t.props = { ...t.props, campos: [campoVazio('unidade_medicao_codigo', 'integer'), campoVazio('id', 'int')] };
    d = adicionarForma(d, t);
    const r = reenquadrar({ ...t, w: 100 });
    expect(r.w).toBeGreaterThanOrEqual(larguraMinimaTabela(t));
    expect(r.w).toBeGreaterThan(190);
    expect(reenquadrar({ ...t, w: 900 }).w).toBe(900);
  });
});
