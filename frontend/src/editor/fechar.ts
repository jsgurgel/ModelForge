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

import { abrirDialogo } from '../ui/dialogos';
import { salvarAba } from './salvar';
import { fecharAba, fecharTodas, obterEstado } from './store';

/**
 * Fechar com lista de diagramas alterados. A lista mostra TODOS os
 * diagramas; só os alterados vêm marcados e habilitados; "Continuar" salva os marcados e segue.
 */

export interface ItemFechar { indice: number; nome: string; alterado: boolean }

export const itensParaFechar = (abas: { alterado: boolean; doc: { nome: string } }[], indices: number[]): ItemFechar[] =>
  indices.filter((i) => abas[i]).map((i) => ({ indice: i, nome: abas[i].doc.nome, alterado: abas[i].alterado }));

/** Estado inicial das caixas: os alterados vêm marcados (os demais ficam desabilitados). */
export const marcadosIniciais = (itens: ItemFechar[]): Set<number> => new Set(itens.filter((x) => x.alterado).map((x) => x.indice));

/** Rótulo: "<n> - <nome>" (n = posição na lista). */
export const rotuloItem = (itens: ItemFechar[], k: number): string => `${k + 1} - ${itens[k].nome}`;

export const podeMarcarTodos = (itens: ItemFechar[], marcados: Set<number>): boolean => itens.some((x) => x.alterado && !marcados.has(x.indice));
export const podeDesmarcarTodos = (itens: ItemFechar[], marcados: Set<number>): boolean => itens.some((x) => x.alterado && marcados.has(x.indice));

/** Mostra a lista quando algum diagrama do conjunto foi alterado; senão executa `depois` direto. */
export function solicitarFechamento(indices: number[], depois: () => void): void {
  const abas = obterEstado().abas;
  if (!itensParaFechar(abas, indices).some((x) => x.alterado)) { depois(); return; }
  abrirDialogo({ tipo: 'g2', nome: 'fechar', indices, depois });
}

/** Salva os marcados, um a um, e só então continua; se um salvamento falhar ou for cancelado, nada é fechado. */
export async function salvarMarcadosEContinuar(marcados: number[], depois: () => void): Promise<boolean> {
  for (const i of marcados) {
    if (!(await salvarAba(i))) return false;
  }
  depois();
  return true;
}

export const fecharAbaComLista = (i: number) => solicitarFechamento([i], () => fecharAba(i));
export const fecharTodasComLista = () => solicitarFechamento(obterEstado().abas.map((_, i) => i), fecharTodas);

/** Último recurso: o `beforeunload` do navegador só avisa (não dá para abrir a lista ao descarregar a página). */
export const haAlteracoes = (): boolean => obterEstado().abas.some((a) => a.alterado);
