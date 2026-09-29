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

/** Helpers puros do Data Grid. */

/** Valor de exibição de uma célula (null → vazio). */
export const valorCelula = (v: unknown): string => (v == null ? '' : String(v));

/** Valor da PK de uma linha: valores na ordem das colunas da PK. */
export function chaveDaLinha(linha: unknown[], colunas: string[], pk: string[]): string[] {
  return pk.map((c) => {
    const i = colunas.indexOf(c);
    return i < 0 ? '' : valorCelula(linha[i]);
  });
}

/** Índice da coluna no array de colunas; -1 se não existe. */
export const indiceDaColuna = (colunas: string[], nome: string): number => colunas.indexOf(nome);