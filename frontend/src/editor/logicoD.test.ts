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
import { alternarPk, alternarVariante, ddlDaTabela, layoutTabela, moverItem, nomeDaConstraint, opcoesDaTabela, propsTabela, TEXTO_VALIDADE, validarConstraint } from './logico';
import { adicionarForma, atualizarProps, novaForma, novaLigacao } from './ops';
import { alturaMinima, reenquadrar } from './geometry';
import { posicionarTextoNaLinha, reposicionarTextosApensos } from './textoApenso';
import { CampoTabela, ConstraintTabela, campoVazio, diagramaVazio } from './types';

function tabelaComCampos(nomes: string[]) {
  let d = diagramaVazio('logico', 'L');
  const t = novaForma(d, 'tabela', 200, 200);
  d = adicionarForma(d, t);
  d = atualizarProps(d, t.id, { campos: nomes.map((n) => campoVazio(n, 'INTEGER')) });
  return { d, id: t.id };
}

describe('Tabela: exibição', () => {
  it('padrões: altura automática, mostrar IR e IR simplificada ligados', () => {
    const { d, id } = tabelaComCampos(['a']);
    const o = opcoesDaTabela(d.formas.find((f) => f.id === id)!);
    expect(o).toEqual({ autosize: true, plain: false, showDDL: false, mostrarConstraints: true, plainIR: true });
  });

  it('a altura cresce com IR, índices, gatilhos e DDL', () => {
    const { d, id } = tabelaComCampos(['a', 'b']);
    let t = d.formas.find((f) => f.id === id)!;
    const base = layoutTabela(t).altura;
    t = alternarPk(t, propsTabela(t).campos[0].id, true);
    expect(layoutTabela(t).altura).toBeGreaterThan(base);
    const comDdl = { ...t, props: { ...t.props, showDDL: true } };
    expect(layoutTabela(comDdl).altura).toBeGreaterThan(layoutTabela(t).altura);
    const semIR = { ...t, props: { ...t.props, mostrarConstraints: false } };
    expect(layoutTabela(semIR).altura).toBe(base);
    expect(alturaMinima(t)).toBe(layoutTabela(t).altura);
  });

  it('IR desenhadas em linhas ocupam uma linha por constraint; simplificadas, uma só', () => {
    const { d, id } = tabelaComCampos(['a', 'b']);
    let t = d.formas.find((f) => f.id === id)!;
    const cs = propsTabela(t).campos;
    t = alternarPk(t, cs[0].id, true);
    t = { ...t, props: { ...t.props, constraints: [...propsTabela(t).constraints, { ...propsTabela(t).constraints[0], id: 'x2', tipo: 'UNIQUE' as const }] } };
    const plain = layoutTabela(t);
    const linhas = layoutTabela({ ...t, props: { ...t.props, plainIR: false } });
    expect(linhas.hIR).toBe(plain.hIR * 2);
  });

  it('autosize desligado mantém a altura dada pelo usuário', () => {
    const { d, id } = tabelaComCampos(['a']);
    const t = { ...d.formas.find((f) => f.id === id)!, h: 300, props: { ...d.formas.find((f) => f.id === id)!.props, autosize: false } };
    expect(reenquadrar(t).h).toBe(300);
  });

  it('forma simples posiciona os campos em linhas e quebra ao passar da largura', () => {
    const nomes = Array.from({ length: 12 }, (_, i) => `campo_longo_${i}`);
    const { d, id } = tabelaComCampos(nomes);
    const t = { ...d.formas.find((f) => f.id === id)!, w: 190, props: { ...d.formas.find((f) => f.id === id)!.props, showInPlain: true } };
    const L = layoutTabela(t);
    expect(L.plain!.linhas.length).toBeGreaterThan(2);
    expect(L.plain!.linhas.flatMap((l) => l.itens)).toHaveLength(12);
  });
});

describe('IR: validação e DDL', () => {
  it('CHECK vazio não é válido; com expressão é', () => {
    const { d, id } = tabelaComCampos(['a']);
    const t = d.formas.find((f) => f.id === id)!;
    const c: ConstraintTabela = { id: 'c', tipo: 'CHECK', nomeada: false, nome: '', expressao: '', camposOrigem: [], camposDestino: [], constraintOrigem: null, onDelete: '', onUpdate: '' };
    expect(validarConstraint(t, c)).toBe('expr');
    expect(TEXTO_VALIDADE.expr).toBe('* expressão vazia');
    expect(validarConstraint(t, { ...c, expressao: 'a > 0' })).toBe('ok');
  });

  it('PK que também é UNIQUE de um só campo: "PK é sempre ÚNICO"', () => {
    const { d, id } = tabelaComCampos(['a']);
    const t0 = d.formas.find((f) => f.id === id)!;
    const cid = propsTabela(t0).campos[0].id;
    const campos: CampoTabela[] = propsTabela(t0).campos.map((c) => ({ ...c, pk: true, unique: true }));
    const t = { ...t0, props: { ...t0.props, campos } };
    const pk: ConstraintTabela = { id: 'p', tipo: 'PK', nomeada: false, nome: '', expressao: '', camposOrigem: [cid], camposDestino: [null], constraintOrigem: null, onDelete: '', onUpdate: '' };
    expect(validarConstraint(t, pk)).toBe('ku');
  });

  it('FK: sem origem, tipos diferentes e ligação ausente', () => {
    let d = diagramaVazio('logico', 'L');
    const pai = novaForma(d, 'tabela', 100, 100);
    const filha = novaForma(d, 'tabela', 500, 100);
    d = adicionarForma(adicionarForma(d, pai), filha);
    const cp = campoVazio('id', 'INTEGER');
    const cf = campoVazio('pai_id', 'VARCHAR(10)');
    d = atualizarProps(d, pai.id, { campos: [cp], constraints: [{ id: 'k', tipo: 'PK', nomeada: false, nome: '', expressao: '', camposOrigem: [cp.id], camposDestino: [null], constraintOrigem: null, onDelete: '', onUpdate: '' }] });
    const fk: ConstraintTabela = { id: 'f', tipo: 'FK', nomeada: false, nome: '', expressao: '', camposOrigem: [cp.id], camposDestino: [cf.id], constraintOrigem: null, onDelete: '', onUpdate: '' };
    d = atualizarProps(d, filha.id, { campos: [cf], constraints: [fk] });
    const f = () => d.formas.find((x) => x.id === filha.id)!;
    expect(validarConstraint(f(), fk, d)).toBe('consOrigem');
    const comOrigem = { ...fk, constraintOrigem: { tabelaId: pai.id, indice: 0 } };
    expect(validarConstraint(f(), comOrigem, d)).toBe('ligacao');
    d = novaLigacao(d, 'logicoLinha', pai.id, filha.id);
    d = atualizarProps(d, filha.id, { campos: [cf], constraints: [comOrigem] });
    expect(validarConstraint(f(), comOrigem, d)).toBe('tipo');
    d = atualizarProps(d, filha.id, { campos: [{ ...cf, tipo: 'INTEGER' }], constraints: [comOrigem] });
    expect(validarConstraint(f(), comOrigem, d)).toBe('ok');
  });

  it('DDL da tabela e nome das IR', () => {
    const { d, id } = tabelaComCampos(['a', 'b']);
    let t = d.formas.find((f) => f.id === id)!;
    t = alternarPk(t, propsTabela(t).campos[0].id, true);
    const ddl = ddlDaTabela(t);
    expect(ddl[0]).toBe(`CREATE TABLE ${t.texto} (`);
    expect(ddl.join('\n')).toContain('PRIMARY KEY (a)');
    expect(ddl[ddl.length - 1]).toBe(');');
    expect(nomeDaConstraint(propsTabela(t).constraints[0])).toBe('Chave primária');
  });

  it('mover item de lista', () => {
    expect(moverItem([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moverItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moverItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});

describe('alternar variante', () => {
  it('view <-> materializada, function <-> procedure, enum <-> domain', () => {
    const d = diagramaVazio('logico', 'L');
    const f = (k: string) => novaForma(d, k, 100, 100);
    expect(alternarVariante(f('visao')).kind).toBe('visaoMaterializada');
    expect(alternarVariante(alternarVariante(f('visao'))).kind).toBe('visao');
    expect(alternarVariante(f('funcao')).kind).toBe('procedure');
    expect(alternarVariante(f('enum')).kind).toBe('dominio');
    expect(alternarVariante(f('dominio')).kind).toBe('enum');
    expect(alternarVariante(f('tabela')).kind).toBe('tabela');
  });
});

describe('texto atrelado à linha', () => {
  it('centraliza no meio da linha e respeita o movimento manual', () => {
    let d = diagramaVazio('livre', 'L');
    const a = novaForma(d, 'livreRetangulo', 100, 100);
    const b = novaForma(d, 'livreRetangulo', 500, 100);
    const t = novaForma(d, 'texto', 10, 10);
    d = adicionarForma(adicionarForma(adicionarForma(d, a), b), t);
    d = novaLigacao(d, 'livreLigacao', a.id, b.id);
    const lig = d.ligacoes[0];
    d = atualizarProps(d, t.id, { linhaMestre: lig.id });
    const n = posicionarTextoNaLinha(d, t.id);
    const tt = n.formas.find((f) => f.id === t.id)!;
    expect(tt.x + tt.w / 2).toBeCloseTo(300, -1);
    const manual = atualizarProps(d, t.id, { movimentacaoManual: true });
    expect(reposicionarTextosApensos(manual)).toBe(manual);
  });
});
