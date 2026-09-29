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

import { caminhoDaLigacao } from './roteamento';
import { Diagrama, Forma, Ligacao } from './types';

/**
 * Texto preso a uma linha. Props do `texto`:
 *  - `linhaMestre`: id da ligação a que o texto está atrelado;
 *  - `movimentacaoManual`: quando true o texto não acompanha mais a linha.
 */

export const linhaMestreDe = (f: Forma): string | undefined => (typeof f.props.linhaMestre === 'string' && f.props.linhaMestre ? f.props.linhaMestre : undefined);

/** Ligações que podem ser "linha mestre" e o rótulo mostrado no Inspector ("A <--> B"). */
export function linhasParaTexto(doc: Diagrama): { l: Ligacao; rotulo: string }[] {
  return doc.ligacoes.map((l) => {
    const a = doc.formas.find((f) => f.id === l.de)?.texto ?? '<>';
    const b = doc.formas.find((f) => f.id === l.para)?.texto ?? '<>';
    return { l, rotulo: `${a || '<>'} <--> ${b || '<>'}` };
  });
}

/** Centraliza o texto no meio da linha. */
export function posicionarTextoNaLinha(doc: Diagrama, textoId: string): Diagrama {
  const t = doc.formas.find((f) => f.id === textoId);
  const lid = t && linhaMestreDe(t);
  const l = lid ? doc.ligacoes.find((x) => x.id === lid) : undefined;
  if (!t || !l || t.props.movimentacaoManual) return doc;
  const cam = caminhoDaLigacao(doc, l);
  if (!cam) return doc;
  const x = Math.max(0, Math.round(cam.meio.x - t.w / 2));
  const y = Math.max(0, Math.round(cam.meio.y - t.h / 2));
  if (x === t.x && y === t.y) return doc;
  return { ...doc, formas: doc.formas.map((f) => (f.id === textoId ? { ...f, x, y } : f)) };
}

/** Reposiciona todos os textos atrelados a linhas (chamar depois de mover formas/linhas). */
export function reposicionarTextosApensos(doc: Diagrama): Diagrama {
  let res = doc;
  for (const f of doc.formas) if (f.kind === 'texto' && linhaMestreDe(f)) res = posicionarTextoNaLinha(res, f.id);
  return res;
}

// ---------------------------------------------------------------- texto apenso de Fluxo/Atividade/Livre

/**
 * Texto apenso de ligação (fluxo, atividade, livre). Props da ligação (todas opcionais):
 *  - textoAlinhamento ('Centro'|'Esquerda'|'Direita'), textoCentrarVertical (true), textoCor, textoAutosize (true),
 *    textoManual (Movimento manual; desligar zera o deslocamento), textoLargura/textoAltura (caixa sem tamanho automático);
 *  - só Livre: textoTitulo, textoPintarTitulo, textoTipo ('embranco'|'nota'|'retangulo'|'arredondado'), textoAlfa (0..100),
 *    textoCorFundo, textoSombra, textoCorSombra, textoGradiente, textoGradCor1/2, textoGradDir, textoGradDetalhe, textoGradCorDetalhe.
 */
export type TipoApenso = 'fluxo' | 'atividade' | 'livre';
export type AlinhamentoApenso = 'Centro' | 'Esquerda' | 'Direita';
export type TipoCaixaApenso = 'embranco' | 'nota' | 'retangulo' | 'arredondado';

export interface OpcoesApenso {
  alinhamento: AlinhamentoApenso;
  centrarVertical: boolean;
  corTexto?: string;
  autosize: boolean;
  manual: boolean;
  largura: number;
  altura: number;
  titulo: string;
  pintarTitulo: boolean;
  tipo: TipoCaixaApenso;
  alfa: number;
  corFundo: string;
  sombra: boolean;
  corSombra: string;
  gradiente: boolean;
  gradCor1: string;
  gradCor2: string;
  gradDir: 'Vertical' | 'Horizontal';
  gradDetalhe: boolean;
  gradCorDetalhe: string;
}

const s = (v: unknown, pad = ''): string => (typeof v === 'string' ? v : pad);
const n = (v: unknown, pad: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : pad);
const b = (v: unknown, pad: boolean): boolean => (typeof v === 'boolean' ? v : pad);

export function opcoesApenso(l: Ligacao): OpcoesApenso {
  const p = l.props;
  const al = p.textoAlinhamento;
  const tp = p.textoTipo;
  return {
    alinhamento: al === 'Esquerda' || al === 'Direita' ? al : 'Centro',
    centrarVertical: b(p.textoCentrarVertical, true),
    corTexto: s(p.textoCor) || undefined,
    autosize: b(p.textoAutosize, true),
    manual: typeof p.textoManual === 'boolean' ? p.textoManual : !!(n(p.textoDx, 0) || n(p.textoDy, 0)),
    largura: Math.max(20, n(p.textoLargura, 80)),
    altura: Math.max(14, n(p.textoAltura, 30)),
    titulo: s(p.textoTitulo),
    pintarTitulo: b(p.textoPintarTitulo, false),
    tipo: tp === 'nota' || tp === 'retangulo' || tp === 'arredondado' ? tp : 'embranco',
    alfa: Math.min(100, Math.max(0, n(p.textoAlfa, 80))),
    corFundo: s(p.textoCorFundo, '#ffffff') || '#ffffff',
    sombra: b(p.textoSombra, true),
    corSombra: s(p.textoCorSombra, '#333333') || '#333333',
    gradiente: b(p.textoGradiente, false),
    gradCor1: s(p.textoGradCor1, '#000000') || '#000000',
    gradCor2: s(p.textoGradCor2, '#cccccc') || '#cccccc',
    gradDir: p.textoGradDir === 'Horizontal' ? 'Horizontal' : 'Vertical',
    gradDetalhe: b(p.textoGradDetalhe, true),
    gradCorDetalhe: s(p.textoGradCorDetalhe, '#666666') || '#666666',
  };
}

export interface LayoutApenso {
  caixa: { x: number; y: number; w: number; h: number };
  linhas: string[];
  /** Posição da primeira linha e âncora horizontal (coordenadas do diagrama). */
  x: number;
  y0: number;
  passo: number;
  anchor: 'start' | 'middle' | 'end';
  titulo?: { texto: string; x: number; y: number };
}

/**
 * Posiciona o texto apenso: a caixa (tamanho do texto ou fixa) centrada em `meio` + deslocamento manual;
 * alinhamento horizontal e "centrar vertical" valem dentro da caixa.
 */
export function layoutApenso(l: Ligacao, texto: string, tam: number, larguraChar: number, meio: { x: number; y: number }): LayoutApenso {
  const o = opcoesApenso(l);
  const linhas = (texto || '').split('\n');
  const passo = tam + 3;
  const larg = Math.max(...linhas.map((t) => t.length), 1) * larguraChar;
  const comTitulo = o.pintarTitulo && o.titulo;
  const hTexto = linhas.length * passo;
  const w = o.autosize ? Math.round(larg + 8) : o.largura;
  const h = o.autosize ? Math.round(hTexto + 6 + (comTitulo ? passo : 0)) : o.altura;
  const dx = n(l.props.textoDx, 0);
  const dy = n(l.props.textoDy, 0);
  const x = Math.round(meio.x - w / 2 + dx);
  const y = Math.round(meio.y - h / 2 + dy);
  const ax = o.alinhamento === 'Esquerda' ? x + 4 : o.alinhamento === 'Direita' ? x + w - 4 : x + w / 2;
  const anchor = o.alinhamento === 'Esquerda' ? 'start' : o.alinhamento === 'Direita' ? 'end' : 'middle';
  const util = h - (comTitulo ? passo : 0);
  const y0 = y + (comTitulo ? passo : 0) + (o.centrarVertical ? Math.max(0, (util - hTexto) / 2) : 2) + passo / 2;
  return {
    caixa: { x, y, w, h }, linhas, x: ax, y0, passo, anchor,
    titulo: comTitulo ? { texto: o.titulo, x: x + w / 2, y: y + passo / 2 + 1 } : undefined,
  };
}

/** "Movimento manual": desligar devolve o texto ao meio da linha. */
export const propsMovimentoManual = (l: Ligacao, ligado: boolean): Record<string, unknown> =>
  ({ ...l.props, textoManual: ligado, ...(ligado ? {} : { textoDx: 0, textoDy: 0 }) });
