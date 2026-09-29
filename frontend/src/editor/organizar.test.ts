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
import { adicionarForma, novaForma, novaLigacao } from './ops';
import { barrasDaEap, distanciaMinima, layoutForcas, mapaPosi, organizarBarraEap, organizarDiagrama, organizarEapCompleto, organizarFluxo, organizarTabelas } from './organizar';
import { analisarProcessos, construirEap } from './eapCli';
import { Diagrama, diagramaVazio } from './types';

const com = (d: Diagrama, kind: string, x: number, y: number) => {
  const f = novaForma(d, kind, x, y);
  return { d: adicionarForma(d, f), f };
};

describe('organizar', () => {
  it('mapaPosi segue o esquema 1 2 3 / 0 A 4 / 7 6 5', () => {
    const A = { x: 200, y: 200, w: 100, h: 50 };
    expect(mapaPosi(A, { x: 210, y: 400, w: 100, h: 50 })).toBe(6);
    expect(mapaPosi(A, { x: 210, y: 20, w: 100, h: 50 })).toBe(2);
    expect(mapaPosi(A, { x: 500, y: 205, w: 100, h: 50 })).toBe(4);
    expect(mapaPosi(A, { x: 500, y: 400, w: 100, h: 50 })).toBe(5);
  });

  it('distanciaMinima afasta tabelas muito próximas na horizontal e na vertical', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    expect(distanciaMinima(a, { x: 110, y: 0, w: 100, h: 100 }).x).toBeGreaterThan(0);
    expect(distanciaMinima(a, { x: 0, y: 110, w: 100, h: 100 }).y).toBeGreaterThan(0);
    expect(distanciaMinima(a, { x: 500, y: 0, w: 100, h: 100 })).toEqual({ x: 0, y: 0 });
  });

  it('layoutForcas é determinístico e separa nós sobrepostos', () => {
    const nos = [{ x: 0, y: 0, w: 100, h: 50 }, { x: 5, y: 5, w: 100, h: 50 }];
    const a = layoutForcas(nos, [], 50, 160);
    const b = layoutForcas(nos, [], 50, 160);
    expect(a).toEqual(b);
    expect(Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y)).toBeGreaterThan(100);
  });

  it('organizarTabelas deixa distância mínima entre tabelas e dentro do canvas', () => {
    let d = diagramaVazio('logico', 'L');
    const ts = [0, 1, 2, 3].map((i) => { const r = com(d, 'tabela', 300 + i * 10, 300 + i * 5); d = r.d; return r.f; });
    d = novaLigacao(d, 'logicoLinha', ts[0].id, ts[1].id);
    const o = organizarTabelas(d);
    const fs = o.formas.filter((f) => f.kind === 'tabela');
    for (let i = 0; i < fs.length; i++) {
      expect(fs[i].x).toBeGreaterThanOrEqual(0);
      expect(fs[i].x + fs[i].w).toBeLessThanOrEqual(d.largura);
      for (let j = i + 1; j < fs.length; j++) {
        const sobrepoe = fs[i].x < fs[j].x + fs[j].w && fs[j].x < fs[i].x + fs[i].w && fs[i].y < fs[j].y + fs[j].h && fs[j].y < fs[i].y + fs[i].h;
        expect(sobrepoe).toBe(false);
      }
    }
  });

  it('organizarFluxo alinha os vizinhos para a ligação ficar reta', () => {
    let d = diagramaVazio('fluxo', 'F');
    const a = com(d, 'fluxIniFim', 200, 100); d = a.d;
    const b = com(d, 'fluxProcesso', 260, 300); d = b.d;
    const c = com(d, 'fluxProcesso', 200, 520); d = c.d;
    d = novaLigacao(d, 'fluxLigacao', a.f.id, b.f.id);
    d = novaLigacao(d, 'fluxLigacao', b.f.id, c.f.id);
    const o = organizarFluxo(d, a.f.id);
    const g = (id: string) => o.formas.find((f) => f.id === id)!;
    const cx = (id: string) => g(id).x + g(id).w / 2;
    expect(cx(b.f.id)).toBeCloseTo(cx(a.f.id), 0);
    expect(cx(c.f.id)).toBeCloseTo(cx(b.f.id), 0);
  });

  it('despacha por tipo de diagrama', () => {
    const d = diagramaVazio('fluxo', 'F');
    expect(organizarDiagrama(d)).toBe(d);
  });
});

describe('EAP', () => {
  it('analisa recuo em árvore', () => {
    const t = analisarProcessos('A\n  A1\n  A2\nB');
    expect(t.map((n) => n.texto)).toEqual(['A', 'B']);
    expect(t[0].filhos.map((n) => n.texto)).toEqual(['A1', 'A2']);
  });

  it('construtor exige quadro principal e ao menos um processo', () => {
    const d = diagramaVazio('eap', 'E');
    expect(construirEap(d, { principal: '', processos: 'A', organizacao: 'vertical', x: 10, y: 10 }).erro).toBeTruthy();
    expect(construirEap(d, { principal: 'P', processos: '', organizacao: 'vertical', x: 10, y: 10 }).erro).toBeTruthy();
  });

  it('horizontal centro: pai centralizado sobre os filhos, filhos na mesma linha, sem sobreposição', () => {
    const d = diagramaVazio('eap', 'E');
    const r = construirEap(d, { principal: 'Projeto', processos: 'Fase 1\nFase 2\nFase 3', organizacao: 'horizontal-centro', x: 100, y: 50 });
    expect(r.erro).toBeUndefined();
    const procs = r.doc.formas.filter((f) => f.kind === 'eapProcesso');
    expect(procs).toHaveLength(4);
    const pai = procs.find((f) => f.texto === 'Projeto')!;
    const filhos = procs.filter((f) => f !== pai).sort((a, b) => a.x - b.x);
    expect(new Set(filhos.map((f) => f.y)).size).toBe(1);
    expect(filhos[0].y).toBeGreaterThan(pai.y + pai.h);
    const centroFilhos = (filhos[0].x + filhos[2].x + filhos[2].w) / 2;
    expect(pai.x + pai.w / 2).toBeCloseTo(centroFilhos, 0);
    for (let i = 1; i < filhos.length; i++) expect(filhos[i].x).toBeGreaterThanOrEqual(filhos[i - 1].x + filhos[i - 1].w);
    const barra = r.doc.formas.find((f) => f.kind === 'eapBarraLigacao')!;
    expect(barra.h).toBe(10);
    expect(r.doc.ligacoes.filter((l) => l.kind === 'eapLigacao')).toHaveLength(4);
  });

  it('vertical: filhos empilhados à direita da barra', () => {
    const d = diagramaVazio('eap', 'E');
    const r = construirEap(d, { principal: 'Raiz', processos: 'A\nB', organizacao: 'vertical', x: 40, y: 40 });
    const filhos = r.doc.formas.filter((f) => f.kind === 'eapProcesso' && f.texto !== 'Raiz').sort((a, b) => a.y - b.y);
    const barra = r.doc.formas.find((f) => f.kind === 'eapBarraLigacao')!;
    expect(barra.w).toBe(10);
    expect(filhos[0].x).toBeGreaterThan(barra.x + barra.w);
    expect(filhos[1].y).toBeGreaterThan(filhos[0].y + filhos[0].h);
    expect(filhos[0].x).toBe(filhos[1].x);
  });

  it('sub-processos ganham barra própria e a organização completa não sobrepõe irmãos', () => {
    const d = diagramaVazio('eap', 'E');
    const r = construirEap(d, { principal: 'P', processos: 'A\n  A1\n  A2\nB', organizacao: 'horizontal-centro', x: 300, y: 20 });
    expect(barrasDaEap(r.doc)).toHaveLength(2);
    const procs = r.doc.formas.filter((f) => f.kind === 'eapProcesso');
    for (let i = 0; i < procs.length; i++) for (let j = i + 1; j < procs.length; j++) {
      const a = procs[i]; const b = procs[j];
      const sobrepoe = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(sobrepoe).toBe(false);
    }
    //# reorganizar de novo não muda nada (idempotente)
    const de = organizarEapCompleto(r.doc);
    expect(de.formas.map((f) => [f.x, f.y])).toEqual(r.doc.formas.map((f) => [f.x, f.y]));
    const primeira = barrasDaEap(r.doc)[0];
    expect(organizarBarraEap(r.doc, primeira.id).formas).toHaveLength(r.doc.formas.length);
  });
});
