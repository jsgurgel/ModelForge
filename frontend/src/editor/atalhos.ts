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

import { COMANDOS, executarComando, microajustarSelecao, percorrer } from './comandos';
import { instalarAreaTransferencia } from './areaSistema';
import { aceitaDigitar, teclaDeTexto } from './interacao';
import { abaAtiva, setFerramenta } from './store';
import { TipoDiagrama } from './types';

/**
 * Atalhos de teclado.
 *
 * Várias teclas poderiam servir a mais de um comando (Ctrl+A abrir/selecionar, Ctrl+E exportar/anterior, Ctrl+O próximo/organizar,
 * Ctrl+F fechar/colar formato, Ctrl+1/2 salvar/micro-ajuste, Ctrl+B salvar/trazer para frente...). Escolhas da web:
 *  - Ctrl+A = selecionar tudo (convenção do navegador; também Ctrl+T); "Abrir" vai para Alt+A.
 *  - Ctrl+O = selecionar próximo e Ctrl+E = selecionar anterior (globais). No Lógico, Ctrl+O = organizar;
 *    no Conceitual, Ctrl+Shift+O = organizar.
 *  - Ctrl+F = colar formatação e Ctrl+M = copiar formatação; "Fechar" vai para Alt+F; "Exportar" para Alt+E.
 *  - Ctrl+1..4 = micro-ajuste (esquerda/cima/baixo/direita, 1px); "Salvar como/todos" vão para Alt+1/Alt+2; Ctrl+S salva.
 *  - Ctrl+B = trazer para frente e Ctrl+D = enviar para trás; salvar é Ctrl+S.
 *  - Setas movem 3px (Ctrl = 1px, Shift = redimensiona). Ctrl+C/V/X e Ctrl+Z/R.
 * Combinações com Alt usam a tecla física (e.code), para não depender do layout (AltGr, Mac).
 */

/** "Ctrl+Shift+M" -> chave normalizada comparável com o evento de teclado. */
export function chave(atalho: string): string {
  const partes = atalho.split('+');
  const tecla = partes[partes.length - 1].toLowerCase();
  const mods = partes.slice(0, -1).map((m) => m.toLowerCase()).sort();
  return [...mods, tecla].join('+');
}

export function chaveEvento(e: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'key' | 'code'>): string {
  const mods: string[] = [];
  if (e.altKey) mods.push('alt');
  if (e.ctrlKey || e.metaKey) mods.push('ctrl');
  if (e.shiftKey) mods.push('shift');
  let tecla = e.key.toLowerCase();
  if (e.altKey && e.code) {
    if (/^Key[A-Z]$/.test(e.code)) tecla = e.code.slice(3).toLowerCase();
    else if (/^Digit\d$/.test(e.code)) tecla = e.code.slice(5);
  }
  //# Zoom: "+" e "=" são a mesma tecla física (Shift+=) — normaliza para "=",
  //# assim Ctrl+=, Ctrl++ e Ctrl+Shift+= disparam o mesmo comando.
  if (tecla === '+') {
    tecla = '=';
    const i = mods.indexOf('shift');
    if (i >= 0) mods.splice(i, 1);
  }
  return [...mods.sort(), tecla].join('+');
}

/** Atalhos extras da web (convenções de navegador) além dos. */
export const EXTRAS: Record<string, string> = {
  'ctrl+y': 'editar.refazer', 'ctrl+shift+z': 'editar.refazer', 'ctrl+a': 'editar.selecionarTudo', backspace: 'editar.apagar',
};

/** Teclas que só valem em certos tipos de diagrama. */
export const ATALHOS_DIAGRAMA: Partial<Record<TipoDiagrama, Record<string, string>>> = {
  conceitual: { 'ctrl+shift+o': 'diagrama.organizar', 'ctrl+i': 'importar.ddl', 'alt+d': 'importar.dsl', 'ctrl+shift+v': 'validar' },
  logico: {
    'ctrl+o': 'diagrama.organizar', 'ctrl+i': 'importar.ddl', 'alt+d': 'importar.dsl', 'ctrl+shift+v': 'validar',
    'alt+c': 'logico.editarCampos', 'alt+s': 'logico.ddl',
  },
};

/** Micro-ajuste por Ctrl+2..4, na ordem (cima, baixo, direita); Ctrl+1 é o zoom 100%. */
const MICRO: Record<string, 'left' | 'up' | 'down' | 'right'> = { 'ctrl+2': 'up', 'ctrl+3': 'down', 'ctrl+4': 'right' };
const SETAS: Record<string, 'left' | 'up' | 'down' | 'right'> = { arrowleft: 'left', arrowup: 'up', arrowdown: 'down', arrowright: 'right' };

/** Mapa global tecla -> comando; o primeiro comando registrado com a tecla vence (os "só exibir" ficam de fora). */
export function mapaGlobal(): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const [id, c] of Object.entries(COMANDOS)) {
    if (c.atalho && !c.soExibir && !mapa.has(chave(c.atalho))) mapa.set(chave(c.atalho), id);
  }
  for (const [k, id] of Object.entries(EXTRAS)) mapa.set(k, id);
  return mapa;
}

/** Comando para uma tecla, considerando as teclas específicas do tipo do diagrama ativo. */
export function comandoParaTecla(k: string, tipo: TipoDiagrama | null, global = mapaGlobal()): string | undefined {
  return (tipo && ATALHOS_DIAGRAMA[tipo]?.[k]) || global.get(k);
}

/** Rótulo do atalho de um comando para o tipo de diagrama (some se outro comando assumiu a tecla naquele tipo). */
export function atalhoDe(id: string, tipo: TipoDiagrama | null): string | undefined {
  const espec = tipo ? ATALHOS_DIAGRAMA[tipo] : undefined;
  if (espec) {
    const achou = Object.entries(espec).find(([, v]) => v === id);
    if (achou) return achou[0].split('+').map((p) => (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1))).join('+');
  }
  const c = COMANDOS[id];
  if (!c?.atalho) return undefined;
  if (espec && !c.soExibir && espec[chave(c.atalho)] && espec[chave(c.atalho)] !== id) return undefined;
  return c.atalho;
}

/** Copiar/recortar/colar seguem os eventos nativos (areaSistema.ts): o navegador só entrega o conteúdo do sistema assim, sem pedir permissão. */
export const TECLAS_NATIVAS = new Set(['ctrl+c', 'ctrl+x', 'ctrl+v']);

/** Ctrl+Tab = próximo (+1), Ctrl+Shift+Tab = anterior (-1); 0 para as demais teclas. */
export const passoDeTab = (k: string): 1 | -1 | 0 => (k === 'ctrl+tab' ? 1 : k === 'ctrl+shift+tab' ? -1 : 0);

/** Botões, links e itens de menu tratam Enter/espaço por conta própria. */
const ATIVAVEL = 'button, a[href], summary, [role="button"], [role="menuitem"], [role="tab"]';

export function instalarAtalhos(): () => void {
  const h = (e: KeyboardEvent) => {
    const alvo = e.target as HTMLElement;
    //# Digitando num campo: os atalhos do editor não valem (Ctrl+Z desfaz o texto, não o diagrama).
    if (alvo.closest?.('input, textarea, select, [contenteditable]')) return;
    const k = chaveEvento(e);
    const tipo = abaAtiva()?.doc.tipo ?? null;

    if (k === 'escape') {
      setFerramenta(null);
      return;
    }
    if (TECLAS_NATIVAS.has(k)) return;
    const passo = passoDeTab(k);
    if (passo) {
      e.preventDefault();
      percorrer(passo);
      return;
    }
    const aba0 = abaAtiva();
    const unica = aba0 && aba0.selecao.length === 1 ? aba0.doc.formas.find((f) => f.id === aba0.selecao[0]) : undefined;
    if (unica && !alvo.closest?.(ATIVAVEL)) {
      //# Enter abre a edição do texto; digitar uma letra começa a editar.
      if (k === 'enter') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('modelforge:editar-texto', { detail: { id: unica.id } }));
        return;
      }
      const tecla = teclaDeTexto(e);
      if (tecla && aceitaDigitar(unica)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('modelforge:digitar-texto', { detail: { id: unica.id, tecla } }));
        return;
      }
    }
    const seta = SETAS[e.key.toLowerCase()];
    const micro = MICRO[k];
    if ((seta || micro) && !e.altKey && !e.metaKey) {
      const aba = abaAtiva();
      if (!aba || !aba.selecao.length) return; // sem seleção as setas rolam a área normalmente
      e.preventDefault();
      microajustarSelecao(seta ?? micro, { ctrl: !!micro || e.ctrlKey, shift: e.shiftKey });
      return;
    }
    const id = comandoParaTecla(k, tipo);
    if (!id) return;
    e.preventDefault();
    executarComando(id);
  };
  window.addEventListener('keydown', h);
  const removerArea = instalarAreaTransferencia();
  return () => { window.removeEventListener('keydown', h); removerArea(); };
}
