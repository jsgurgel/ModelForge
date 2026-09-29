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

/** Store do SQL Studio — segue o mesmo padrão do store.ts (useSyncExternalStore). */
import { useSyncExternalStore } from 'react';
import { bancoApi, CatalogoAutocomplete } from '../api';
import { EstadoSqlStudio, ItemHistorico, SqlTab, novaAba, novoId } from './sqlStudioTypes';

const CHAVE_HISTORICO = 'modelforge:historicoSql';
const MAX_HISTORICO = 200;

let estado: EstadoSqlStudio = {
  abas: [novaAba()],
  ativa: 0,
  conexao: null,
  conexaoNome: '',
  schema: '',
  catalogoCarregado: false,
  catalogoCarregando: false,
  catalogoErro: '',
  historico: lerHistorico(),
  mostrarHistorico: false,
};

let catalogoDados: CatalogoAutocomplete | null = null;

const ouvintes = new Set<() => void>();
const notificar = () => ouvintes.forEach((o) => o());

export function useSqlStudio(): EstadoSqlStudio {
  return useSyncExternalStore(
    (cb) => { ouvintes.add(cb); return () => ouvintes.delete(cb); },
    () => estado,
  );
}

export function definir(parcial: Partial<EstadoSqlStudio>): void {
  estado = { ...estado, ...parcial };
  notificar();
}

export function abaAtiva(): SqlTab | undefined {
  return estado.abas[estado.ativa];
}

export function setConexao(conexao: EstadoSqlStudio['conexao'], conexaoNome: string, schema: string): void {
  estado = { ...estado, conexao, conexaoNome, schema, catalogoCarregado: false, catalogoErro: '' };
  catalogoDados = null;
  notificar();
}

/** Define a conexão ativa e já carrega o catálogo para autocomplete. */
export async function definirConexao(conexao: EstadoSqlStudio['conexao'], conexaoNome: string, schema: string): Promise<void> {
  setConexao(conexao, conexaoNome, schema);
  await recarregarCatalogo();
}

/** Recarrega o catálogo a partir da conexão atual do store. */
export async function recarregarCatalogo(): Promise<void> {
  if (!estado.conexao) return;
  setCatalogo(true);
  try {
    catalogoDados = await bancoApi.catalogo(estado.conexao, estado.schema);
    setCatalogo(false, true);
  } catch (e) {
    catalogoDados = null;
    //# Registra o erro no estado: o SQL Studio mostra por que o autocomplete está limitado.
    estado = { ...estado, catalogoCarregando: false, catalogoCarregado: false, catalogoErro: (e as Error).message };
    notificar();
  }
}

/** Devolve o catálogo carregado (ou null). */
export function obterCatalogo(): CatalogoAutocomplete | null {
  return catalogoDados;
}

/** Devolve a conexão ativa (ou null) — usada pelo Data Grid. */
export function obterConexao(): EstadoSqlStudio['conexao'] {
  return estado.conexao;
}

/** Devolve o schema ativo da conexão. */
export function obterSchema(): string {
  return estado.schema;
}

export function setCatalogo(carregando: boolean, carregado?: boolean): void {
  estado = { ...estado, catalogoCarregando: carregando, catalogoCarregado: carregado ?? estado.catalogoCarregado };
  notificar();
}

export function novaAbaSql(): void {
  const aba = novaAba(`Query ${estado.abas.length + 1}`);
  estado = { ...estado, abas: [...estado.abas, aba], ativa: estado.abas.length };
  notificar();
}

export function fecharAbaSql(indice: number): void {
  if (estado.abas.length <= 1) return;
  const abas = estado.abas.filter((_, i) => i !== indice);
  const ativa = indice === estado.ativa ? Math.max(0, indice - 1) : indice < estado.ativa ? estado.ativa - 1 : estado.ativa;
  estado = { ...estado, abas, ativa: Math.min(ativa, abas.length - 1) };
  notificar();
}

export function ativarAba(indice: number): void {
  if (indice >= 0 && indice < estado.abas.length) { estado = { ...estado, ativa: indice }; notificar(); }
}

export function renomearAba(indice: number, titulo: string): void {
  estado = { ...estado, abas: estado.abas.map((a, i) => (i === indice ? { ...a, titulo } : a)) };
  notificar();
}

export function setSqlAba(indice: number, sql: string): void {
  estado = { ...estado, abas: estado.abas.map((a, i) => (i === indice ? { ...a, sql, alterado: true } : a)) };
  notificar();
}

export function setResultadoAba(indice: number, r: Partial<SqlTab>): void {
  estado = { ...estado, abas: estado.abas.map((a, i) => (i === indice ? { ...a, ...r } : a)) };
  notificar();
}

export function limparResultadoAba(indice: number): void {
  estado = {
    ...estado,
    abas: estado.abas.map((a, i) => (i === indice ? { ...a, resultados: undefined, totalComandos: undefined, parou: undefined, tempoTotal: undefined, erro: undefined } : a)),
  };
  notificar();
}

export function mostrarHistorico(mostrar: boolean): void {
  estado = { ...estado, mostrarHistorico: mostrar };
  notificar();
}

export function adicionarHistorico(item: Omit<ItemHistorico, 'id'>): void {
  const completo: ItemHistorico = { ...item, id: novoId() };
  const historico = [completo, ...estado.historico].slice(0, MAX_HISTORICO);
  estado = { ...estado, historico };
  notificar();
  gravarHistorico(historico);
}

export function limparHistorico(): void {
  estado = { ...estado, historico: [] };
  notificar();
  gravarHistorico([]);
}

export function removerHistorico(id: string): void {
  const historico = estado.historico.filter((h) => h.id !== id);
  estado = { ...estado, historico };
  notificar();
  gravarHistorico(historico);
}

function lerHistorico(): ItemHistorico[] {
  try {
    const raw = localStorage.getItem(CHAVE_HISTORICO);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function gravarHistorico(itens: ItemHistorico[]): void {
  try { localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(itens)); } catch { /* quota */ }
}