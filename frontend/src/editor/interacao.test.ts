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
  MARGEM_COLAGEM, PREFIXO_AREA, ZOOMS, adicionarAreaRaia, alcaDaDivisoria, alternarNaSelecao, colarNoCanto, decidirColagem, descricaoDaFerramenta,
  divisoriaNoPonto, divisoriasDaRaia, filtrarParaTipo, formaDeImagem, lerCargaArea, ligacoesNaCaixa, nomeDeArea, removerAreaRaia, rotuloZoom,
  segmentoTocaCaixa, selecaoDaCaixa, serializarArea, subDiagramaDaSelecao, teclaDeTexto, textoAoDigitar, vizinhoNaSelecao, zoomMais, zoomMenos, aceitaDigitar,
} from './interacao';
import { adicionarForma, novaForma, novaLigacao } from './ops';
import { diagramaVazio } from './types';

const ev = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods });

describe('zoom por passos', () => {
  it('lista os 12 passos de 12,5% a 500%', () => {
    expect(ZOOMS[0]).toBe(0.05);
    expect(ZOOMS[ZOOMS.length - 1]).toBe(5);
    expect(ZOOMS).toContain(1);
    expect(ZOOMS.every((z, i) => i === 0 || Math.abs(z - ZOOMS[i - 1] - 0.05) < 1e-9)).toBe(true);
  });
  it('mais/menos andam de passo em passo e param nas pontas', () => {
    expect(zoomMais(1)).toBe(1.05);
    expect(zoomMenos(1)).toBe(0.95);
    expect(zoomMais(5)).toBe(5);
    expect(zoomMenos(0.05)).toBe(0.05);
    expect(zoomMais(2)).toBe(2.05);
  });
  it('valores fora dos passos (zoom arredondado do arquivo) encontram o vizinho', () => {
    expect(zoomMais(0.12)).toBe(0.15);
    expect(zoomMenos(0.12)).toBe(0.1);
    expect(zoomMais(1.12)).toBe(1.15);
    expect(zoomMenos(1.12)).toBe(1.1);
  });
  it('rótulo com uma casa decimal', () => {
    expect(rotuloZoom(1)).toBe('100.0%');
    expect(rotuloZoom(0.125)).toBe('12.5%');
    expect(rotuloZoom(5)).toBe('500.0%');
  });
});

describe('digitar sobre a forma selecionada', () => {
  it('letras, dígitos e símbolos iniciam a edição', () => {
    expect(teclaDeTexto(ev('a'))).toBe('a');
    expect(teclaDeTexto(ev('Ç'))).toBe('Ç');
    expect(teclaDeTexto(ev('7'))).toBe('7');
    expect(teclaDeTexto(ev(' '))).toBe(' ');
    expect(teclaDeTexto(ev('_'))).toBe('_');
    expect(teclaDeTexto(ev('§'))).toBe('§');
  });
  it('teclas de controle e atalhos não iniciam', () => {
    expect(teclaDeTexto(ev('Enter'))).toBeNull();
    expect(teclaDeTexto(ev('Delete'))).toBeNull();
    expect(teclaDeTexto(ev('F2'))).toBeNull();
    expect(teclaDeTexto(ev('c', { ctrlKey: true }))).toBeNull();
    expect(teclaDeTexto(ev('a', { altKey: true }))).toBeNull();
    expect(teclaDeTexto(ev('a', { metaKey: true }))).toBeNull();
  });
  it('AltGr (Ctrl+Alt) produz caractere', () => {
    expect(teclaDeTexto(ev('@', { ctrlKey: true, altKey: true }))).toBe('@');
  });
  it('"Reescrever ao digitar" apaga o texto anterior', () => {
    expect(textoAoDigitar('Entidade_1', 'x', true)).toBe('x');
    expect(textoAoDigitar('Entidade_1', 'x', false)).toBe('Entidade_1x');
  });
  it('tabela, coleção e imagem não abrem o editor inline', () => {
    const d = diagramaVazio('logico', 't');
    expect(aceitaDigitar(novaForma(d, 'tabela', 50, 50))).toBe(false);
    expect(aceitaDigitar(novaForma(d, 'visao', 50, 50))).toBe(true);
    expect(aceitaDigitar(undefined)).toBe(false);
  });
});

describe('Ctrl+Tab', () => {
  const ordem = ['a', 'b', 'c'];
  it('vai ao próximo e ao anterior, dando a volta com um item só selecionado', () => {
    expect(vizinhoNaSelecao(ordem, ['a'], 1)).toBe('b');
    expect(vizinhoNaSelecao(ordem, ['c'], 1)).toBe('a');
    expect(vizinhoNaSelecao(ordem, ['a'], -1)).toBe('c');
  });
  it('sem seleção, com várias ou com um único item não faz nada', () => {
    expect(vizinhoNaSelecao(ordem, [], 1)).toBeNull();
    expect(vizinhoNaSelecao(ordem, ['a', 'b'], 1)).toBeNull();
    expect(vizinhoNaSelecao(['a'], ['a'], 1)).toBeNull();
  });
});

describe('caixa de seleção com linhas', () => {
  const montar = () => {
    let d = diagramaVazio('conceitual', 't');
    const a = { ...novaForma(d, 'entidade', 100, 100), id: 'A' };
    d = adicionarForma(d, a);
    const b = { ...novaForma(d, 'relacionamento', 400, 100), id: 'B' };
    d = adicionarForma(d, b);
    d = novaLigacao(d, 'linha', 'A', 'B');
    return d;
  };
  it('segmento toca a caixa', () => {
    const c = { x: 10, y: 10, w: 10, h: 10 };
    expect(segmentoTocaCaixa({ x: 0, y: 15 }, { x: 30, y: 15 }, c)).toBe(true);
    expect(segmentoTocaCaixa({ x: 0, y: 0 }, { x: 30, y: 5 }, c)).toBe(false);
    expect(segmentoTocaCaixa({ x: 12, y: 12 }, { x: 14, y: 14 }, c)).toBe(true);
  });
  it('a caixa no meio da linha (sem tocar as formas) seleciona a linha', () => {
    const d = montar();
    const meio = { x: 250, y: 90, w: 20, h: 30 };
    expect(ligacoesNaCaixa(d, meio)).toEqual([d.ligacoes[0].id]);
    expect(selecaoDaCaixa(d, meio, [], false)).toEqual([d.ligacoes[0].id]);
  });
  it('caixa sobre as formas também leva as linhas; aditivo soma à seleção', () => {
    const d = montar();
    const tudo = selecaoDaCaixa(d, { x: 0, y: 0, w: 800, h: 300 }, [], false);
    expect(new Set(tudo)).toEqual(new Set(['A', 'B', d.ligacoes[0].id]));
    expect(selecaoDaCaixa(d, { x: 0, y: 0, w: 20, h: 20 }, ['A'], true)).toEqual(['A']);
    expect(selecaoDaCaixa(d, { x: 0, y: 0, w: 20, h: 20 }, ['A'], false)).toEqual([]);
  });
  it('Ctrl/Shift+clique alterna, sem eles só seleciona', () => {
    expect(alternarNaSelecao(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(alternarNaSelecao(['a', 'b'], 'b', true)).toEqual(['a']);
    expect(alternarNaSelecao(['a', 'b'], 'b', false)).toEqual(['a', 'b']);
    expect(alternarNaSelecao(['a'], 'b', false)).toEqual(['b']);
  });
});

describe('regiões da raia', () => {
  const raia = () => {
    const d = diagramaVazio('atividade', 't');
    return { ...novaForma(d, 'raiaAtividade', 400, 300), x: 100, y: 50, w: 600, h: 500 };
  };
  it('duplo clique adiciona região com largura max(w/(n+2), 20) e nome livre', () => {
    let r = adicionarAreaRaia(raia());
    expect(r.props.areas).toEqual([{ texto: 'Área_1', largura: 300 }]);
    r = adicionarAreaRaia(r);
    expect((r.props.areas as { largura: number }[])[1].largura).toBe(200);
    expect(nomeDeArea(r)).toBe('Área_3');
  });
  it('nome pula os já usados, inclusive a área padrão', () => {
    const r = { ...raia(), props: { ...raia().props, areaPadrao: 'Área_1' } };
    expect(nomeDeArea(r)).toBe('Área_2');
  });
  it('remove a região pelo índice', () => {
    let r = adicionarAreaRaia(adicionarAreaRaia(raia()));
    r = removerAreaRaia(r, 0);
    expect((r.props.areas as { texto: string }[]).map((a) => a.texto)).toEqual(['Área_2']);
    expect(removerAreaRaia(r, 5)).toBe(r);
  });
  it('acerta a alça da divisória pela geometria do DimensionadorArea', () => {
    const r = adicionarAreaRaia(raia());
    expect(divisoriasDaRaia(r)).toEqual([300]);
    const alca = alcaDaDivisoria(r, 0, 12)!;
    expect(alca.w).toBe(8);
    expect(alca.h).toBe(32);
    expect(divisoriaNoPonto(r, { x: alca.x + 4, y: alca.y + 16 }, 12)).toBe(0);
    expect(divisoriaNoPonto(r, { x: alca.x + 40, y: alca.y + 16 }, 12)).toBe(-1);
    expect(divisoriaNoPonto(r, { x: alca.x + 4, y: alca.y - 40 }, 12)).toBe(-1);
  });
  it('divisória além da largura da raia é ignorada', () => {
    const r = { ...raia(), props: { areas: [{ texto: 'x', largura: 9999 }] } };
    expect(divisoriasDaRaia(r)).toEqual([]);
  });
});

describe('área de transferência do sistema', () => {
  const doc = () => {
    let d = diagramaVazio('conceitual', 't');
    d = adicionarForma(d, { ...novaForma(d, 'entidade', 300, 200), id: 'A' });
    d = adicionarForma(d, { ...novaForma(d, 'relacionamento', 600, 200), id: 'B' });
    d = novaLigacao(d, 'linha', 'A', 'B');
    d = { ...d, ligacoes: d.ligacoes.map((l) => ({ ...l, props: { ...l.props, pontos: [{ x: 450, y: 250 }] } })) };
    return d;
  };
  const area = (d: ReturnType<typeof doc>) => ({ formas: d.formas, ligacoes: d.ligacoes });

  it('vai e volta pelo texto com prefixo mágico', () => {
    const d = doc();
    const t = serializarArea(area(d), 'conceitual');
    expect(t.startsWith(PREFIXO_AREA)).toBe(true);
    const c = lerCargaArea(t)!;
    expect(c.tipo).toBe('conceitual');
    expect(c.area.formas.map((f) => f.id)).toEqual(['A', 'B']);
    expect(c.area.ligacoes).toHaveLength(1);
  });
  it('rejeita texto alheio, JSON quebrado e cargas inválidas', () => {
    expect(lerCargaArea('olá')).toBeNull();
    expect(lerCargaArea(`${PREFIXO_AREA}{nao json`)).toBeNull();
    expect(lerCargaArea(`${PREFIXO_AREA}{"formas":[{"id":"x","kind":"naoexiste","x":0,"y":0,"w":1,"h":1,"texto":"","props":{}}]}`)).toBeNull();
    expect(lerCargaArea(`${PREFIXO_AREA}[]`)).toBeNull();
    expect(lerCargaArea(null)).toBeNull();
  });
  it('descarta ligações órfãs e formas inválidas', () => {
    const d = doc();
    const t = serializarArea({ formas: [d.formas[0]], ligacoes: d.ligacoes }, 'conceitual');
    const c = lerCargaArea(t)!;
    expect(c.area.formas).toHaveLength(1);
    expect(c.area.ligacoes).toHaveLength(0);
  });
  it('decide: texto do ModelForge, depois imagem, depois memória', () => {
    const d = doc();
    const t = serializarArea(area(d), 'conceitual');
    expect(decidirColagem({ texto: t, temImagem: true, memoria: true }).tipo).toBe('area');
    expect(decidirColagem({ texto: '', temImagem: true, memoria: true }).tipo).toBe('imagem');
    expect(decidirColagem({ texto: '', temImagem: false, memoria: true }).tipo).toBe('memoria');
    expect(decidirColagem({ texto: undefined, temImagem: false, memoria: false }).tipo).toBe('nada');
    expect(decidirColagem({ texto: 'texto qualquer', temImagem: false, memoria: true }).tipo).toBe('nada');
  });
  it('descarta o que não existe no tipo do diagrama de destino', () => {
    const c = lerCargaArea(serializarArea(area(doc()), 'conceitual'))!;
    expect(filtrarParaTipo(c, 'conceitual').descartados).toBe(0);
    const r = filtrarParaTipo(c, 'fluxo');
    expect(r.descartados).toBe(2);
    expect(r.area.ligacoes).toHaveLength(0);
    expect(filtrarParaTipo({ ...c, tipo: undefined }, 'conceitual').descartados).toBe(0);
  });
  it('cola no canto visível, move os pontos de dobra e seleciona formas e linhas', () => {
    const d = doc();
    let destino = diagramaVazio('conceitual', 'x');
    const r = colarNoCanto(destino, area(d), { x: 500, y: 300 });
    destino = r.doc;
    const menorX = Math.min(...destino.formas.map((f) => f.x));
    const menorY = Math.min(...destino.formas.map((f) => f.y));
    expect(menorX).toBe(500 + MARGEM_COLAGEM);
    expect(menorY).toBe(300 + MARGEM_COLAGEM);
    expect(r.ids).toHaveLength(3);
    expect(r.ids).toContain(destino.ligacoes[0].id);
    const orig = d.formas[0];
    const dx = destino.formas[0].x - orig.x;
    const dy = destino.formas[0].y - orig.y;
    expect(destino.ligacoes[0].props.pontos).toEqual([{ x: 450 + dx, y: 250 + dy }]);
    expect(destino.formas.every((f) => !['A', 'B'].includes(f.id))).toBe(true);
  });
  it('colar sem formas não muda nada', () => {
    const d = doc();
    expect(colarNoCanto(d, { formas: [], ligacoes: [] }, { x: 0, y: 0 }).doc).toBe(d);
  });
  it('imagem colada vira forma Imagem no canto visível com o tamanho natural', () => {
    const d = diagramaVazio('livre', 't');
    const r = formaDeImagem(d, 'data:image/png;base64,AAAA', 320, 200, { x: 40, y: 60 });
    const f = r.doc.formas[0];
    expect(f.kind).toBe('desenhador');
    expect([f.x, f.y, f.w, f.h]).toEqual([44, 64, 320, 200]);
    expect(f.props).toMatchObject({ tipoDesenho: 'imagem', src: 'data:image/png;base64,AAAA', imgW: 320, imgH: 200 });
  });
  it('sub-diagrama da seleção mantém só as formas selecionadas e as linhas entre elas', () => {
    const d = doc();
    const so = subDiagramaDaSelecao(d, ['A']);
    expect(so.formas.map((f) => f.id)).toEqual(['A']);
    expect(so.ligacoes).toHaveLength(0);
    expect(subDiagramaDaSelecao(d, ['A', 'B']).ligacoes).toHaveLength(1);
  });
});

describe('mensagem ao armar a ferramenta', () => {
  it('usa o texto e vazio para desconhecidos', () => {
    expect(descricaoDaFerramenta('entidade')).toBe('Cria nova entidade');
    expect(descricaoDaFerramenta('apagar')).toBe('Clique no objeto a ser apagado');
    expect(descricaoDaFerramenta('nada')).toBe('');
  });
});
