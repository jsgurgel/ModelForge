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

/**
 * Medição de texto com a fonte do diagrama.
 * No navegador usa canvas.measureText (com cache); sem DOM/canvas (testes, SSR) cai numa tabela
 * determinística de larguras médias de uma sans-serif (Arial), proporcional ao tamanho da fonte.
 */

export interface OpcoesMedida {
  nome?: string;
  negrito?: boolean;
  italico?: boolean;
}

// Larguras (em em) aproximadas da Arial por classe de caractere.
const ESTREITOS = "iIl.,;:'|!jf`";
const LARGOS = 'mwMW@%';
const MAIUSCULAS = /[A-ZÀ-ÖØ-Þ]/;
const DIGITOS = /[0-9]/;

/** Largura determinística (em unidades de fonte = 1 para tamanho 1). */
export function larguraAproximada(texto: string, negrito = false): number {
  let total = 0;
  for (const c of texto) {
    if (c === ' ') total += 0.278;
    else if (ESTREITOS.includes(c)) total += 0.27;
    else if (LARGOS.includes(c)) total += 0.85;
    else if (MAIUSCULAS.test(c)) total += 0.68;
    else if (DIGITOS.test(c)) total += 0.556;
    else total += 0.52;
  }
  return negrito ? total * 1.06 : total;
}

const cache = new Map<string, number>();
let ctx: CanvasRenderingContext2D | null | undefined;

function contexto(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  ctx = null;
  try {
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas').getContext('2d');
      //# jsdom sem canvas devolve null (ou lança): ficamos com a aproximação.
      if (c && typeof c.measureText === 'function') ctx = c;
    }
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Só para testes: força (ou limpa) o contexto de medição. */
export function __definirContexto(c: CanvasRenderingContext2D | null | undefined): void {
  ctx = c;
  cache.clear();
}

export function medirTexto(texto: string, tamanho = 12, o: OpcoesMedida = {}): number {
  if (!texto) return 0;
  const nome = o.nome || 'Arial';
  const chave = `${nome}|${tamanho}|${o.negrito ? 1 : 0}${o.italico ? 1 : 0}|${texto}`;
  const guardado = cache.get(chave);
  if (guardado !== undefined) return guardado;
  let w: number;
  const c = contexto();
  if (c) {
    c.font = `${o.italico ? 'italic ' : ''}${o.negrito ? 'bold ' : ''}${tamanho}px ${JSON.stringify(nome)}, sans-serif`;
    w = c.measureText(texto).width;
  } else {
    w = larguraAproximada(texto, o.negrito) * tamanho;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(chave, w);
  return w;
}
