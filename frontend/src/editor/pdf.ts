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

/**
 * Geração de PDF sem dependências: cada página é uma imagem JPEG (a rasterização do diagrama) posicionada na página.
 * Também contém a matemática de paginação usada pela pré-visualização de impressão.
 */

export type Papel = 'A4' | 'A3' | 'Carta';
export type Orientacao = 'retrato' | 'paisagem';

/** Dimensões em milímetros (retrato). */
export const PAPEIS_MM: Record<Papel, [number, number]> = { A4: [210, 297], A3: [297, 420], Carta: [215.9, 279.4] };
export const PAPEIS: { valor: Papel; rotulo: string }[] = [
  { valor: 'A4', rotulo: 'A4 (210 × 297 mm)' },
  { valor: 'A3', rotulo: 'A3 (297 × 420 mm)' },
  { valor: 'Carta', rotulo: 'Carta (215,9 × 279,4 mm)' },
];

export interface ConfigPagina {
  papel: Papel;
  orientacao: Orientacao;
  margemMm: number;
  /** Percentual (10..400) ou 'ajustar' para caber em uma página. */
  escala: number | 'ajustar';
  /** fmImpressao "Proporcional" (padrão ligado): escala pela configuração. Desligado: usa Colunas x Linhas. */
  proporcional?: boolean;
  /** Colunas/linhas de páginas quando `proporcional === false` (fmImpressao: Colunas/Linhas). */
  colunas?: number;
  linhas?: number;
}

export const CONFIG_PADRAO: ConfigPagina = { papel: 'A4', orientacao: 'paisagem', margemMm: 10, escala: 'ajustar' };

/** Milímetros por pixel de tela (96 dpi). */
export const MM_POR_PX = 25.4 / 96;
export const PT_POR_MM = 72 / 25.4;

export function tamanhoDaPaginaMm(c: ConfigPagina): { w: number; h: number } {
  const [a, b] = PAPEIS_MM[c.papel];
  return c.orientacao === 'retrato' ? { w: a, h: b } : { w: b, h: a };
}

export function areaUtilMm(c: ConfigPagina): { w: number; h: number } {
  const p = tamanhoDaPaginaMm(c);
  const m = Math.max(0, Math.min(c.margemMm, Math.min(p.w, p.h) / 2 - 5));
  return { w: p.w - 2 * m, h: p.h - 2 * m };
}

export interface PaginaImpressao {
  col: number;
  row: number;
  /** Recorte no conteúdo, em pixels de tela. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlanoDePaginas {
  /** Escala efetiva (1 = 100%). */
  escala: number;
  cols: number;
  rows: number;
  paginas: PaginaImpressao[];
  /** Lado de cada recorte (px de tela) e área útil (mm). */
  recorteW: number;
  recorteH: number;
}

/** Divide o conteúdo (px de tela) em páginas segundo a escala e a área útil do papel. */
export function dividirEmPaginas(conteudoW: number, conteudoH: number, c: ConfigPagina): PlanoDePaginas {
  const area = areaUtilMm(c);
  const cw = Math.max(1, conteudoW);
  const ch = Math.max(1, conteudoH);
  let escala: number;
  const fixo = c.proporcional === false && (c.colunas ?? 0) > 0 && (c.linhas ?? 0) > 0;
  if (fixo) {
    //# Colunas x Linhas escolhidas: a escala (uniforme) faz o conteúdo caber exatamente nessa grade de páginas.
    escala = Math.min(4, (c.colunas! * area.w) / (cw * MM_POR_PX), (c.linhas! * area.h) / (ch * MM_POR_PX));
  } else if (c.escala === 'ajustar') escala = Math.min(1, area.w / (cw * MM_POR_PX), area.h / (ch * MM_POR_PX));
  else escala = Math.min(4, Math.max(0.1, c.escala / 100));
  const recorteW = area.w / (MM_POR_PX * escala);
  const recorteH = area.h / (MM_POR_PX * escala);
  const cols = fixo ? Math.floor(c.colunas!) : Math.max(1, Math.ceil(cw / recorteW - 1e-9));
  const rows = fixo ? Math.floor(c.linhas!) : Math.max(1, Math.ceil(ch / recorteH - 1e-9));
  const paginas: PaginaImpressao[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * recorteW;
      const y = row * recorteH;
      paginas.push({ col, row, x, y, w: Math.max(0, Math.min(recorteW, cw - x)), h: Math.max(0, Math.min(recorteH, ch - y)) });
    }
  }
  return { escala, cols, rows, paginas, recorteW, recorteH };
}

// ---------------------------------------------------------------------------- PDF

export interface ImagemNaPagina {
  jpeg: Uint8Array;
  /** Tamanho da imagem em pixels. */
  pxW: number;
  pxH: number;
  /** Posição e tamanho em pontos (origem no canto superior esquerdo da página). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PaginaPdf {
  /** Tamanho da página em pontos. */
  w: number;
  h: number;
  imagens: ImagemNaPagina[];
}

const enc = new TextEncoder();
const n2 = (v: number) => (Math.round(v * 100) / 100).toString();

/** Monta um PDF 1.4 com uma imagem JPEG (DCTDecode) por página. */
export function gerarPdf(paginas: PaginaPdf[], titulo = 'ModelForge'): Uint8Array {
  const partes: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (b: Uint8Array | string) => {
    const u = typeof b === 'string' ? enc.encode(b) : b;
    partes.push(u);
    pos += u.length;
  };
  const obj = (num: number, corpo: Uint8Array | string, dict?: string) => {
    offsets[num] = pos;
    push(`${num} 0 obj\n`);
    if (dict !== undefined) {
      push(`<< ${dict} /Length ${typeof corpo === 'string' ? enc.encode(corpo).length : corpo.length} >>\nstream\n`);
      push(corpo);
      push('\nendstream\nendobj\n');
    } else {
      push(corpo);
      push('\nendobj\n');
    }
  };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  //# Numeração: 1 catálogo, 2 páginas, 3 info; depois, por página: página, conteúdo e as imagens.
  let prox = 4;
  const idsPagina: number[] = [];
  const trabalho: { pagina: number; conteudo: number; imagens: number[] }[] = [];
  for (const p of paginas) {
    const pagina = prox++;
    const conteudo = prox++;
    const imagens = p.imagens.map(() => prox++);
    idsPagina.push(pagina);
    trabalho.push({ pagina, conteudo, imagens });
  }
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${idsPagina.map((i) => `${i} 0 R`).join(' ')}] /Count ${paginas.length} >>`);
  const tituloPdf = titulo.replace(/[^\x20-\x7E]/g, '?').replace(/[()\\]/g, '');
  obj(3, `<< /Title (${tituloPdf}) /Producer (ModelForge) >>`);
  paginas.forEach((p, i) => {
    const t = trabalho[i];
    const recursos = p.imagens.map((_, k) => `/Im${k} ${t.imagens[k]} 0 R`).join(' ');
    obj(t.pagina, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(p.w)} ${n2(p.h)}] /Contents ${t.conteudo} 0 R /Resources << /XObject << ${recursos} >> >> >>`);
    const ops = p.imagens.map((im, k) => `q ${n2(im.w)} 0 0 ${n2(im.h)} ${n2(im.x)} ${n2(p.h - im.y - im.h)} cm /Im${k} Do Q`).join('\n');
    obj(t.conteudo, ops, '');
    p.imagens.forEach((im, k) => {
      obj(t.imagens[k], im.jpeg, `/Type /XObject /Subtype /Image /Width ${im.pxW} /Height ${im.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`);
    });
  });
  const xref = pos;
  const total = prox;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const saida = new Uint8Array(pos);
  let o = 0;
  for (const b of partes) { saida.set(b, o); o += b.length; }
  return saida;
}

/** Decodifica o base64 de um data URL de imagem. */
export function bytesDeDataUrl(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
