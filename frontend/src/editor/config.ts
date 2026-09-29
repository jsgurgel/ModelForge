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

import { useSyncExternalStore } from 'react';
import { TIPOS, TipoDiagrama } from './types';

/**
 * Configuração do ambiente, persistida no localStorage e lida pelo Canvas,
 * pelo autosave e pelo editor de texto inline.
 */
export interface Config {
  mostrarGrade: boolean;
  larguraGrade: number;
  encaixarNaGrade: boolean;
  mostrarIds: boolean;
  /** Botões laterais ao lado do objeto selecionado (Ancorador). */
  ancorador: boolean;
  dicas: boolean;
  dimensoesAoMover: boolean;
  /** Apagar um objeto apaga as linhas ligadas a ele; desligado, o objeto ligado não é apagado. */
  propagarExclusao: boolean;
  tipoPadrao: TipoDiagrama;
  /** Minutos entre gravações do autosave (0 desativa; 0..29; padrão 5). */
  intervaloAutosave: number;
  reescreverAoDigitar: boolean;
  larguraSidebar: number;
}

export const CONFIG_PADRAO: Config = {
  mostrarGrade: false,
  larguraGrade: 20,
  encaixarNaGrade: false,
  mostrarIds: false,
  ancorador: true,
  dicas: true,
  dimensoesAoMover: false,
  propagarExclusao: true,
  tipoPadrao: 'conceitual',
  intervaloAutosave: 5,
  reescreverAoDigitar: false,
  larguraSidebar: 268,
};

const CHAVE = 'modelforge:config';

/** Sanea o que veio do armazenamento: tipos e limites, sem confiar no conteúdo. */
export function normalizarConfig(bruto: unknown): Config {
  const o = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const bool = (k: keyof Config) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : (CONFIG_PADRAO[k] as boolean));
  const num = (k: keyof Config, min: number, max: number) => {
    const v = Number(o[k]);
    return Number.isFinite(v) && o[k] !== '' && o[k] !== null ? Math.min(max, Math.max(min, v)) : (CONFIG_PADRAO[k] as number);
  };
  return {
    mostrarGrade: bool('mostrarGrade'),
    larguraGrade: Math.round(num('larguraGrade', 5, 200)),
    encaixarNaGrade: bool('encaixarNaGrade'),
    mostrarIds: bool('mostrarIds'),
    ancorador: bool('ancorador'),
    dicas: bool('dicas'),
    dimensoesAoMover: bool('dimensoesAoMover'),
    propagarExclusao: bool('propagarExclusao'),
    tipoPadrao: TIPOS.includes(o.tipoPadrao as TipoDiagrama) ? (o.tipoPadrao as TipoDiagrama) : CONFIG_PADRAO.tipoPadrao,
    intervaloAutosave: Math.round(num('intervaloAutosave', 0, 29)),
    reescreverAoDigitar: bool('reescreverAoDigitar'),
    larguraSidebar: Math.round(num('larguraSidebar', 180, 700)),
  };
}

function ler(): Config {
  try {
    const bruto = typeof localStorage !== 'undefined' ? localStorage.getItem(CHAVE) : null;
    return normalizarConfig(bruto ? JSON.parse(bruto) : {});
  } catch {
    return { ...CONFIG_PADRAO };
  }
}

let atual: Config = ler();
const ouvintes = new Set<() => void>();

export const obterConfig = (): Config => atual;

export function definirConfig(parcial: Partial<Config>) {
  atual = normalizarConfig({ ...atual, ...parcial });
  try {
    localStorage.setItem(CHAVE, JSON.stringify(atual));
  } catch { /* armazenamento indisponível: vale só na sessão */ }
  ouvintes.forEach((o) => o());
}

export const restaurarConfig = () => definirConfig({ ...CONFIG_PADRAO });

export function useConfig(): Config {
  return useSyncExternalStore((cb) => {
    ouvintes.add(cb);
    return () => ouvintes.delete(cb);
  }, () => atual);
}

/** Arredonda ao múltiplo da grade (encaixe na grade). */
export const encaixar = (v: number, grade: number): number => Math.round(v / grade) * grade;

/** Passos de zoom: de 5% em 5%, de 5% a 500%. */
export const PASSOS_ZOOM: number[] = Array.from({ length: 100 }, (_, i) => Math.round((i + 1) * 5) / 100);
export const rotuloZoom = (z: number): string => `${+(z * 100).toFixed(1)}%`;
/** Índice do passo igual (com tolerância) ao zoom atual; sem igualdade, o padrão 100%. */
export const indiceDoZoom = (z: number): number => {
  const i = PASSOS_ZOOM.findIndex((p) => Math.abs(p - z) < 0.005);
  return i >= 0 ? i : 19;
};
