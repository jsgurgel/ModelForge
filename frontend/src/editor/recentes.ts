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

/** Arquivos/diagramas abertos recentemente: nome, e o id quando veio do servidor. */
export interface Recente {
  nome: string;
  /** Presente quando o diagrama foi aberto/salvo no servidor (permite reabrir com um clique). */
  id?: string;
  tipo?: string;
  /** Arquivo local: chave no armazém (handle da File System Access API ou cópia do conteúdo). */
  chave?: string;
  quando: number;
}

const CHAVE = 'modelforge:recentes';
export const LIMITE_RECENTES = 12;

/** Insere no topo, sem duplicar (mesmo id, ou mesmo nome sem id), respeitando o limite. */
export function inserirRecente(lista: Recente[], novo: Recente, limite = LIMITE_RECENTES): Recente[] {
  const mesmo = (r: Recente) => (novo.id ? r.id === novo.id : novo.chave ? r.chave === novo.chave || (!r.id && !r.chave && r.nome === novo.nome) : !r.id && !r.chave && r.nome === novo.nome);
  return [novo, ...lista.filter((r) => !mesmo(r))].slice(0, limite);
}

function ler(): Recente[] {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) ?? '[]');
    return Array.isArray(bruto)
      ? bruto.filter((r) => r && typeof r.nome === 'string').map((r) => ({ nome: String(r.nome), id: typeof r.id === 'string' ? r.id : undefined, tipo: typeof r.tipo === 'string' ? r.tipo : undefined, chave: typeof r.chave === 'string' ? r.chave : undefined, quando: Number(r.quando) || 0 })).slice(0, LIMITE_RECENTES)
      : [];
  } catch {
    return [];
  }
}

let lista: Recente[] = typeof localStorage === 'undefined' ? [] : ler();
const ouvintes = new Set<() => void>();

function gravar(nova: Recente[]) {
  lista = nova;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(nova));
  } catch { /* sem armazenamento */ }
  ouvintes.forEach((o) => o());
}

export const obterRecentes = (): Recente[] => lista;
export const registrarRecente = (nome: string, id?: string, tipo?: string, chave?: string) => gravar(inserirRecente(lista, { nome, id, tipo, chave, quando: Date.now() }));
export const limparRecentes = () => gravar([]);

export function useRecentes(): Recente[] {
  return useSyncExternalStore((cb) => {
    ouvintes.add(cb);
    return () => ouvintes.delete(cb);
  }, () => lista);
}
