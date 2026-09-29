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

import { itensDaLegenda } from '../editor/legenda';
import { Diagrama } from '../editor/types';

/** Dados puros dos seletores de fonte e de cor. */

/** Tamanhos oferecidos no seletor de fonte. */
export const TAMANHOS_FONTE = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

/** Famílias mais comuns do Windows/Linux/macOS. */
export const FONTES_PADRAO = [
  'Arial', 'Calibri', 'Cambria', 'Comic Sans MS', 'Consolas', 'Courier New', 'DejaVu Sans', 'DejaVu Sans Mono', 'DejaVu Serif',
  'Georgia', 'Helvetica', 'Impact', 'Liberation Mono', 'Liberation Sans', 'Liberation Serif', 'Lucida Console',
  'Noto Sans', 'Noto Serif', 'Palatino Linotype', 'Segoe UI', 'Tahoma', 'Times New Roman',
  'Trebuchet MS', 'Ubuntu', 'Verdana',
];

export const ESTILOS_FONTE = ['Normal', 'Negrito', 'Itálico', 'Negrito itálico'] as const;
export type EstiloFonte = (typeof ESTILOS_FONTE)[number];

export const estiloDaFonte = (negrito: boolean, italico: boolean): EstiloFonte => ESTILOS_FONTE[(negrito ? 1 : 0) + (italico ? 2 : 0)];
export const estiloParaFlags = (s: string): { negrito: boolean; italico: boolean } => ({ negrito: s.includes('Negrito'), italico: s.includes('Itálico') });

export interface FonteSel { nome: string; tamanho: number; negrito: boolean; italico: boolean }

/** Lista de nomes para o seletor: garante que a fonte atual (mesmo que fora da lista) apareça. */
export function nomesDeFonte(atual: string, base: string[] = FONTES_PADRAO): string[] {
  return atual && !base.includes(atual) ? [atual, ...base] : base;
}

/** Sanea o resultado do seletor: tamanho inteiro entre 1 e 200, nome não vazio. */
export function fonteValida(f: FonteSel, padrao: FonteSel): FonteSel {
  const t = Math.round(Number(f.tamanho));
  return { nome: f.nome.trim() || padrao.nome, tamanho: Number.isFinite(t) && t >= 1 ? Math.min(200, t) : padrao.tamanho, negrito: !!f.negrito, italico: !!f.italico };
}

/** Descrição curta usada no botão do Inspector ("Arial, 12, Negrito"). */
export const descreverFonte = (f: FonteSel): string => `${f.nome}, ${f.tamanho}${f.negrito || f.italico ? `, ${estiloDaFonte(f.negrito, f.italico)}` : ''}`;

// ---------------------------------------------------------------- cores

/** Paleta principal (matiz x tom) mais a escala de cinzas. */
export const PALETA_CORES: string[] = (() => {
  const cinzas = ['#000000', '#333333', '#666666', '#808080', '#999999', '#c0c0c0', '#cccccc', '#e6e6e6', '#f2f2f2', '#ffffff'];
  const bases = ['#ff0000', '#ff8000', '#ffc800', '#ffff00', '#80ff00', '#00c800', '#00cccc', '#0080ff', '#0000ff', '#8000ff', '#ff00ff', '#ff0080'];
  const mistura = (hex: string, alvo: number, t: number) => {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (alvo - v) * t));
    return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  };
  const linhas: string[] = [];
  for (const t of [0.75, 0.5, 0.25]) for (const b of bases) linhas.push(mistura(b, 255, t));
  linhas.push(...bases);
  for (const t of [0.25, 0.5]) for (const b of bases) linhas.push(mistura(b, 0, t));
  return [...cinzas, ...linhas];
})();

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;

/** Normaliza para #rrggbb minúsculo; '' (nenhuma/padrão) e valores inválidos viram ''. */
export function normalizarCor(v: unknown): string {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (HEX6.test(s)) return s.toLowerCase();
  if (HEX3.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  return '';
}

/** Cores dos itens das legendas do diagrama (aba "Legendas"), sem repetições. */
export function coresDeLegendas(doc: Diagrama): { cor: string; texto: string }[] {
  const vistas = new Set<string>();
  const res: { cor: string; texto: string }[] = [];
  for (const f of doc.formas) {
    if (f.kind !== 'legenda') continue;
    for (const it of itensDaLegenda(f)) {
      const c = normalizarCor(it.cor);
      if (c && !vistas.has(c)) {
        vistas.add(c);
        res.push({ cor: c, texto: it.texto });
      }
    }
  }
  return res;
}
