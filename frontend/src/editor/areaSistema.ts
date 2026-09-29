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

import { gerarPng } from './exportar';
import { DecisaoColagem, decidirColagem, formaDeImagem, serializarArea, subDiagramaDaSelecao } from './interacao';
import {
  abaAtiva, apagarSelecao, colarArea, colarAreaDe, copiarSelecao, mutar, obterCantoVisivel, obterEstado, selecionar, setMensagem,
} from './store';
import { aviso } from '../ui/dialogos';

/**
 * Área de transferência do sistema: as formas copiadas viajam como texto com prefixo mágico
 * (funciona entre abas, janelas e recarregamentos); imagens coladas viram uma forma Imagem. A cópia em memória do editor
 * (store.area) é o plano B quando o navegador não deixa ler/gravar a área do sistema.
 */

const alvoEditavel = (alvo: EventTarget | null): boolean => !!(alvo as Element | null)?.closest?.('input, textarea, select, [contenteditable]');

/** Grava a cópia atual (memória do editor) no sistema, sem barulho se o navegador negar. */
export async function escreverAreaNoSistema(): Promise<void> {
  const { area, areaTipo } = obterEstado();
  if (!area || !navigator.clipboard?.writeText) return;
  try {
    await navigator.clipboard.writeText(serializarArea(area, areaTipo ?? undefined));
  } catch { /* sem permissão: vale a cópia em memória */ }
}

/** Copiar (menu/atalho sem evento de cópia): memória + sistema. */
export function copiarParaSistema(): boolean {
  const ok = copiarSelecao();
  if (ok) void escreverAreaNoSistema();
  return ok;
}

export function recortarParaSistema(): void {
  if (copiarParaSistema()) apagarSelecao();
}

function lerImagem(blob: Blob): Promise<{ src: string; w: number; h: number }> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onerror = () => falha(new Error('Não foi possível ler a imagem da área de transferência'));
    r.onload = () => {
      const src = String(r.result);
      const img = new Image();
      img.onerror = () => falha(new Error('A imagem da área de transferência não pôde ser aberta'));
      img.onload = () => ok({ src, w: img.naturalWidth, h: img.naturalHeight });
      img.src = src;
    };
    r.readAsDataURL(blob);
  });
}

async function colarImagem(blob: Blob): Promise<void> {
  const aba = abaAtiva();
  if (!aba) return;
  const im = await lerImagem(blob);
  let id = '';
  mutar((d) => {
    const r = formaDeImagem(d, im.src, im.w, im.h, obterCantoVisivel());
    id = r.id;
    return r.doc;
  });
  selecionar([id]);
  setMensagem('Imagem colada');
}

async function aplicar(texto: string, imagem: Blob | null): Promise<void> {
  const memoria = !!obterEstado().area?.formas.length;
  const d: DecisaoColagem = decidirColagem({ texto, temImagem: !!imagem, memoria });
  switch (d.tipo) {
    case 'area':
      colarAreaDe(d.carga.area, d.carga.tipo);
      break;
    case 'imagem':
      try { await colarImagem(imagem!); } catch (e) { setMensagem(e instanceof Error ? e.message : String(e)); }
      break;
    case 'memoria':
      colarArea();
      break;
    default:
      setMensagem('A área de transferência não tem formas nem imagem do ModelForge para colar');
  }
}

/** Colar pelo menu/comando (sem evento de colagem): lê o sistema e, sem permissão, usa a memória. */
export async function colarDoSistema(): Promise<void> {
  if (!abaAtiva()) return;
  let texto = '';
  let imagem: Blob | null = null;
  try {
    if (navigator.clipboard?.read) {
      for (const item of await navigator.clipboard.read()) {
        if (!texto && item.types.includes('text/plain')) texto = await (await item.getType('text/plain')).text();
        const tipoImg = item.types.find((t) => t.startsWith('image/'));
        if (!imagem && tipoImg) imagem = await item.getType(tipoImg);
      }
    } else if (navigator.clipboard?.readText) {
      texto = await navigator.clipboard.readText();
    }
  } catch { /* sem permissão ou sem suporte: usa a memória */ }
  await aplicar(texto, imagem);
}

/** Ctrl+G: copia como imagem só a seleção, recortada em torno dela. */
export async function copiarComoImagem(): Promise<void> {
  const aba = abaAtiva();
  if (!aba) return;
  if (!aba.selecao.length) {
    setMensagem('Selecione o que copiar como imagem');
    return;
  }
  const sub = subDiagramaDaSelecao(aba.doc, aba.selecao);
  if (!sub.formas.length) {
    setMensagem('A seleção não tem formas para copiar como imagem');
    return;
  }
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    aviso('Copiar como imagem', 'Este navegador não permite copiar imagens para a área de transferência (ou a página não está em HTTPS/localhost). Use Arquivo > Exportar para salvar a imagem.');
    return;
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': gerarPng(sub) })]);
  setMensagem('Seleção copiada como imagem');
}

/**
 * Liga os eventos nativos de copiar/recortar/colar: sem eles Ctrl+C/X/V precisariam de permissão para ler o sistema.
 * Ignora campos de texto e texto selecionado na página.
 */
export function instalarAreaTransferencia(): () => void {
  const paginaSelecionada = () => !!window.getSelection()?.toString();
  const copiar = (cortar: boolean) => (ev: ClipboardEvent) => {
    if (alvoEditavel(ev.target) || paginaSelecionada() || !abaAtiva()) return;
    if (!copiarSelecao()) return;
    const { area, areaTipo } = obterEstado();
    if (ev.clipboardData && area) {
      ev.clipboardData.setData('text/plain', serializarArea(area, areaTipo ?? undefined));
      ev.preventDefault();
    }
    if (cortar) apagarSelecao();
  };
  const onCopy = copiar(false);
  const onCut = copiar(true);
  const onPaste = (ev: ClipboardEvent) => {
    if (alvoEditavel(ev.target) || !abaAtiva()) return;
    ev.preventDefault();
    const texto = ev.clipboardData?.getData('text/plain') ?? '';
    const arquivo = [...(ev.clipboardData?.items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile() ?? null;
    void aplicar(texto, arquivo);
  };
  window.addEventListener('copy', onCopy);
  window.addEventListener('cut', onCut);
  window.addEventListener('paste', onPaste);
  return () => {
    window.removeEventListener('copy', onCopy);
    window.removeEventListener('cut', onCut);
    window.removeEventListener('paste', onPaste);
  };
}
