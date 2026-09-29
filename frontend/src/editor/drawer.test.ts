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
  areaDoDrawer, avaliarExpr, caminhoDoArco, converterMedida, divisorDoPasso, formatarUnidade, geometriaDoItem, medidasDoDrawer, normalizarMargem, normalizarProporcao,
  novoItemDrawer, numerosDaExpr, passoDaRegua, posicaoProporcional, reguaHorizontal, reguaVertical, tamanhoPelaMedida, temRegua, itemComExpr, ItemDrawer,
} from './drawer';
import { Forma } from './types';

const forma = (props: Record<string, unknown> = {}, w = 250, h = 150): Forma => ({ id: 'd', kind: 'livreDrawer', x: 0, y: 0, w, h, texto: 'Desenho', props });
const V = { L: 24, T: 24, W: 202, H: 102 };

describe('LivreDrawer: medidas', () => {
  it('padrões do baseDrawer', () => {
    const m = medidasDoDrawer(forma());
    expect(m).toMatchObject({ unidade: '', px: 1, medida: 1, esq: true, topo: true, baixo: true, dir: true, corRegua: '#00cccc', margem: 24, mostrarTexto: true, pintarBorda: true, roundrect: 22, delimite: false });
    expect(areaDoDrawer(forma(), m)).toEqual({ L: 24, T: 24, W: 202, H: 102 });
  });
  it('normaliza proporção e margem como os setters', () => {
    expect(normalizarProporcao(1)).toBe(1);
    expect(normalizarProporcao(0)).toBe(1);
    expect(normalizarProporcao(10)).toBe(10);
    expect(normalizarMargem(200, 250, 150)).toBe(14);
    expect(normalizarMargem(-1, 250, 150)).toBe(14);
    expect(normalizarMargem(30, 250, 150)).toBe(30);
  });
  it('converte pixels para a unidade e de volta', () => {
    const m = medidasDoDrawer(forma({ proporcaoPx: 10, proporcaoMedida: 1, unidadeMedida: 'm' }));
    expect(converterMedida(202, m)).toBe('20,20');
    expect(formatarUnidade(100, m)).toBe('10,00m');
    expect(tamanhoPelaMedida('20,5', m)).toBe(205 + 48);
    expect(tamanhoPelaMedida('abc', m)).toBeNull();
    expect(converterMedida(203.456, medidasDoDrawer(forma()))).toBe('203,46');
    expect(converterMedida(202, medidasDoDrawer(forma()))).toBe('202');
  });
  it('mostrar texto da régua depende de alguma régua ligada', () => {
    expect(temRegua(medidasDoDrawer(forma({ metricaEsq: false, metricaTopo: false, metricaBaixo: false, metricaDir: false })))).toBe(false);
    expect(temRegua(medidasDoDrawer(forma({ metricaEsq: false, metricaTopo: false, metricaBaixo: true, metricaDir: false })))).toBe(true);
  });
});

describe('LivreDrawer: régua', () => {
  it('passo e divisor', () => {
    expect(passoDaRegua({ px: 1, medida: 1 })).toBe(32);
    expect(passoDaRegua({ px: 10, medida: 1 })).toBe(40);
    expect(divisorDoPasso(40)).toBe(5);
    expect(divisorDoPasso(32)).toBe(4);
    expect(divisorDoPasso(33)).toBe(3);
    expect(divisorDoPasso(7)).toBe(0);
  });
  it('régua superior tem as duas pontas e as marcas', () => {
    const f = forma();
    const m = medidasDoDrawer(f);
    const s = reguaHorizontal(f, m, true);
    expect(s[0]).toEqual({ x1: 24, y1: 2, x2: 24, y2: 10 });
    expect(s[1]).toEqual({ x1: 226, y1: 2, x2: 226, y2: 10 });
    expect(s[2]).toEqual({ x1: 24, y1: 2, x2: 226, y2: 2 });
    expect(s.length).toBeGreaterThan(10);
    const b = reguaHorizontal(f, m, false);
    expect(b[2].y1).toBe(148);
    expect(b[0].y2).toBe(140);
  });
  it('régua lateral', () => {
    const f = forma();
    const m = medidasDoDrawer(f);
    const e = reguaVertical(f, m, false);
    expect(e[2]).toEqual({ x1: 2, y1: 24, x2: 2, y2: 126 });
    const d = reguaVertical(f, m, true);
    expect(d[2].x1).toBe(248);
  });
  it('margem menor que o traço limita o traço', () => {
    const f = forma({ margem: 2 });
    const s = reguaHorizontal(f, medidasDoDrawer(f), true);
    expect(s[0].y2 - s[0].y1).toBe(4);
  });
});

describe('LivreDrawer: expressões e geometria', () => {
  it('avalia expressões com L/T/W/H', () => {
    expect(avaliarExpr('L', V)).toBe(24);
    expect(avaliarExpr('W-2', V)).toBe(200);
    expect(avaliarExpr('L + W - 2', V)).toBe(224);
    expect(avaliarExpr('(W+H)/2*2', V)).toBe(304);
    expect(avaliarExpr('-5+3', V)).toBe(-2);
    expect(avaliarExpr('W/0', V)).toBeNaN();
    expect(avaliarExpr('abc', V)).toBeNaN();
    expect(avaliarExpr('', V)).toBeNaN();
    expect(numerosDaExpr('L,T,W-2,H-2', V)).toEqual([24, 24, 200, 100]);
    expect(numerosDaExpr('1,x', V)).toEqual([0, 0]);
  });
  const it_ = (tipo: ItemDrawer['tipo'], expr: string): ItemDrawer => ({ ...novoItemDrawer(), tipo, expr });
  it('retângulo, retângulo arredondado e elipse', () => {
    expect(geometriaDoItem(novoItemDrawer(), V)).toEqual({ forma: 'retangulo', x: 24, y: 24, w: 200, h: 100 });
    expect(geometriaDoItem(it_('retangulo', '0,0,10,10,6,8'), V)).toEqual({ forma: 'retangulo', x: 0, y: 0, w: 10, h: 10, rx: 3, ry: 4 });
    expect(geometriaDoItem(it_('elipse', 'L,T,W,H'), V)).toEqual({ forma: 'elipse', x: 24, y: 24, w: 202, h: 102 });
    expect(geometriaDoItem(it_('elipse', '1,2,3'), V)).toEqual({ forma: 'erro' });
  });
  it('curva quadrática e cúbica', () => {
    expect(geometriaDoItem(it_('curva', '0,0,5,5,10,0'), V)).toEqual({ forma: 'caminho', d: 'M0,0 Q5,5 10,0' });
    expect(geometriaDoItem(it_('curva', '0,0,1,1,2,2,3,3'), V)).toEqual({ forma: 'caminho', d: 'M0,0 C1,1 2,2 3,3' });
    expect(geometriaDoItem(it_('curva', '0,0,1,1'), V)).toEqual({ forma: 'erro' });
  });
  it('arco: aberto, corda, pizza e círculo completo', () => {
    const aberto = caminhoDoArco(0, 0, 100, 100, 0, 90, 0);
    expect(aberto.startsWith('M100,50 A50,50 0 0 0 50,0')).toBe(true);
    expect(aberto.endsWith('Z')).toBe(false);
    expect(caminhoDoArco(0, 0, 100, 100, 0, 90, 1).endsWith(' Z')).toBe(true);
    expect(caminhoDoArco(0, 0, 100, 100, 0, 90, 2)).toContain('L50,50 Z');
    expect(caminhoDoArco(0, 0, 100, 100, 0, -270, 0)).toContain(' 1 1 ');
    expect(caminhoDoArco(0, 0, 100, 100, 0, 360, 0)).toContain('Z');
    expect(geometriaDoItem(it_('arco', 'L,T,W,H,90,135,0'), V).forma).toBe('caminho');
    expect(geometriaDoItem(it_('arco', '1,2,3'), V)).toEqual({ forma: 'erro' });
  });
  it('path (polígono) e imagem', () => {
    expect(geometriaDoItem(it_('path', '0,0,10,0,10,10'), V)).toEqual({ forma: 'caminho', d: 'M0,0 L10,0 L10,10 Z' });
    expect(geometriaDoItem(it_('path', '1,2'), V)).toEqual({ forma: 'erro' });
    expect(geometriaDoItem(it_('imagem', 'L,T,200,100'), V)).toEqual({ forma: 'imagem', x: 24, y: 24, w: 200, h: 100 });
  });
  it('imagem proporcional mantém a largura', () => {
    expect(posicaoProporcional('L,T,200,200', 400, 100, V)).toBe('L,T,200,50');
    expect(posicaoProporcional('L,T,200,200', 0, 0, V)).toBe('L,T,200,200');
  });
  it('item antigo (coordenadas) ganha expr ao abrir', () => {
    const antigo: ItemDrawer = { tipo: 'retangulo', x: 3, y: 4, w: 50, h: 20, cor: '#000', preencher: true, largura: 1 };
    expect(itemComExpr(antigo).expr).toBe('3,4,50,20');
    const linha: ItemDrawer = { tipo: 'linha', x: 0, y: 0, w: 1, h: 1, cor: '#000', preencher: false, largura: 1, pontos: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
    expect(itemComExpr(linha).expr).toBeUndefined();
  });
});
