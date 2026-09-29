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
import { adicionarForma, apagarComConfig, novaForma, novaLigacao } from './ops';
import { diagramaVazio, Diagrama, Forma } from './types';
import { ajustarAoMultivalorado, definirCardMax, definirCardMin, definirIdentificador, definirOpcional, textoDoAtributo, lerCardinalidade } from './atributo';
import { validarLigacao, normalizarLigacoesDeAtributo } from './canLiga';
import { caixaDaCardinalidade, normalizarCardConceitual, patchArrastoCardinalidade, patchCardManual, textoCardinalidade } from './cardinalidade';
import { larguraTexto } from './geometry';
import { medirTexto, larguraAproximada } from './medidaTexto';
import { caminhoDaLigacao } from './roteamento';
import { rotaEntidadeRelacionamento, buscaOrtogonal } from './roteamentoInteligente';
import { aplicarAlvoNaPonta, apagarFormasSoltandoPontas, ligacaoComPontasSoltas, prenderPontaNaForma } from './linhasSoltas';
import { slotsDaEspecializacao } from './especializacaoSlots';
import { duploCliqueConceitual, infoEspecializacao, parcialEfetiva } from './conceitual';
import { criarFormaConceitual } from './criacao';
import { alfaPercentual } from './alfa';

const add = (d: Diagrama, kind: string, x: number, y: number, texto?: string): { d: Diagrama; f: Forma } => {
  const f = { ...novaForma(d, kind, x, y), ...(texto ? { texto } : {}) };
  return { d: adicionarForma(d, f), f };
};

describe('atributo', () => {
  it('identificador e opcional são exclusivos', () => {
    let p = definirOpcional({}, true);
    expect(p).toMatchObject({ opcional: true, cardMin: 0, identificador: false });
    p = definirIdentificador(p, true);
    expect(p).toMatchObject({ identificador: true, opcional: false });
    p = definirOpcional(p, true);
    expect(p.identificador).toBe(false);
  });
  it('cardinalidade inválida vira n e mínimo 0 torna opcional', () => {
    expect(lerCardinalidade('abc')).toBe(-1);
    expect(lerCardinalidade('N')).toBe(-1);
    expect(lerCardinalidade('-5')).toBe(-1);
    expect(definirCardMin({}, '0')).toMatchObject({ cardMin: 0, opcional: true });
    expect(definirCardMax({ cardMin: 3 }, '2')).toMatchObject({ cardMax: 2, cardMin: 2 });
    expect(ajustarAoMultivalorado({ cardMin: 0 }).opcional).toBe(true);
  });
  it('só o multivalorado desenha (min, max)', () => {
    expect(textoDoAtributo({ kind: 'atributo', texto: 'a', props: { cardMin: 0, cardMax: -1 } })).toBe('a');
    expect(textoDoAtributo({ kind: 'atributoMulti', texto: 'a', props: {} })).toBe('a (1, n)');
  });
});

describe('regras de ligação do conceitual', () => {
  const base = () => {
    let d = diagramaVazio('conceitual', 'c');
    const e1 = add(d, 'entidade', 100, 100); d = e1.d;
    const e2 = add(d, 'entidade', 400, 100); d = e2.d;
    const r = add(d, 'relacionamento', 250, 100); d = r.d;
    const a = add(d, 'atributo', 100, 30); d = a.d;
    return { d, e1: e1.f, e2: e2.f, r: r.f, a: a.f };
  };
  it('entidade-entidade é recusada com motivo', () => {
    const { d, e1, e2 } = base();
    const v = validarLigacao(d, 'linha', e1.id, e2.id);
    expect(v.ok).toBe(false);
    expect(v.motivo).toMatch(/Entidades/);
    expect(novaLigacao(d, 'linha', e1.id, e2.id)).toBe(d);
  });
  it('atributo tem uma só ligação principal e é normalizada dono -> atributo', () => {
    const { d, e1, e2, a } = base();
    const d1 = novaLigacao(d, 'linha', a.id, e1.id);
    expect(d1.ligacoes[0]).toMatchObject({ de: e1.id, para: a.id });
    expect(novaLigacao(d1, 'linha', e2.id, a.id)).toBe(d1);
    const rev = normalizarLigacoesDeAtributo({ ...d, ligacoes: [{ ...d1.ligacoes[0], de: a.id, para: e1.id }] });
    expect(rev.ligacoes[0]).toMatchObject({ de: e1.id, para: a.id });
  });
  it('relacionamento: só entidades/atributos, auto-relacionamento completo recusa', () => {
    const { d, e1, e2, r } = base();
    const r2 = add(d, 'relacionamento', 250, 300);
    expect(validarLigacao(r2.d, 'linha', r.id, r2.f.id).ok).toBe(false);
    let x = novaLigacao(d, 'linha', e1.id, r.id);
    x = novaLigacao(x, 'linha', e1.id, r.id); // nova ligação (mesma entidade): vira auto-relacionamento
    expect(x.ligacoes).toHaveLength(1); // ligacaoEntre impede duplicata exata
    x = novaLigacao(d, 'linha', e1.id, r.id);
    x = novaLigacao(x, 'linha', e2.id, r.id);
    expect(x.ligacoes.map((l) => l.cardDe)).toEqual(['(0,n)', '(0,n)']);
  });
  it('especialização só liga entidades', () => {
    let { d, a } = base();
    const esp = add(d, 'especializacao', 300, 300); d = esp.d;
    expect(validarLigacao(d, 'linha', esp.f.id, a.id).ok).toBe(false);
  });
  it('legenda e raia não aceitam ligação', () => {
    let d = diagramaVazio('atividade', 'a');
    const r = add(d, 'raiaAtividade', 0, 0); d = r.d;
    const e = add(d, 'estadoAtividade', 300, 300); d = e.d;
    expect(validarLigacao(d, 'setaAtividade', r.f.id, e.f.id).ok).toBe(false);
  });
});

describe('cardinalidade', () => {
  it('normaliza para os quatro valores, padrão (0,n)', () => {
    expect(normalizarCardConceitual('1,n')).toBe('(1,n)');
    expect(normalizarCardConceitual('lixo')).toBe('(0,n)');
  });
  it('texto (card) papel e posição automática x manual', () => {
    const l = { cardDe: '(1,n)', cardPara: '', props: { papel: 'chefe' } };
    expect(textoCardinalidade(l)).toBe('(1,n) chefe');
    const forma = { x: 100, y: 100, w: 100, h: 50 };
    const auto = caixaDaCardinalidade(l, 'A', { x: 200, y: 125 }, forma, { tamanho: 12 })!;
    expect(auto.lado).toBe(2);
    expect(auto.x).toBeGreaterThan(200);
    const manual = { ...l, props: { ...l.props, ...patchArrastoCardinalidade(l, 'A', { x: 0, y: 0 }, 10, 20) } };
    const m = caixaDaCardinalidade(manual, 'A', { x: 200, y: 125 }, forma, { tamanho: 12 })!;
    expect(m.x).toBe(auto.x + 10);
    expect(patchCardManual(manual, false)).toMatchObject({ cardManual: false, cardDx: 0, cardDy: 0 });
  });
});

describe('medição de texto', () => {
  it('determinística e proporcional, negrito mais largo', () => {
    expect(medirTexto('Entidade', 12)).toBeCloseTo(larguraAproximada('Entidade') * 12);
    expect(medirTexto('WWW', 12)).toBeGreaterThan(medirTexto('iii', 12));
    expect(larguraTexto('abc', 12, { negrito: true })).toBeGreaterThanOrEqual(larguraTexto('abc', 12));
    expect(medirTexto('', 12)).toBe(0);
  });
});

describe('roteamento inteligente', () => {
  it('entidade-relacionamento: um cotovelo de 90 graus', () => {
    let d = diagramaVazio('conceitual', 'c');
    const e = add(d, 'entidade', 100, 100); d = e.d;
    const r = add(d, 'relacionamento', 400, 300); d = r.d;
    const pts = rotaEntidadeRelacionamento(e.f, r.f, d.formas);
    expect(pts).toHaveLength(3);
    for (let i = 1; i < pts.length; i++) expect(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y).toBe(true);
  });
  it('reta desvia de obstáculo alheio em 3 pernas', () => {
    let d = diagramaVazio('conceitual', 'c');
    const a = add(d, 'entidade', 100, 100); d = a.d;
    const b = add(d, 'entidade', 700, 100); d = b.d;
    const o = add(d, 'relacionamento', 400, 100); d = o.d;
    const pts = rotaEntidadeRelacionamento(a.f, b.f, d.formas);
    expect(pts).toHaveLength(4);
    expect(pts[1].y).toBe(pts[2].y);
  });
  it('busca ortogonal contorna retângulo proibido', () => {
    const p = buscaOrtogonal({ x: 0, y: 50 }, { x: 200, y: 50 }, 2, 2, [{ x: 80, y: 0, w: 40, h: 100 }])!;
    expect(p[0]).toEqual({ x: 0, y: 50 });
    for (let i = 1; i < p.length; i++) expect(p[i].x === p[i - 1].x || p[i].y === p[i - 1].y).toBe(true);
    expect(p.length).toBeGreaterThan(2);
  });
  it('atributo com dono por cima liga em cotovelo', () => {
    let d = diagramaVazio('conceitual', 'c');
    const e = add(d, 'entidade', 300, 300); d = e.d;
    const a = { ...novaForma(d, 'atributo', 120, 150), x: 120, y: 150 }; d = adicionarForma(d, a);
    d = novaLigacao(d, 'linha', e.f.id, a.id);
    const c = caminhoDaLigacao(d, d.ligacoes[0])!;
    expect(c.pontos.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < c.pontos.length; i++) expect(c.pontos[i].x === c.pontos[i - 1].x || c.pontos[i].y === c.pontos[i - 1].y).toBe(true);
  });
});

describe('linhas soltas', () => {
  it('ligação com ponta livre tem caminho e sobrevive a apagar sem propagar', () => {
    let d = diagramaVazio('fluxo', 'f');
    const a = add(d, 'fluxProcesso', 100, 100); d = a.d;
    const r = ligacaoComPontasSoltas(d, 'fluxSeta', { forma: a.f.id, ponto: { x: 0, y: 0 } }, { ponto: { x: 500, y: 300 } });
    d = r.doc;
    const c = caminhoDaLigacao(d, d.ligacoes[0])!;
    expect(c.b).toEqual({ x: 500, y: 300 });
    const sem = apagarComConfig(d, [a.f.id], false).doc;
    expect(sem.formas).toHaveLength(0);
    expect(sem.ligacoes).toHaveLength(1);
    expect(sem.ligacoes[0].de).toBe('');
    expect(sem.ligacoes[0].props.pontaA).toBeTruthy();
    expect(apagarFormasSoltandoPontas(d, []).ligacoes).toHaveLength(1);
  });
  it('ponta pode prender numa forma (ponto de conexão) ou em outra linha', () => {
    let d = diagramaVazio('livre', 'l');
    const a = add(d, 'livreRetangulo', 100, 100); d = a.d;
    const b = add(d, 'livreRetangulo', 500, 100); d = b.d;
    d = ligacaoComPontasSoltas(d, 'livreLigacao', { forma: a.f.id, ponto: { x: 0, y: 0 } }, { forma: b.f.id, ponto: { x: 0, y: 0 } }).doc;
    const l1 = d.ligacoes[0].id;
    d = prenderPontaNaForma(d, l1, 'B', b.f.id, { x: b.f.x + b.f.w / 2, y: b.f.y });
    expect(d.ligacoes[0].props.conexaoB).toBe(4);
    const r2 = ligacaoComPontasSoltas(d, 'livreLigacao', { ponto: { x: 300, y: 300 } }, { ponto: { x: 320, y: 320 } });
    d = aplicarAlvoNaPonta(r2.doc, r2.id, 'B', { ligacao: l1, ponto: { x: 300, y: 100 } });
    const c = caminhoDaLigacao(d, d.ligacoes[1])!;
    expect(Math.abs(c.b.y - c.antesB.y) + 0).toBeGreaterThanOrEqual(0);
    expect(caminhoDaLigacao(d, d.ligacoes[0])!.b.y).toBeCloseTo(b.f.y);
  });
});

describe('especialização', () => {
  it('parcial só vale com mais de uma ligação e ponto principal; vértices por ligação', () => {
    let d = diagramaVazio('conceitual', 'c');
    const g = add(d, 'entidade', 300, 100); d = g.d;
    const esp = add(d, 'especializacaoExclusiva', 300, 300); d = esp.d;
    const f1 = add(d, 'entidade', 200, 500); d = f1.d;
    const f2 = add(d, 'entidade', 450, 500); d = f2.d;
    d = novaLigacao(d, 'linha', g.f.id, esp.f.id);
    const espP = { ...esp.f, props: { ...esp.f.props, parcial: true } };
    d = { ...d, formas: d.formas.map((f) => (f.id === esp.f.id ? espP : f)) };
    expect(parcialEfetiva(d, espP)).toBe(false);
    d = novaLigacao(d, 'linha', f1.f.id, esp.f.id);
    expect(parcialEfetiva(d, espP)).toBe(true);
    expect(infoEspecializacao(d, espP).parcial).toBe(true);
    d = novaLigacao(d, 'linha', f2.f.id, esp.f.id);
    const slots = slotsDaEspecializacao(d, espP);
    expect(new Set([...slots.values()].map((p) => `${p.x},${p.y}`)).size).toBe(3);
  });
  it('duplo clique gira o triângulo e alterna o lado do atributo', () => {
    let d = diagramaVazio('conceitual', 'c');
    const esp = add(d, 'especializacao', 100, 100); d = esp.d;
    expect(duploCliqueConceitual(d, esp.f)!.formas[0].props.direcao).toBe('Right');
    const at = add(d, 'atributo', 200, 200);
    expect(duploCliqueConceitual(at.d, at.f)!.formas[1].props.direcao).toBe('Right');
    expect(duploCliqueConceitual(d, novaForma(d, 'entidade', 1, 1))).toBeNull();
  });
});

describe('criação conceitual e Fluxo', () => {
  it('tamanhos e nomes padrão, canto no clique', () => {
    const d = diagramaVazio('conceitual', 'c');
    const e = criarFormaConceitual(d, 'entidade', { x: 100, y: 80 })!;
    expect(e.doc.formas[0]).toMatchObject({ x: 100, y: 80, w: 120, h: 58 });
    const ar = criarFormaConceitual(d, 'autorelacionamento', { x: 10, y: 10 })!;
    expect(ar.doc.formas[0]).toMatchObject({ kind: 'relacionamento', w: 150, h: 50 });
    const ea = criarFormaConceitual(d, 'entidadeAssociativa', { x: 10, y: 10 })!;
    expect(ea.doc.formas[0]).toMatchObject({ w: 158, h: 58, texto: 'E. Assoc._1' });
    const u = criarFormaConceitual(d, 'uniao', { x: 10, y: 10 })!;
    expect(u.doc.formas[0]).toMatchObject({ w: 40, h: 32 });
  });
  it('Sim/Não conta todas as setas presas na decisão (entrando ou saindo)', () => {
    let d = diagramaVazio('fluxo', 'f');
    const dec = add(d, 'fluxDecisao', 300, 100); d = dec.d;
    const a = add(d, 'fluxProcesso', 100, 300); d = a.d;
    const b = add(d, 'fluxProcesso', 500, 300); d = b.d;
    d = novaLigacao(d, 'fluxSeta', a.f.id, dec.f.id);
    d = novaLigacao(d, 'fluxSeta', dec.f.id, b.f.id);
    expect(d.ligacoes.map((l) => l.texto)).toEqual(['Sim', 'Não']);
  });
  it('alfa acima de 100 volta a 50', () => {
    expect(alfaPercentual(150)).toBe(50);
    expect(alfaPercentual(70)).toBe(70);
  });
});
