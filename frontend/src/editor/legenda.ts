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

import { PALETA, FORMAS } from '../shapes/registry';
import { Diagrama, Forma } from './types';

/**
 * Legenda. Props da forma `legenda`:
 *  - `tipoLegenda`: 'cores' | 'linhas' | 'objetos'
 *  - `itens`: { texto, cor, tag }[]   (`tag` = índice do artefato no tipo 'objetos')
 *  - `corBorda` da legenda usa `props.corBordaLegenda` (padrão cinza claro)
 *  - `itemSel`: índice do item selecionado (só visual)
 * Legendas antigas (props.corpo, uma linha por item) continuam legíveis: viram itens pretos.
 */

export type TipoLegenda = 'cores' | 'linhas' | 'objetos';
export const TIPOS_LEGENDA: { valor: TipoLegenda; rotulo: string }[] = [
  { valor: 'cores', rotulo: 'Cores' },
  { valor: 'linhas', rotulo: 'Linhas' },
  { valor: 'objetos', rotulo: 'Objetos' },
];

export interface ItemLegenda { texto: string; cor: string; tag: number }

export const tipoDaLegenda = (f: Forma): TipoLegenda => {
  const t = f.props.tipoLegenda;
  return t === 'linhas' || t === 'objetos' ? t : 'cores';
};

export function itensDaLegenda(f: Forma): ItemLegenda[] {
  const it = f.props.itens;
  if (Array.isArray(it)) {
    return (it as Partial<ItemLegenda>[]).map((x) => ({ texto: String(x.texto ?? ''), cor: String(x.cor ?? '#000000'), tag: Number(x.tag ?? 0) }));
  }
  return String(f.props.corpo ?? '').split('\n').filter(Boolean).map((texto) => ({ texto, cor: '#000000', tag: 0 }));
}

/** Altura de uma linha de item e do título, na fonte reduzida em 2 pontos. */
export function alturasDaLegenda(tamanhoFonte: number, tipo: TipoLegenda): { item: number; titulo: number } {
  let item = Math.round((tamanhoFonte - 2) * 1.45);
  if (tipo === 'objetos') item = Math.max(32, item);
  return { item, titulo: item + Math.trunc(item / 2) };
}

/** Altura total que a legenda precisa para `n` itens. */
export function alturaDaLegenda(n: number, tamanhoFonte: number, tipo: TipoLegenda): number {
  const a = alturasDaLegenda(tamanhoFonte, tipo);
  return (a.item + 4) * n + a.titulo;
}

const norm = (c: unknown): string | null => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null);

/** Cores explícitas usadas pelas formas do diagrama (Forma.PoluleColors), sem repetir as já listadas. */
export function coresDoDiagrama(doc: Diagrama, jaListadas: string[] = []): string[] {
  const ja = new Set(jaListadas.map((c) => c.toLowerCase()));
  const out: string[] = [];
  const add = (c: unknown) => {
    const x = norm(c);
    if (x && !ja.has(x)) { ja.add(x); out.push(x); }
  };
  for (const f of doc.formas) {
    if (f.kind === 'legenda') continue;
    add(f.cor); add(f.corBorda); add(f.corTexto);
    add(f.props.gradCor1); add(f.props.gradCor2); add(f.props.setaCor); add(f.props.corFundo);
  }
  for (const l of doc.ligacoes) add(l.corBorda);
  return out;
}

/** Nomes dos artefatos que o tipo 'objetos' pode listar para o tipo de diagrama. */
export function artefatosDoDiagrama(doc: Diagrama): { kind: string; rotulo: string }[] {
  const vistos = new Set<string>();
  const out: { kind: string; rotulo: string }[] = [];
  for (const p of PALETA[doc.tipo]) {
    if (p.tipo !== 'forma' || vistos.has(p.kind)) continue;
    vistos.add(p.kind);
    out.push({ kind: p.kind, rotulo: FORMAS[p.kind].rotulo });
  }
  return out;
}

export const legendaComItens = (f: Forma, itens: ItemLegenda[], tamanhoFonte: number): Forma => {
  const h = alturaDaLegenda(itens.length, tamanhoFonte, tipoDaLegenda(f));
  return { ...f, h: Math.max(h, 40), props: { ...f.props, itens } };
};

export const adicionarItem = (f: Forma, tamanhoFonte: number, texto = '?', cor = '#000000', tag = 0): Forma =>
  legendaComItens(f, [...itensDaLegenda(f), { texto, cor, tag }], tamanhoFonte);

export const removerItem = (f: Forma, idx: number, tamanhoFonte: number): Forma =>
  legendaComItens(f, itensDaLegenda(f).filter((_, k) => k !== idx), tamanhoFonte);

/** Trocar o tipo limpa os itens. */
export const trocarTipoLegenda = (f: Forma, tipo: TipoLegenda, tamanhoFonte: number): Forma =>
  legendaComItens({ ...f, props: { ...f.props, tipoLegenda: tipo } }, [], tamanhoFonte);

/** "Capturar cores": acrescenta as cores do diagrama ainda não listadas (só no tipo Cores). */
export function capturarCores(doc: Diagrama, f: Forma): Forma {
  if (tipoDaLegenda(f) !== 'cores') return f;
  const atuais = itensDaLegenda(f);
  const novas = coresDoDiagrama(doc, atuais.map((i) => i.cor));
  if (!novas.length) return f;
  return legendaComItens(f, [...atuais, ...novas.map((cor) => ({ texto: '?', cor, tag: 0 }))], doc.fonte.tamanho);
}
