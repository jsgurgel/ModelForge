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

import { beforeEach, describe, expect, it } from 'vitest';
import { adicionarForma, novaForma, novaLigacao } from './ops';
import {
  abaAtiva, colarArea, copiarSelecao, desfazer, fecharTodas, marcarSalvo, mutar, novoDiagrama, obterEstado, preservarDaAtual, refazer, registrarCantoVisivel,
  selecionar, setFerramenta, setMensagem,
} from './store';
import { passoDeTab, TECLAS_NATIVAS } from './atalhos';
import { percorrer, zoom } from './comandos';
import { diagramaVazio } from './types';

const comDuasFormas = () => {
  fecharTodas();
  novoDiagrama('conceitual');
  mutar((d) => {
    let n = adicionarForma(d, { ...novaForma(d, 'entidade', 300, 200), id: 'A' });
    n = adicionarForma(n, { ...novaForma(n, 'relacionamento', 600, 200), id: 'B' });
    return novaLigacao(n, 'linha', 'A', 'B');
  });
};

beforeEach(() => { fecharTodas(); });

describe('histórico: desfazer/refazer não mexem no zoom, no nome nem no id', () => {
  it('preserva os campos da visão', () => {
    const a = { ...diagramaVazio('livre', 'x'), zoom: 2, id: 'srv' };
    const b = { ...diagramaVazio('livre', 'antigo'), zoom: 0.5 };
    expect(preservarDaAtual(b, a)).toMatchObject({ zoom: 2, nome: 'x', id: 'srv' });
    expect(preservarDaAtual(a, a)).toBe(a);
  });
  it('desfazer depois de mudar o zoom mantém o zoom; refazer também', () => {
    comDuasFormas();
    zoom('mais');
    const z = abaAtiva()!.doc.zoom;
    expect(z).toBe(1.05);
    mutar((d) => adicionarForma(d, { ...novaForma(d, 'entidade', 100, 100), id: 'C' }));
    desfazer();
    expect(abaAtiva()!.doc.formas.map((f) => f.id)).toEqual(['A', 'B']);
    expect(abaAtiva()!.doc.zoom).toBe(1.05);
    refazer();
    expect(abaAtiva()!.doc.formas.map((f) => f.id)).toEqual(['A', 'B', 'C']);
    expect(abaAtiva()!.doc.zoom).toBe(1.05);
  });
  it('desfazer depois de salvar não perde o id do servidor', () => {
    comDuasFormas();
    mutar((d) => adicionarForma(d, { ...novaForma(d, 'entidade', 100, 100), id: 'C' }));
    marcarSalvo(0, { ...abaAtiva()!.doc, id: 'srv-1' });
    mutar((d) => adicionarForma(d, { ...novaForma(d, 'entidade', 150, 150), id: 'D' }));
    desfazer();
    desfazer();
    expect(abaAtiva()!.doc.id).toBe('srv-1');
  });
  it('guarda até 500 passos', () => {
    comDuasFormas();
    for (let i = 0; i < 520; i++) mutar((d) => ({ ...d, autores: String(i) }));
    expect(abaAtiva()!.passado.length).toBe(500);
  });
});

describe('zoom por passos', () => {
  it('mais e menos usam os passos e definem valores diretos (limitados)', () => {
    comDuasFormas();
    zoom('mais'); expect(abaAtiva()!.doc.zoom).toBe(1.05);
    zoom('menos'); zoom('menos'); expect(abaAtiva()!.doc.zoom).toBe(0.95);
    zoom(0.05); expect(abaAtiva()!.doc.zoom).toBe(0.05);
    zoom('menos'); expect(abaAtiva()!.doc.zoom).toBe(0.05);
    zoom(99); expect(abaAtiva()!.doc.zoom).toBe(5);
    zoom('reset'); expect(abaAtiva()!.doc.zoom).toBe(1);
  });
  it('zoom não entra no histórico', () => {
    comDuasFormas();
    const antes = abaAtiva()!.passado.length;
    zoom('mais');
    expect(abaAtiva()!.passado.length).toBe(antes);
  });
});

describe('copiar e colar', () => {
  it('cola no canto visível e seleciona formas e linhas', () => {
    comDuasFormas();
    selecionar(['A', 'B']);
    expect(copiarSelecao()).toBe(true);
    const soltar = registrarCantoVisivel(() => ({ x: 1000, y: 800 }));
    expect(colarArea()).toBe(true);
    soltar();
    const doc = abaAtiva()!.doc;
    const novas = doc.formas.filter((f) => !['A', 'B'].includes(f.id));
    expect(novas).toHaveLength(2);
    expect(Math.min(...novas.map((f) => f.x))).toBe(1004);
    expect(Math.min(...novas.map((f) => f.y))).toBe(804);
    const sel = abaAtiva()!.selecao;
    expect(sel).toHaveLength(3);
    expect(doc.ligacoes).toHaveLength(2);
    expect(sel.some((id) => doc.ligacoes.some((l) => l.id === id))).toBe(true);
  });
  it('não cola formas de tipo estranho ao diagrama de destino', () => {
    comDuasFormas();
    selecionar(['A', 'B']);
    copiarSelecao();
    novoDiagrama('fluxo');
    expect(colarArea()).toBe(false);
    expect(abaAtiva()!.doc.formas).toHaveLength(0);
    expect(obterEstado().mensagem).toContain('não existem neste tipo de diagrama');
  });
});

describe('barra de status ao armar a ferramenta', () => {
  it('mostra a descrição e a remove ao desarmar', () => {
    comDuasFormas();
    setFerramenta({ tipo: 'forma', kind: 'entidade' });
    expect(obterEstado().mensagem).toBe('Cria nova entidade');
    setFerramenta(null);
    expect(obterEstado().mensagem).toBe('');
  });
  it('não apaga outras mensagens ao desarmar', () => {
    comDuasFormas();
    setFerramenta({ tipo: 'apagar', kind: 'apagar' });
    expect(obterEstado().mensagem).toBe('Clique no objeto a ser apagado');
    setMensagem('Outra coisa');
    setFerramenta(null);
    expect(obterEstado().mensagem).toBe('Outra coisa');
  });
});

describe('Ctrl+Tab', () => {
  it('reconhece as teclas e percorre formas e linhas sem dar volta com várias selecionadas', () => {
    expect(passoDeTab('ctrl+tab')).toBe(1);
    expect(passoDeTab('ctrl+shift+tab')).toBe(-1);
    expect(passoDeTab('tab')).toBe(0);
    comDuasFormas();
    selecionar(['A']);
    percorrer(1);
    expect(abaAtiva()!.selecao).toEqual(['B']);
    percorrer(1);
    expect(abaAtiva()!.selecao).toEqual([abaAtiva()!.doc.ligacoes[0].id]);
    percorrer(1);
    expect(abaAtiva()!.selecao).toEqual(['A']);
    percorrer(-1);
    expect(abaAtiva()!.selecao).toEqual([abaAtiva()!.doc.ligacoes[0].id]);
    selecionar(['A', 'B']);
    percorrer(1);
    expect(abaAtiva()!.selecao).toEqual(['A', 'B']);
  });
  it('copiar/recortar/colar ficam por conta dos eventos nativos', () => {
    expect([...TECLAS_NATIVAS].sort()).toEqual(['ctrl+c', 'ctrl+v', 'ctrl+x']);
  });
});
