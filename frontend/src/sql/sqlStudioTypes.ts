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

/** Tipos do SQL Studio — abas de consulta, resultados, histórico. */
import { ConexaoSql, ResultadoComandoSql } from '../api';

export interface SqlTab {
  id: string;
  titulo: string;
  sql: string;
  alterado: boolean;
  resultados?: ResultadoComandoSql[];
  totalComandos?: number;
  parou?: boolean;
  tempoTotal?: number;
  executando?: boolean;
  erro?: string;
  limite?: number;
}

export interface ItemHistorico {
  id: string;
  sql: string;
  data: number;
  conexaoNome: string;
  duracao: number;
  sucesso: boolean;
  erro?: string;
}

export interface EstadoSqlStudio {
  abas: SqlTab[];
  ativa: number;
  conexao: ConexaoSql | null;
  conexaoNome: string;
  schema: string;
  catalogoCarregado: boolean;
  catalogoCarregando: boolean;
  /** Quando o carregamento do catálogo falha, o motivo (o autocomplete fica limitado a keywords). */
  catalogoErro: string;
  historico: ItemHistorico[];
  mostrarHistorico: boolean;
}

let contador = 0;
export const novoId = (): string => `sql-${Date.now()}-${++contador}`;

export function novaAba(titulo?: string): SqlTab {
  return { id: novoId(), titulo: titulo ?? 'Query', sql: '', alterado: false };
}