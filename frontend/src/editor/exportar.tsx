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

import { renderToStaticMarkup } from 'react-dom/server';
import { FormaSvg, LigacaoSvg } from '../shapes/render';
import { FORMAS } from '../shapes/registry';
import { codificarBmp } from './bmp';
import { CONFIG_PADRAO, ConfigPagina, PT_POR_MM, areaUtilMm, bytesDeDataUrl, dividirEmPaginas, gerarPdf, tamanhoDaPaginaMm } from './pdf';
import { pontosDeDobra } from './roteamento';
import { Diagrama } from './types';

/** Cores do tema claro: um SVG exportado não enxerga as variáveis CSS da página. */
const CORES: Record<string, string> = {
  '--forma-branco': '#ffffff', '--forma-borda': '#222222', '--forma-texto': '#111111', '--forma-titulo': '#cfe0f5',
  '--forma-barra': '#222222', '--selecao': '#d9480f', '--grade': '#e4e4e4',
};

const ESTILO = `
.forma-texto{font-family:Arial,sans-serif}
.campo-texto{font-family:ui-monospace,monospace;font-size:11px;fill:#111}
.campo-tipo,.forma-sub{fill:#555;font-family:sans-serif}
.cardinalidade{font:11px Arial,sans-serif;fill:#111}
`;

export interface CaixaExport { x: number; y: number; w: number; h: number }

export function caixaDoConteudo(doc: Diagrama, margem = 24): CaixaExport {
  if (!doc.formas.length) return { x: 0, y: 0, w: 400, h: 300 };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const ponto = (x: number, y: number) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); };
  for (const f of doc.formas) {
    const def = FORMAS[f.kind];
    const extra = def?.textoFora ? 12 + f.texto.length * 7 : 0;
    ponto(f.x, f.y);
    ponto(f.x + f.w + extra, f.y + f.h + (f.kind === 'especializacaoDupla' ? 6 : 0));
  }
  for (const l of doc.ligacoes) for (const p of pontosDeDobra(l)) ponto(p.x, p.y);
  const x = Math.max(0, x1 - margem);
  const y = Math.max(0, y1 - margem);
  return { x, y, w: x2 + margem - x, h: y2 + margem - y };
}

export function gerarSvg(doc: Diagrama): string {
  const c = caixaDoConteudo(doc);
  //# Renderiza o <svg> completo: fora dele o React não reconhece o namespace SVG (defs/linearGradient).
  const corpo = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" width={c.w} height={c.h} viewBox={`${c.x} ${c.y} ${c.w} ${c.h}`}>
      <style dangerouslySetInnerHTML={{ __html: ESTILO }} />
      <rect x={c.x} y={c.y} width={c.w} height={c.h} fill="#ffffff" />
      {doc.ligacoes.map((l) => <LigacaoSvg key={l.id} l={l} doc={doc} selecionada={false} />)}
      {doc.formas.map((f) => (
        <g key={f.id} transform={`translate(${f.x},${f.y})`}><FormaSvg f={f} doc={doc} /></g>
      ))}
    </svg>,
  );
  const semVars = corpo.replace(/var\((--[a-z-]+)\)/g, (_, n: string) => CORES[n] ?? '#000');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${semVars}`;
}

export function baixar(nome: string, conteudo: BlobPart, mime: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


// ---------------------------------------------------------------------------------------------
// Raster (PNG/JPG/BMP), PDF e impressão paginada
// ---------------------------------------------------------------------------------------------

const cacheIcones = new Map<string, string>();

/** O SVG carregado como <img> não busca arquivos externos: os ícones (/icons/*.png) são embutidos como data URL. */
export async function incorporarIcones(svg: string): Promise<string> {
  const urls = [...new Set([...svg.matchAll(/href="(\/icons\/[^"]+)"/g)].map((m) => m[1]))];
  await Promise.all(urls.map(async (u) => {
    if (cacheIcones.has(u)) return;
    try {
      const r = await fetch(u);
      const b = await r.blob();
      const url = await new Promise<string>((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => no(fr.error); fr.readAsDataURL(b); });
      cacheIcones.set(u, url);
    } catch { cacheIcones.set(u, ''); }
  }));
  return svg.replace(/href="(\/icons\/[^"]+)"/g, (_, u: string) => `href="${cacheIcones.get(u) || u}"`);
}

async function carregarImagem(svg: string): Promise<HTMLImageElement> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((ok, erro) => {
      img.onload = () => ok();
      img.onerror = () => erro(new Error('não foi possível renderizar o diagrama'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
  return img;
}

/** Desenha o diagrama num canvas com fundo branco; `escala` = pixels do canvas por pixel do diagrama. */
export async function rasterizar(doc: Diagrama, escala = 2): Promise<{ canvas: HTMLCanvasElement; caixa: CaixaExport }> {
  const caixa = caixaDoConteudo(doc);
  const svg = await incorporarIcones(gerarSvg(doc));
  const img = await carregarImagem(svg);
  //# Limite de área do canvas dos navegadores (~16k de lado / ~268M px).
  const max = 16000;
  const e = Math.min(escala, max / caixa.w, max / caixa.h);
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(caixa.w * e));
  cv.height = Math.max(1, Math.round(caixa.h * e));
  const g = cv.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(img, 0, 0, cv.width, cv.height);
  return { canvas: cv, caixa };
}

const paraBlob = (cv: HTMLCanvasElement, tipo: string, q?: number) =>
  new Promise<Blob>((ok, erro) => cv.toBlob((b) => (b ? ok(b) : erro(new Error(`falha ao gerar ${tipo}`))), tipo, q));

export async function gerarPng(doc: Diagrama, escala = 2): Promise<Blob> {
  return paraBlob((await rasterizar(doc, escala)).canvas, 'image/png');
}

export async function gerarJpg(doc: Diagrama, escala = 2, qualidade = 0.92): Promise<Blob> {
  return paraBlob((await rasterizar(doc, escala)).canvas, 'image/jpeg', qualidade);
}

export async function gerarBmp(doc: Diagrama, escala = 1): Promise<Blob> {
  const { canvas } = await rasterizar(doc, escala);
  const d = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  return new Blob([codificarBmp(canvas.width, canvas.height, d.data) as BlobPart], { type: 'image/bmp' });
}

export type FormatoImagem = 'png' | 'jpg' | 'bmp' | 'svg';
export const FORMATOS_IMAGEM: { valor: FormatoImagem; rotulo: string }[] = [
  { valor: 'png', rotulo: 'PNG' }, { valor: 'jpg', rotulo: 'JPG' }, { valor: 'bmp', rotulo: 'BMP' }, { valor: 'svg', rotulo: 'SVG (vetorial)' },
];

/** Exporta a imagem do diagrama no formato escolhido e devolve o arquivo. */
export async function exportarImagem(doc: Diagrama, formato: FormatoImagem, escala = 2): Promise<{ nome: string; blob: Blob }> {
  switch (formato) {
    case 'jpg': return { nome: `${doc.nome}.jpg`, blob: await gerarJpg(doc, escala) };
    case 'bmp': return { nome: `${doc.nome}.bmp`, blob: await gerarBmp(doc, escala) };
    case 'svg': return { nome: `${doc.nome}.svg`, blob: new Blob([gerarSvg(doc)], { type: 'image/svg+xml' }) };
    default: return { nome: `${doc.nome}.png`, blob: await gerarPng(doc, escala) };
  }
}

export interface PaginaRenderizada { canvas: HTMLCanvasElement; col: number; row: number }
export interface Renderizacao {
  paginas: PaginaRenderizada[];
  cols: number;
  rows: number;
  escala: number;
  dpi: number;
  cfg: ConfigPagina;
}

/** Recorta a imagem do diagrama em páginas do papel escolhido (`dpi` = resolução do canvas de cada página). */
export async function renderizarPaginas(doc: Diagrama, cfg: ConfigPagina = CONFIG_PADRAO, dpi = 96): Promise<Renderizacao> {
  const caixa = caixaDoConteudo(doc);
  const plano = dividirEmPaginas(caixa.w, caixa.h, cfg);
  const escalaRaster = (plano.escala * dpi) / 96;
  const { canvas: cheio } = await rasterizar(doc, escalaRaster);
  //# rasterizar() pode ter reduzido a escala pelo limite do canvas: usa a real.
  const real = cheio.width / caixa.w;
  const area = areaUtilMm(cfg);
  const pxPorMm = dpi / 25.4;
  const paginas: PaginaRenderizada[] = plano.paginas.map((p) => {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(area.w * pxPorMm));
    cv.height = Math.max(1, Math.round(area.h * pxPorMm));
    const g = cv.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(cheio, p.x * real, p.y * real, p.w * real, p.h * real, 0, 0, p.w * real * (cv.width / (plano.recorteW * real)), p.h * real * (cv.height / (plano.recorteH * real)));
    return { canvas: cv, col: p.col, row: p.row };
  });
  return { paginas, cols: plano.cols, rows: plano.rows, escala: plano.escala, dpi, cfg };
}

/** PDF real (várias páginas quando o conteúdo não cabe), com as páginas rasterizadas a 150 dpi. */
export async function gerarPdfDoDiagrama(doc: Diagrama, cfg: ConfigPagina = CONFIG_PADRAO, dpi = 150): Promise<Blob> {
  const r = await renderizarPaginas(doc, cfg, dpi);
  const pg = tamanhoDaPaginaMm(cfg);
  const util = areaUtilMm(cfg);
  const margem = (pg.w - util.w) / 2;
  const paginas = r.paginas.map((p) => ({
    w: pg.w * PT_POR_MM,
    h: pg.h * PT_POR_MM,
    imagens: [{
      jpeg: bytesDeDataUrl(p.canvas.toDataURL('image/jpeg', 0.92)),
      pxW: p.canvas.width, pxH: p.canvas.height,
      x: margem * PT_POR_MM, y: margem * PT_POR_MM, w: util.w * PT_POR_MM, h: util.h * PT_POR_MM,
    }],
  }));
  return new Blob([gerarPdf(paginas, doc.nome) as BlobPart], { type: 'application/pdf' });
}

/** Imprime as páginas já renderizadas: abre uma janela só com as imagens, no tamanho do papel, e chama a impressão. */
export function imprimirPaginas(doc: Diagrama, r: Renderizacao): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  const pg = tamanhoDaPaginaMm(r.cfg);
  const util = areaUtilMm(r.cfg);
  const margem = (pg.w - util.w) / 2;
  const titulo = doc.nome.replace(/[<&>"]/g, '');
  const imgs = r.paginas.map((p) => `<img src="${p.canvas.toDataURL('image/png')}" alt="">`).join('');
  w.document.write(
    `<!doctype html><meta charset="utf-8"><title>${titulo}</title><style>@page{size:${pg.w}mm ${pg.h}mm;margin:${margem}mm}` +
    `html,body{margin:0;padding:0}img{display:block;width:${util.w}mm;height:${util.h}mm;page-break-after:always}img:last-child{page-break-after:auto}</style>${imgs}`,
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
  return true;
}

/** Compatibilidade: imprime o diagrama inteiro ajustado a uma página A4 paisagem (o comando novo abre a pré-visualização). */
export function imprimir(doc: Diagrama): boolean {
  void renderizarPaginas(doc, CONFIG_PADRAO, 150).then((r) => imprimirPaginas(doc, r));
  return true;
}
