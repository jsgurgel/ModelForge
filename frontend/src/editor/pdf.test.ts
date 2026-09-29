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
import { codificarBmp } from './bmp';
import { CONFIG_PADRAO, MM_POR_PX, areaUtilMm, dividirEmPaginas, gerarPdf, tamanhoDaPaginaMm } from './pdf';

describe('paginação', () => {
  it('orientação e margem definem a área útil', () => {
    const c = { ...CONFIG_PADRAO, papel: 'A4' as const, orientacao: 'retrato' as const, margemMm: 10 };
    expect(tamanhoDaPaginaMm(c)).toEqual({ w: 210, h: 297 });
    expect(areaUtilMm(c)).toEqual({ w: 190, h: 277 });
    expect(tamanhoDaPaginaMm({ ...c, orientacao: 'paisagem' })).toEqual({ w: 297, h: 210 });
  });

  it('ajustar cabe em uma página; 100% de um diagrama grande divide em várias', () => {
    const uma = dividirEmPaginas(3000, 2000, { ...CONFIG_PADRAO, escala: 'ajustar' });
    expect(uma.paginas).toHaveLength(1);
    expect(uma.escala).toBeLessThan(1);
    const varias = dividirEmPaginas(3000, 2000, { ...CONFIG_PADRAO, escala: 100 });
    expect(varias.cols).toBeGreaterThan(1);
    expect(varias.rows).toBeGreaterThan(1);
    expect(varias.paginas).toHaveLength(varias.cols * varias.rows);
    const ultimo = varias.paginas[varias.paginas.length - 1];
    expect(ultimo.x + ultimo.w).toBeCloseTo(3000);
    expect(ultimo.y + ultimo.h).toBeCloseTo(2000);
  });

  it('conteúdo pequeno a 100% fica numa página só', () => {
    const p = dividirEmPaginas(400, 300, { ...CONFIG_PADRAO, escala: 100 });
    expect(p.paginas).toHaveLength(1);
    expect(p.recorteW * MM_POR_PX).toBeCloseTo(areaUtilMm(CONFIG_PADRAO).w);
  });
});

describe('formatos', () => {
  it('PDF tem estrutura válida (xref aponta para os objetos)', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = gerarPdf([{ w: 595, h: 842, imagens: [{ jpeg, pxW: 10, pxH: 10, x: 28, y: 28, w: 100, h: 100 }] }, { w: 595, h: 842, imagens: [] }], 'Modelo é ótimo');
    const txt = new TextDecoder('latin1').decode(pdf);
    expect(txt.startsWith('%PDF-1.4')).toBe(true);
    expect(txt.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(txt).toContain('/Count 2');
    expect(txt).toContain('/Filter /DCTDecode');
    const pos = Number(/startxref\n(\d+)/.exec(txt)![1]);
    expect(txt.slice(pos, pos + 4)).toBe('xref');
    const linhas = txt.slice(pos).split('\n');
    const off1 = Number(linhas[3].slice(0, 10));
    expect(txt.slice(off1, off1 + 7)).toBe('1 0 obj');
  });

  it('BMP 24 bits: cabeçalho, tamanho e cores em BGR (alfa sobre branco)', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 255, 255, 0, 255, 0, 255]);
    const bmp = codificarBmp(2, 2, rgba);
    expect(String.fromCharCode(bmp[0], bmp[1])).toBe('BM');
    expect(bmp.length).toBe(54 + 8 * 2);
    //# última linha da imagem (y=1) vem primeiro; pixel (0,1) é azul => BGR = 255,0,0
    expect([bmp[54], bmp[55], bmp[56]]).toEqual([255, 0, 0]);
    //# pixel (1,0) transparente vira branco
    const linha0 = 54 + 8;
    expect([bmp[linha0 + 3], bmp[linha0 + 4], bmp[linha0 + 5]]).toEqual([255, 255, 255]);
  });
});
