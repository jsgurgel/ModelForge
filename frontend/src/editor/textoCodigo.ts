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

/** Visor de código: zoom da fonte (1..72, padrão 12) e "Limpar caracteres especiais". */
export const ZOOM_CODIGO_INICIAL = 12;
export const ZOOM_CODIGO_MIN = 1;
export const ZOOM_CODIGO_MAX = 72;

/** Soma `delta` ao zoom respeitando os limites (passar do limite não muda nada). */
export const ajustarZoomCodigo = (atual: number, delta: number): number => Math.min(ZOOM_CODIGO_MAX, Math.max(ZOOM_CODIGO_MIN, atual + delta));

/** Remove acentos e cedilha/til (letras minúsculas e maiúsculas). */
export function limparCaracteresEspeciais(t: string): string {
  return t
    .replace(/[ãâàáä]/g, 'a').replace(/[êèéë]/g, 'e').replace(/[îìíï]/g, 'i').replace(/[õôòóö]/g, 'o').replace(/[ûúùü]/g, 'u')
    .replace(/[ÃÂÀÁÄ]/g, 'A').replace(/[ÊÈÉË]/g, 'E').replace(/[ÎÌÍÏ]/g, 'I').replace(/[ÕÔÒÓÖ]/g, 'O').replace(/[ÛÙÚÜ]/g, 'U')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C').replace(/ñ/g, 'n').replace(/Ñ/g, 'N');
}
