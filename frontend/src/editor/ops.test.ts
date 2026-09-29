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
import { alinhar, apagar, colar, copiar, novaForma, novaLigacao, nomeLivre, adicionarForma, atualizarProps } from './ops';
import { calcularSnap } from './snap';
import { alternarPk } from './logico';
import { CampoTabela, ConstraintTabela, campoVazio, diagramaVazio } from './types';

const docLogico = () => diagramaVazio('logico', 'T');

describe('ops', () => {
  it('nomeia (Entidade_1, Entidade_2)', () => {
    let d = diagramaVazio('conceitual', 'C');
    d = adicionarForma(d, novaForma(d, 'entidade', 100, 100));
    expect(d.formas[0].texto).toBe('Entidade_1');
    expect(nomeLivre(d, 'Entidade')).toBe('Entidade_2');
  });

  it('ligação lógica cria o campo FK e a constraint FK apontando pra PK de origem', () => {
    let d = docLogico();
    const pai = novaForma(d, 'tabela', 100, 100);
    const filha = novaForma(d, 'tabela', 400, 100);
    d = adicionarForma(adicionarForma(d, pai), filha);
    d = { ...d, formas: d.formas.map((f) => (f.id === pai.id ? alternarPk(f, (f.props.campos as CampoTabela[])[0]?.id ?? 'x', true) : f)) };
    d = atualizarProps(d, pai.id, { campos: [{ ...campoVazio('codigo', 'INTEGER') }] });
    d = { ...d, formas: d.formas.map((f) => (f.id === pai.id ? alternarPk(f, (f.props.campos as CampoTabela[])[0].id, true) : f)) };
    const cmpO = (d.formas.find((f) => f.id === pai.id)!.props.campos as CampoTabela[])[0];
    d = novaLigacao(d, 'logicoLinha', pai.id, filha.id, cmpO.id, null);
    const f2 = d.formas.find((f) => f.id === filha.id)!;
    const campos = f2.props.campos as CampoTabela[];
    expect(campos).toHaveLength(1);
    expect(campos[0]).toMatchObject({ nome: `fk_${pai.texto}_codigo`, fk: true, tipo: 'INTEGER' });
    const cons = f2.props.constraints as ConstraintTabela[];
    expect(cons).toHaveLength(1);
    expect(cons[0]).toMatchObject({ tipo: 'FK', camposOrigem: [cmpO.id], camposDestino: [campos[0].id], constraintOrigem: { tabelaId: pai.id, indice: 0 } });
    expect(d.ligacoes).toHaveLength(1);
    // segunda ligação do mesmo campo reaproveita a constraint e não duplica o campo
    d = novaLigacao({ ...d, ligacoes: [] }, 'logicoLinha', pai.id, filha.id, cmpO.id, campos[0].id);
    expect((d.formas.find((f) => f.id === filha.id)!.props.constraints as ConstraintTabela[])).toHaveLength(1);
  });

  it('apagar forma leva as ligações junto', () => {
    let d = diagramaVazio('conceitual', 'C');
    const a = novaForma(d, 'entidade', 50, 50);
    const b = novaForma(d, 'relacionamento', 300, 50);
    d = adicionarForma(adicionarForma(d, a), b);
    d = novaLigacao(d, 'linha', a.id, b.id);
    expect(apagar(d, [a.id]).ligacoes).toHaveLength(0);
  });

  it('colar gera ids novos e mantém só ligações internas', () => {
    let d = diagramaVazio('conceitual', 'C');
    const a = novaForma(d, 'entidade', 50, 50);
    const b = novaForma(d, 'relacionamento', 300, 50);
    d = adicionarForma(adicionarForma(d, a), b);
    d = novaLigacao(d, 'linha', a.id, b.id);
    const { doc, ids } = colar(d, copiar(d, [a.id, b.id]));
    expect(doc.formas).toHaveLength(4);
    expect(doc.ligacoes).toHaveLength(2);
    expect(ids.every((i) => i !== a.id && i !== b.id)).toBe(true);
  });

  it('alinha à borda esquerda da primeira selecionada', () => {
    let d = diagramaVazio('livre', 'L');
    const a = { ...novaForma(d, 'livreRetangulo', 100, 100), x: 100 };
    const b = { ...novaForma(d, 'livreRetangulo', 300, 200), x: 300 };
    d = adicionarForma(adicionarForma(d, a), b);
    expect(alinhar(d, [a.id, b.id], 'esquerda').formas[1].x).toBe(100);
  });
});

describe('snap', () => {
  it('encaixa dentro do limiar e ignora fora dele', () => {
    const d = diagramaVazio('livre', 'L');
    const o = { ...novaForma(d, 'livreRetangulo', 0, 0), x: 300, y: 200 };
    expect(calcularSnap({ x: 296, y: 0, w: 120, h: 60 }, [o]).dx).toBe(4);
    expect(calcularSnap({ x: 250, y: 0, w: 120, h: 60 }, [o]).guiasX).toEqual([]);
  });
});
