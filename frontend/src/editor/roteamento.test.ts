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
  caminhoDaLigacao, inserirPontoDeDobra, ladoMaisProximo, melhorPontoDeLigacao, moverPontoDeDobra, pontoDeDobraEm,
  pontoMedioDaPolilinha, removerPontoDeDobra, rotaOrtogonal, segmentoMaisProximo,
} from './roteamento';
import { adicionarForma, novaForma, novaLigacao } from './ops';
import { diagramaVazio } from './types';

const doc2 = (x2 = 400, y2 = 100) => {
  let d = diagramaVazio('livre', 't');
  const a = novaForma(d, 'livreRetangulo', 100, 100);
  d = adicionarForma(d, a);
  const b = novaForma(d, 'livreRetangulo', x2, y2);
  d = adicionarForma(d, b);
  d = novaLigacao(d, 'livreLigacao', a.id, b.id);
  return { d, a, b, l: d.ligacoes[0] };
};

describe('roteamento', () => {
  it('ligação reta quando inteligente=false', () => {
    const { d, l } = doc2(400, 300);
    const c = caminhoDaLigacao(d, { ...l, props: { inteligente: false } })!;
    expect(c.pontos).toHaveLength(2);
  });

  it('ortogonal alinhado usa um segmento reto', () => {
    const { d, l } = doc2(400, 100);
    const c = caminhoDaLigacao(d, l)!;
    expect(c.pontos).toHaveLength(2);
    expect(c.pontos[0].y).toBe(c.pontos[1].y);
  });

  it('ortogonal desalinhado faz Z com segmentos ortogonais', () => {
    const { d, a, b } = doc2(400, 400);
    const pts = rotaOrtogonal(a, b);
    expect(pts).toHaveLength(4);
    for (let i = 1; i < pts.length; i++) expect(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y).toBe(true);
    void d;
  });

  it('pontos de dobra manuais viram polilinha ancorada nas bordas', () => {
    const { d, l } = doc2(400, 100);
    const c = caminhoDaLigacao(d, { ...l, props: { pontos: [{ x: 250, y: 300 }] } })!;
    expect(c.pontos).toHaveLength(3);
    expect(c.pontos[1]).toEqual({ x: 250, y: 300 });
    expect(c.d.startsWith('M')).toBe(true);
  });

  it('auto-relacionamento devolve laço', () => {
    let d = diagramaVazio('conceitual', 't');
    const a = novaForma(d, 'entidade', 100, 100);
    d = adicionarForma(d, a);
    const c = caminhoDaLigacao(d, { id: 'x', kind: 'linha', de: a.id, para: a.id, texto: '', cardDe: '', cardPara: '', props: {} })!;
    expect(c.laco).toBe(true);
  });

  it('insere, move e remove pontos de dobra', () => {
    const caminho = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    let p = inserirPontoDeDobra([], caminho, { x: 50, y: 40 });
    expect(p).toEqual([{ x: 50, y: 40 }]);
    const caminho2 = [{ x: 0, y: 0 }, ...p, { x: 100, y: 0 }];
    p = inserirPontoDeDobra(p, caminho2, { x: 80, y: 15 });
    expect(p).toHaveLength(2);
    expect(p[1].x).toBe(80);
    p = moverPontoDeDobra(p, 0, { x: 10, y: 10 });
    expect(pontoDeDobraEm(p, { x: 11, y: 9 })).toBe(0);
    expect(removerPontoDeDobra(p, 0)).toHaveLength(1);
  });

  it('segmento mais próximo e ponto médio', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(segmentoMaisProximo(pts, { x: 102, y: 60 })).toBe(1);
    expect(segmentoMaisProximo(pts, { x: 300, y: 300 })).toBe(-1);
    expect(pontoMedioDaPolilinha(pts)).toEqual({ x: 100, y: 0 });
  });

  it('lado mais próximo e melhor ponto de ligação', () => {
    const { a } = doc2();
    expect(ladoMaisProximo(a, { x: a.x - 5, y: a.y + 10 })).toBe(0);
    expect(melhorPontoDeLigacao(a, { x: a.x + a.w / 2, y: a.y - 10 })).toEqual({ x: a.x + a.w / 2, y: a.y });
  });
});
