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
import { PASSOS_ZOOM, indiceDoZoom, normalizarConfig, CONFIG_PADRAO } from '../editor/config';
import { rotuloDoNome, temDicionario } from './inspetorBase';
import { coresDeLegendas, estiloDaFonte, fonteValida, normalizarCor, nomesDeFonte, PALETA_CORES } from './fontesCores';
import { Diagrama } from '../editor/types';

describe('linhas-base do Inspector', () => {
  it('rótulos Nome/Texto/Nome-Texto e Dicionário', () => {
    expect(rotuloDoNome('entidade')).toBe('Nome');
    expect(rotuloDoNome('texto')).toBe('Texto');
    expect(rotuloDoNome('livreRetangulo')).toBe('Nome/Texto');
    expect(rotuloDoNome('eapProcesso')).toBe('Nome/Texto');
    expect(temDicionario('texto')).toBe(false);
    expect(temDicionario('legenda')).toBe(false);
    expect(temDicionario('entidade')).toBe(true);
  });
  it('padrões de cfg', () => {
    expect(CONFIG_PADRAO.mostrarGrade).toBe(false);
    expect(CONFIG_PADRAO.intervaloAutosave).toBe(5);
    expect(normalizarConfig({ intervaloAutosave: 99 }).intervaloAutosave).toBe(29);
  });
  it('passos de zoom', () => {
    expect(PASSOS_ZOOM[0]).toBe(0.05);
    expect(PASSOS_ZOOM[PASSOS_ZOOM.length - 1]).toBe(5);
    expect(indiceDoZoom(1)).toBe(19);
    expect(indiceDoZoom(0.5)).toBe(9);
    expect(indiceDoZoom(0.9)).toBe(17);
  });
});

describe('seletores de fonte e cor', () => {
  it('fonte válida e estilos', () => {
    const pad = { nome: 'Arial', tamanho: 12, negrito: false, italico: false };
    expect(fonteValida({ nome: ' ', tamanho: 0, negrito: true, italico: false }, pad)).toEqual({ nome: 'Arial', tamanho: 12, negrito: true, italico: false });
    expect(fonteValida({ nome: 'X', tamanho: 999, negrito: false, italico: false }, pad).tamanho).toBe(200);
    expect(estiloDaFonte(true, true)).toBe('Negrito itálico');
    expect(nomesDeFonte('Zzz')[0]).toBe('Zzz');
  });
  it('cores', () => {
    expect(normalizarCor('#ABC')).toBe('#aabbcc');
    expect(normalizarCor('')).toBe('');
    expect(normalizarCor('red')).toBe('');
    expect(PALETA_CORES.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    const doc = { formas: [{ kind: 'legenda', props: { tipoLegenda: 'cores', itens: [{ texto: 'a', cor: '#ff0000', tag: 0 }, { texto: 'b', cor: '#FF0000', tag: 0 }] } }] } as unknown as Diagrama;
    expect(coresDeLegendas(doc)).toHaveLength(1);
  });
});
