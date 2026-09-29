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

import { CampoNoSql, CampoTabela, Forma } from './types';
import { textoDoAtributo } from './atributo';
import { OpcoesMedida, medirTexto } from './medidaTexto';
import { FORMAS } from '../shapes/registry';
import { alturaDaTabela } from './logico';

export interface Ponto { x: number; y: number }

export const ALT_TITULO = 24;
export const ALT_LINHA = 18;

export const centro = (f: Forma): Ponto => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });

/** Largura do texto na fonte do diagrama (canvas measureText com cache; aproximação determinística sem DOM). */
export const larguraTexto = (texto: string, tamanho = 12, opc: OpcoesMedida = {}): number => Math.ceil(medirTexto(texto, tamanho, opc));

export function camposDaTabela(f: Forma): CampoTabela[] {
  return (f.props.campos as CampoTabela[] | undefined) ?? [];
}

/** Linhas exibidas dentro de uma Coleção (campos achatados, com nível de recuo). */
export function linhasColecao(campos: CampoNoSql[], nivel = 0): { texto: string; nivel: number }[] {
  const out: { texto: string; nivel: number }[] = [];
  for (const c of campos) {
    out.push({
      texto: c.tipo === 'reference' ? `${c.nome} -> ${c.colecaoReferenciada || '?'}` : `${c.nome}: ${c.tipo}`,
      nivel,
    });
    if (c.subCampos?.length) out.push(...linhasColecao(c.subCampos, nivel + 1));
  }
  return out;
}

export function itensDaForma(f: Forma): number {
  switch (FORMAS[f.kind]?.geo) {
    case 'table':
      return camposDaTabela(f).length;
    case 'colecao':
      return linhasColecao((f.props.campos as CampoNoSql[] | undefined) ?? []).length;
    case 'enum':
      return String(f.props.rotulos ?? '').split('\n').filter(Boolean).length;
    default:
      return 0;
  }
}

/** Altura mínima que a forma precisa pra mostrar o próprio conteúdo. */
export function alturaMinima(f: Forma): number {
  const geo = FORMAS[f.kind]?.geo;
  //# Tabela: campos, IR, índices, gatilhos e DDL desenhados (ver logico.layoutTabela).
  if (geo === 'table') return alturaDaTabela(f);
  if (geo === 'colecao' || geo === 'enum') {
    return ALT_TITULO + Math.max(1, itensDaForma(f)) * ALT_LINHA + 6;
  }
  return FORMAS[f.kind]?.fixa ? f.h : 16;
}

/** Recalcula a altura de formas cujo tamanho depende do conteúdo. */
/** Largura para caber o título (negrito) e a linha "nome: tipo" mais longa, que é desenhada em fonte monoespaçada. */
export function larguraMinimaTabela(f: Forma): number {
  const tam = Number(f.fonte?.tamanho ?? 12);
  const campos = ((f.props.campos as { nome?: string; tipo?: string }[] | undefined) ?? []);
  const maior = campos.reduce((m, c) => Math.max(m, `${c.nome ?? ''}: ${c.tipo ?? ''}`.length), 0);
  const linhas = 22 + Math.ceil(maior * (tam - 1) * 0.62) + 10;
  const titulo = larguraTexto(f.texto, tam, { negrito: true }) + 24;
  return Math.max(linhas, titulo);
}

export function reenquadrar(f: Forma): Forma {
  const geo = FORMAS[f.kind]?.geo;
  if ((geo === 'attr' || geo === 'multiattr') && f.props.autosize !== false) {
    //# Largura = largura do texto desenhado + altura + 4 + 4.
    const rotulo = textoDoAtributo(f).split('\n').reduce((m, l) => (l.length > m.length ? l : m), '');
    const w = larguraTexto(rotulo, Number(f.fonte?.tamanho ?? 12), { nome: f.fonte?.nome, negrito: f.fonte?.negrito ?? true, italico: f.fonte?.italico }) + f.h + 8;
    return w === f.w ? f : { ...f, w };
  }
  //# A largura só cresce (nunca encolhe o que o usuário definiu): nenhum campo pode ficar fora do quadro.
  if (geo === 'table') {
    const w = larguraMinimaTabela(f);
    if (w > f.w) f = { ...f, w };
  }
  //# "Altura automática" desligada: a tabela mantém a altura que o usuário deu.
  if (geo === 'table' && f.props.autosize === false) return f;
  if (geo === 'table' || geo === 'colecao' || geo === 'enum') {
    const h = alturaMinima(f);
    return h === f.h ? f : { ...f, h };
  }
  return f;
}

function bordaRetangulo(f: Forma, alvo: Ponto): Ponto {
  const c = centro(f);
  const dx = alvo.x - c.x;
  const dy = alvo.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const escala = Math.min(dx !== 0 ? f.w / 2 / Math.abs(dx) : Infinity, dy !== 0 ? f.h / 2 / Math.abs(dy) : Infinity);
  return { x: c.x + dx * escala, y: c.y + dy * escala };
}

function bordaElipse(f: Forma, alvo: Ponto): Ponto {
  const c = centro(f);
  const dx = alvo.x - c.x;
  const dy = alvo.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const a = f.w / 2;
  const b = f.h / 2;
  const t = 1 / Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b));
  return { x: c.x + dx * t, y: c.y + dy * t };
}

function bordaLosango(f: Forma, alvo: Ponto): Ponto {
  const c = centro(f);
  const dx = alvo.x - c.x;
  const dy = alvo.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const t = 1 / (Math.abs(dx) / (f.w / 2) + Math.abs(dy) / (f.h / 2));
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Ponto da borda da forma na direção de `alvo`. */
export function pontoNaBorda(f: Forma, alvo: Ponto): Ponto {
  switch (FORMAS[f.kind]?.geo) {
    case 'ellipse':
    case 'circle':
    case 'attr':
    case 'multiattr':
    case 'inicio':
    case 'fim':
    case 'junction':
      return bordaElipse(f, alvo);
    case 'diamond':
    case 'special':
    case 'union':
    case 'triangle':
      return bordaLosango(f, alvo);
    default:
      return bordaRetangulo(f, alvo);
  }
}

/** Extremos da linha que liga duas formas (borda a borda, sobre o segmento entre os centros). */
export function extremos(de: Forma, para: Forma): [Ponto, Ponto] {
  return [pontoNaBorda(de, centro(para)), pontoNaBorda(para, centro(de))];
}

export function dentro(f: Forma, p: Ponto): boolean {
  return p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h;
}

export function intersecta(f: Forma, r: { x: number; y: number; w: number; h: number }): boolean {
  return f.x < r.x + r.w && f.x + f.w > r.x && f.y < r.y + r.h && f.y + f.h > r.y;
}

export function normalizar(a: Ponto, b: Ponto) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
