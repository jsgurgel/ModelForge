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
  adicionarCampoVariante, adicionarForma, apagar, autoCapturar, capturarNaArea, definirCardinalidadeLogica, estaAncorada, moverFormas,
  novaForma, novaLigacao, redimensionar, soltarDaArea,
} from './ops';
import { propsTabela } from './logico';
import { diagramaVazio } from './types';

describe('ancorado', () => {
  it('forma ancorada não move nem redimensiona', () => {
    let d = diagramaVazio('livre', 't');
    const f = { ...novaForma(d, 'livreRetangulo', 100, 100) };
    f.props = { ancorado: true };
    d = adicionarForma(d, f);
    expect(estaAncorada(f)).toBe(true);
    expect(moverFormas(d, [f.id], 50, 50).formas[0].x).toBe(f.x);
    expect(redimensionar(d, f.id, 0, 0, 500, 500).formas[0].w).toBe(f.w);
  });
});

describe('raias', () => {
  const base = () => {
    let d = diagramaVazio('atividade', 't');
    const raia = novaForma(d, 'raiaAtividade', 200, 200);
    d = adicionarForma(d, raia);
    const dentro = novaForma(d, 'estadoAtividade', 200, 200);
    d = adicionarForma(d, dentro);
    const fora = novaForma(d, 'estadoAtividade', 900, 900);
    d = adicionarForma(d, fora);
    return { d, raia, dentro, fora };
  };
  it('captura, solta e move os capturados com a raia', () => {
    const { d, raia, dentro, fora } = base();
    let r = capturarNaArea(d, raia.id);
    expect(r.formas.find((f) => f.id === raia.id)!.props.capturados).toEqual([dentro.id]);
    const m = moverFormas(r, [raia.id], 40, 0);
    expect(m.formas.find((f) => f.id === dentro.id)!.x).toBe(dentro.x + 40);
    expect(m.formas.find((f) => f.id === fora.id)!.x).toBe(fora.x);
    r = soltarDaArea(r, raia.id);
    expect(moverFormas(r, [raia.id], 40, 0).formas.find((f) => f.id === dentro.id)!.x).toBe(dentro.x);
  });
  it('autoCaptura ao soltar dentro e solta ao sair; respeita autoCaptura=false', () => {
    const { d, raia, dentro } = base();
    let r = autoCapturar(d, [dentro.id]);
    expect(r.formas.find((f) => f.id === raia.id)!.props.capturados).toContain(dentro.id);
    r = { ...r, formas: r.formas.map((f) => (f.id === dentro.id ? { ...f, x: 2000, y: 2000 } : f)) };
    r = autoCapturar(r, [dentro.id]);
    expect(r.formas.find((f) => f.id === raia.id)!.props.capturados).toEqual([]);
    const sem = { ...d, formas: d.formas.map((f) => (f.id === raia.id ? { ...f, props: { ...f.props, autoCaptura: false } } : f)) };
    expect(autoCapturar(sem, [dentro.id]).formas.find((f) => f.id === raia.id)!.props.capturados).toEqual([]);
  });
  it('apagar remove o id dos capturados', () => {
    const { d, raia, dentro } = base();
    const r = apagar(capturarNaArea(d, raia.id), [dentro.id]);
    expect(r.formas.find((f) => f.id === raia.id)!.props.capturados).toEqual([]);
  });
});

describe('EAP', () => {
  const base = () => {
    let d = diagramaVazio('eap', 't');
    const p1 = novaForma(d, 'eapProcesso', 100, 100);
    d = adicionarForma(d, p1);
    const p2 = novaForma(d, 'eapProcesso', 100, 400);
    d = adicionarForma(d, p2);
    const p3 = novaForma(d, 'eapProcesso', 300, 400);
    d = adicionarForma(d, p3);
    const b = novaForma(d, 'eapBarraLigacao', 200, 250);
    d = adicionarForma(d, b);
    return { d, p1, p2, p3, b };
  };
  it('processo com processo cria a barra no meio', () => {
    const { d, p1, p2 } = base();
    const r = novaLigacao(d, 'eapLigacao', p1.id, p2.id);
    expect(r.formas.filter((f) => f.kind === 'eapBarraLigacao')).toHaveLength(2);
    expect(r.ligacoes).toHaveLength(2);
  });
  it('barra: um pai, vários filhos, filho de uma só barra', () => {
    const { d, p1, p2, p3, b } = base();
    let r = novaLigacao(d, 'eapLigacao', p1.id, b.id);
    r = novaLigacao(r, 'eapLigacao', p2.id, b.id);
    r = novaLigacao(r, 'eapLigacao', p3.id, b.id);
    expect(r.ligacoes.map((l) => l.props.papel)).toEqual(['pai', 'filho', 'filho']);
    // p2 já é filho: não pode ser filho de outra barra
    const b2 = novaForma(r, 'eapBarraLigacao', 500, 250);
    r = adicionarForma(r, b2);
    r = novaLigacao(r, 'eapLigacao', p1.id, b2.id);
    const antes = r.ligacoes.length;
    r = novaLigacao(r, 'eapLigacao', p2.id, b2.id);
    expect(r.ligacoes.length).toBe(antes);
  });
  it('barra com barra é recusada', () => {
    const { d, b } = base();
    const b2 = novaForma(d, 'eapBarraLigacao', 500, 250);
    const r = novaLigacao(adicionarForma(d, b2), 'eapLigacao', b.id, b2.id);
    expect(r.ligacoes).toHaveLength(0);
  });
});

describe('Fluxo', () => {
  it('a segunda seta da decisão recebe Sim/Não opostos', () => {
    let d = diagramaVazio('fluxo', 't');
    const dec = novaForma(d, 'fluxDecisao', 300, 100);
    d = adicionarForma(d, dec);
    const a = novaForma(d, 'fluxProcesso', 100, 300);
    d = adicionarForma(d, a);
    const b = novaForma(d, 'fluxProcesso', 500, 300);
    d = adicionarForma(d, b);
    d = novaLigacao(d, 'fluxLigacao', dec.id, a.id);
    expect(d.ligacoes[0].texto).toBe('');
    d = novaLigacao(d, 'fluxLigacao', dec.id, b.id);
    expect(d.ligacoes.map((l) => l.texto)).toEqual(['Sim', 'Não']);
  });
});

describe('Lógico', () => {
  it('variantes de campo e cardinalidade da linha', () => {
    let d = diagramaVazio('logico', 't');
    const t = novaForma(d, 'tabela', 200, 200);
    d = adicionarForma(d, t);
    for (const v of ['campo', 'key', 'fkey', 'keyfkey'] as const) d = adicionarCampoVariante(d, t.id, v);
    const c = propsTabela(d.formas[0]).campos;
    expect(c.map((x) => [x.pk, x.fk])).toEqual([[false, false], [true, false], [false, true], [true, true]]);
    const t2 = novaForma(d, 'tabela', 600, 200);
    d = adicionarForma(d, t2);
    d = novaLigacao(d, 'logicoLinha', t.id, t2.id);
    d = definirCardinalidadeLogica(d, d.ligacoes[0].id, '1', '1');
    expect([d.ligacoes[0].cardDe, d.ligacoes[0].cardPara]).toEqual(['(1,1)', '(1,1)']);
  });
});

import { apagarComConfig, microajustar } from './ops';
import { colarFormato, copiarFormato, idsRealcados, passoMicroajuste } from './formato';
import { inserirRecente } from './recentes';
import { CONFIG_PADRAO, encaixar, normalizarConfig } from './config';

describe('edição', () => {
  const doc2 = () => {
    let d = diagramaVazio('livre', 't');
    const a = { ...novaForma(d, 'livreRetangulo', 100, 100), cor: '#ff0000', corBorda: '#00ff00', fonte: { negrito: false } };
    d = adicionarForma(d, a);
    const b = novaForma(d, 'livreRetangulo', 400, 100);
    d = adicionarForma(d, b);
    const c = novaForma(d, 'livreRetangulo', 700, 400);
    d = adicionarForma(d, c);
    d = novaLigacao(d, 'livreLigacao', a.id, b.id);
    return { d, a, b, c };
  };
  it('copiar e colar formato', () => {
    const { d, a, b } = doc2();
    const r = colarFormato(d, [b.id], copiarFormato(a));
    expect(r.formas.find((f) => f.id === b.id)).toMatchObject({ cor: '#ff0000', corBorda: '#00ff00', fonte: { negrito: false } });
  });
  it('realçar: seleção, vizinhos e ligações', () => {
    const { d, a, b, c } = doc2();
    const r = idsRealcados(d, [a.id]);
    expect(r.has(b.id)).toBe(true);
    expect(r.has(d.ligacoes[0].id)).toBe(true);
    expect(r.has(c.id)).toBe(false);
  });
  it('micro-ajuste: 3px, 1px com Ctrl, Shift redimensiona', () => {
    const { d, a } = doc2();
    expect(passoMicroajuste('left', false)).toEqual({ dx: -3, dy: 0 });
    expect(passoMicroajuste('down', true)).toEqual({ dx: 0, dy: 1 });
    expect(microajustar(d, [a.id], 3, 0, false).formas[0].x).toBe(a.x + 3);
    expect(microajustar(d, [a.id], 3, 0, true).formas[0].w).toBe(a.w + 3);
  });
  it('apagar sem propagar preserva quem tem ligações', () => {
    const { d, a, c } = doc2();
    //# Fluxo/Atividade/Livre têm linha solta: a forma é apagada e a ligação fica com a ponta livre; nos demais tipos é bloqueada.
    const sem = apagarComConfig(d, [a.id], false);
    if (['fluxo', 'atividade', 'livre'].includes(d.tipo)) {
      expect(sem.bloqueados).toEqual([]);
      expect(sem.doc.ligacoes.length).toBeGreaterThan(0);
    } else expect(sem.bloqueados).toEqual([a.id]);
    expect(apagarComConfig(d, [c.id], false).doc.formas).toHaveLength(2);
    expect(apagarComConfig(d, [a.id], true).doc.ligacoes).toHaveLength(0);
  });
  it('recentes sem duplicar e com limite', () => {
    let l = inserirRecente([], { nome: 'a', quando: 1 });
    l = inserirRecente(l, { nome: 'b', quando: 2 });
    l = inserirRecente(l, { nome: 'a', quando: 3 });
    expect(l.map((r) => r.nome)).toEqual(['a', 'b']);
    expect(inserirRecente(l, { nome: 'c', quando: 4 }, 2)).toHaveLength(2);
  });
  it('config normaliza valores inválidos e encaixa na grade', () => {
    const c = normalizarConfig({ larguraGrade: 'x', mostrarGrade: 'sim', tipoPadrao: 'xpto', intervaloAutosave: -3, larguraSidebar: 9999 });
    expect(c.larguraGrade).toBe(CONFIG_PADRAO.larguraGrade);
    expect(c.mostrarGrade).toBe(false);
    expect(c.tipoPadrao).toBe('conceitual');
    expect(c.intervaloAutosave).toBe(0);
    expect(c.larguraSidebar).toBe(700);
    expect(encaixar(33, 20)).toBe(40);
  });
});
