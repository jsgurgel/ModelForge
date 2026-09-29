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

import { ColunaInfo, Conexao, DominioInfo, EnumInfo, FkLinha, GatilhoLinha, IndiceLinha, ItemBanco, Particionamento, ResultadoSql, RotinaInfo, SequenciaInfo, TipoBanco } from '../tipos';

/** Base das conexões: o que um SGBD não tem (sequences, enums...) devolve vazio. */
export abstract class ConexaoBase implements Conexao {
  abstract readonly tipo: TipoBanco;
  abstract readonly usaSchema: boolean;
  abstract schemas(): Promise<string[]>;
  abstract objetos(schema: string | null): Promise<ItemBanco[]>;
  abstract colunas(schema: string | null, tabela: string): Promise<ColunaInfo[]>;
  abstract chavePrimaria(schema: string | null, tabela: string): Promise<string[]>;
  abstract fksImportadas(schema: string | null, tabela: string): Promise<FkLinha[]>;
  abstract fksExportadas(schema: string | null, tabela: string): Promise<FkLinha[]>;
  abstract indices(schema: string | null, tabela: string): Promise<IndiceLinha[]>;
  abstract definicaoView(schema: string | null, nome: string): Promise<string | null>;
  abstract executar(sql: string, params: string[], limiteLinhas: number): Promise<ResultadoSql>;
  abstract fechar(): Promise<void>;

  async sequencias(_schema: string | null): Promise<ItemBanco[]> { return []; }
  async rotinasNomes(_schema: string | null): Promise<ItemBanco[]> { return []; }
  async sequenciasDetalhe(_schema: string | null): Promise<SequenciaInfo[]> { return []; }
  async dominios(_schema: string | null): Promise<DominioInfo[]> { return []; }
  async enums(_schema: string | null): Promise<EnumInfo[]> { return []; }
  async rotinas(_schema: string | null): Promise<RotinaInfo[]> { return []; }
  async gatilhos(_schema: string | null, _tabela: string): Promise<GatilhoLinha[]> { return []; }
  async particionamento(_schema: string | null, _tabela: string): Promise<Particionamento> { return { cauda: '', comando: '' }; }
  async tiposEspaciais(_schema: string | null, _tabela: string): Promise<Record<string, string>> { return {}; }
}

/** Nome do SGBD do JDBC para tipo de objeto. */
export const s = (v: unknown): string | null => (v == null ? null : String(v));

/** Tira o "CREATE VIEW nome [(cols)] AS" da frente (SQL Server e SQLite guardam o comando inteiro). */
export function corpoDeView(def: string | null): string | null {
  if (def == null) return null;
  const m = /^\s*create\s+(?:or\s+alter\s+)?(?:temp(?:orary)?\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:"[^"]+"|\[[^\]]+\]|`[^`]+`|[\w$.]+)(?:\s*\.\s*(?:"[^"]+"|\[[^\]]+\]|`[^`]+`|[\w$]+))?(?:\s*\([^)]*\))?\s+(?:with\s+[\w,\s]+?\s+)?as\s+/i.exec(def);
  return m ? def.slice(m[0].length) : def;
}
