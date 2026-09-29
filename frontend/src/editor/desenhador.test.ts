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
import { alturaProporcional, cabecasDaSeta, caixaDosItens, geometriaDaSeta, itemNovo, simplificar } from './desenhador';
import { caminhoComentario, caminhoDocumento, caminhoNotaOndulada, girarDirecao, larguraDeSetaValida, pontosDeSeta, pontosTriangulo } from '../shapes/caminhos';
import { quebrarLinhas, tamanhoAutomatico } from '../shapes/texto';

describe('desenhador', () => {
  it('seta horizontal (ângulo 0) percorre a largura no meio da altura', () => {
    const g = geometriaDaSeta(104, 44, 0);
    expect(g.y1).toBe(20);
    expect(g.y2).toBe(20);
    expect(g.x1).toBe(0);
    expect(g.x2).toBe(100);
  });

  it('ângulo 90 vira vertical e desvios deslocam as pontas', () => {
    const g = geometriaDaSeta(104, 44, 90);
    expect(g.x1).toBe(g.x2);
    expect(g.y2 - g.y1).toBe(40);
    const d = geometriaDaSeta(104, 44, 0, 5, 3);
    expect(d.x1).toBe(5);
    expect(d.y1).toBe(23);
  });

  it('cabeças: ponta direita = início, esquerda = fim', () => {
    const g = { x1: 0, y1: 0, x2: 100, y2: 0 };
    const so = cabecasDaSeta(g, 2, true, false);
    expect(so.cabecas).toHaveLength(1);
    expect(so.cabecas[0][0]).toMatchObject({ x: 0, y: 0 });
    expect(cabecasDaSeta(g, 2, false, false).cabecas).toHaveLength(0);
  });

  it('itens de desenho livre: caixa e simplificação', () => {
    const it1 = itemNovo('retangulo', { x: 10, y: 20 }, { x: 50, y: 60 }, '#000000', true);
    expect(it1).toMatchObject({ x: 10, y: 20, w: 40, h: 40 });
    expect(caixaDosItens([it1])).toEqual({ x: 10, y: 20, w: 40, h: 40 });
    const reta = Array.from({ length: 20 }, (_, i) => ({ x: i, y: i * 2 }));
    expect(simplificar(reta)).toHaveLength(2);
  });

  it('proporcional mantém a razão da imagem', () => {
    expect(alturaProporcional(200, 400, 100)).toBe(50);
    expect(alturaProporcional(200, 0, 0)).toBe(0);
  });
});

describe('caminhos', () => {
  it('seta: comprimento = largura/2, aberta recorta a ponta', () => {
    const fechada = pontosDeSeta({ x: 100, y: 0 }, { x: 0, y: 0 }, 20, false);
    expect(fechada).toHaveLength(3);
    expect(fechada[1].x).toBeCloseTo(90);
    const aberta = pontosDeSeta({ x: 100, y: 0 }, { x: 0, y: 0 }, 20, true);
    expect(aberta).toHaveLength(4);
    expect(aberta[2].x).toBeCloseTo(98);
  });

  it('largura de seta válida: fora de 10..99 volta a 10', () => {
    expect(larguraDeSetaValida(5)).toBe(10);
    expect(larguraDeSetaValida(150)).toBe(10);
    expect(larguraDeSetaValida(20)).toBe(20);
  });

  it('triângulo: ápice na direção escolhida e giro em ciclo', () => {
    expect(pontosTriangulo(30, 30, 'Right')[0]).toEqual({ x: 30, y: 15 });
    expect(pontosTriangulo(30, 30, 'Up')[0]).toEqual({ x: 15, y: 0 });
    expect(pontosTriangulo(30, 30, 'Left')[0]).toEqual({ x: 0, y: 15 });
    expect(girarDirecao('Left')).toBe('Up');
    expect(girarDirecao('Up')).toBe('Right');
  });

  it('caminhos fechados e sem NaN', () => {
    for (const d of [caminhoDocumento(120, 58), caminhoNotaOndulada(120, 80), caminhoComentario(120, 58)]) {
      expect(d).not.toMatch(/NaN|undefined/);
      expect(d.startsWith('M')).toBe(true);
    }
  });
});

describe('texto', () => {
  it('quebra em palavras e respeita \\n', () => {
    const l = quebrarLinhas('uma frase bem longa para quebrar', 60, 12);
    expect(l.length).toBeGreaterThan(2);
    expect(l.join(' ')).toBe('uma frase bem longa para quebrar');
    expect(quebrarLinhas('a\nb', 500, 12)).toEqual(['a', 'b']);
  });
  it('tamanho automático cresce com o texto', () => {
    expect(tamanhoAutomatico('abcdefghij', 12).w).toBeGreaterThan(tamanhoAutomatico('abc', 12).w);
    expect(tamanhoAutomatico('a\nb\nc', 12).h).toBeGreaterThan(tamanhoAutomatico('a', 12).h);
  });
});
