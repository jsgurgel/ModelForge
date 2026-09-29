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

/** Quebra de linha e medidas de texto aproximadas (não há DOM para medir; serve ao desenho SVG e a testes). */

export const larguraDoTexto = (texto: string, tamanho: number, negrito = true): number =>
  Math.ceil(texto.length * tamanho * (negrito ? 0.6 : 0.55));

/** Quebra `texto` (respeitando \n) em linhas que caibam em `max` pixels; palavras longas são cortadas. */
export function quebrarLinhas(texto: string, max: number, tamanho: number, negrito = true): string[] {
  if (max <= 0) return texto.split('\n');
  const out: string[] = [];
  for (const par of texto.split('\n')) {
    if (larguraDoTexto(par, tamanho, negrito) <= max) { out.push(par); continue; }
    let atual = '';
    for (const palavra of par.split(' ')) {
      let p = palavra;
      while (larguraDoTexto(p, tamanho, negrito) > max && p.length > 1) {
        const cabe = Math.max(1, Math.floor(max / (tamanho * (negrito ? 0.6 : 0.55))));
        if (atual) { out.push(atual); atual = ''; }
        out.push(p.slice(0, cabe));
        p = p.slice(cabe);
      }
      const teste = atual ? `${atual} ${p}` : p;
      if (larguraDoTexto(teste, tamanho, negrito) <= max || !atual) atual = teste;
      else { out.push(atual); atual = p; }
    }
    out.push(atual);
  }
  return out;
}

/** Altura de uma linha de texto. */
export const alturaDaLinha = (tamanho: number): number => Math.round(tamanho * 1.25);

/** Tamanho necessário para mostrar o texto sem quebra (Texto "Tamanho automático", tipo Em branco). */
export function tamanhoAutomatico(texto: string, tamanho: number, negrito = true, folga = 4): { w: number; h: number } {
  const linhas = texto.split('\n');
  const w = Math.max(...linhas.map((l) => larguraDoTexto(l, tamanho, negrito))) + folga * 2 + tamanho;
  const h = linhas.length * alturaDaLinha(tamanho) + folga * 2;
  return { w: Math.max(20, w), h: Math.max(16, h) };
}
