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

import { useCallback, useSyncExternalStore } from 'react';
import { layoutTabela, moverItem, propsTabela, sincronizarFlags, removerCampo } from './logico';
import { Doc, atualizarProps } from './ops';
import { Forma } from './types';

export type TipoItem = 'campo' | 'constraint' | 'indice' | 'gatilho';

/** Item (campo, IR, índice ou gatilho) selecionado dentro de uma tabela do Lógico: fica só na interface, fora do modelo. */
export interface ItemSel {
  formaId: string;
  tipo: TipoItem;
  id: string;
}

let atual: ItemSel | null = null;
const ouvintes = new Set<() => void>();
const inscrever = (fn: () => void) => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; };

export const itemSelecionado = (): ItemSel | null => atual;
export const useItemSel = (): ItemSel | null => useSyncExternalStore(inscrever, itemSelecionado, itemSelecionado);

export function selecionarItem(s: ItemSel | null) {
  if (atual === s || (atual && s && atual.formaId === s.formaId && atual.tipo === s.tipo && atual.id === s.id)) return;
  atual = s;
  ouvintes.forEach((f) => f());
}

/** Mesma seleção vista pelo Inspector (`Sub`): o painel do item e o destaque no desenho andam juntos. */
export interface SubSel { forma: string; tipo: TipoItem; id: string }
export function useSubSel(): [SubSel | null, (s: SubSel | null) => void] {
  const it = useItemSel();
  const set = useCallback((s: SubSel | null) => selecionarItem(s ? { formaId: s.forma, tipo: s.tipo, id: s.id } : null), []);
  return [it ? { forma: it.formaId, tipo: it.tipo, id: it.id } : null, set];
}

const ALT_CAMPO = 18;

/**
 * Item sob o ponto (coordenadas do diagrama), pela mesma disposição que a tabela desenha: campos (lista ou "forma
 * simples", onde `x` decide o campo), IR (linhas ou ícones em fila no modo "IR simplificada"), índices e gatilhos.
 */
export function itemNoPonto(t: Forma, y: number, tamFonte = 12, x?: number): ItemSel | null {
  const p = propsTabela(t);
  const L = layoutTabela(t, tamFonte);
  const yl = y - t.y;
  const xl = x === undefined ? undefined : x - t.x;
  const mk = (tipo: TipoItem, id: string): ItemSel => ({ formaId: t.id, tipo, id });
  if (!L.plain && yl >= L.yCampos) {
    const i = Math.floor((yl - L.yCampos) / ALT_CAMPO);
    if (i >= 0 && i < p.campos.length && yl < L.yCampos + Math.max(p.campos.length, 1) * ALT_CAMPO) return mk('campo', p.campos[i].id);
  }
  if (L.plain && xl !== undefined) {
    for (const ln of L.plain.linhas) {
      if (yl < ln.y - L.plain.rowH / 2 || yl >= ln.y + L.plain.rowH / 2) continue;
      const it = ln.itens.find((k) => xl >= k.x && xl < k.x + k.largura);
      if (it) return mk('campo', it.campoId);
    }
  }
  if (L.yIR !== null && yl >= L.yIR && L.hIR > 0 && L.rowIR > 0 && yl < L.yIR + L.hIR) {
    if (t.props.plainIR !== false) {
      if (xl !== undefined) {
        const i = Math.floor((xl - 1) / (L.rowIR + 2));
        if (i >= 0 && i < p.constraints.length && xl - 1 - i * (L.rowIR + 2) < L.rowIR) return mk('constraint', p.constraints[i].id);
      }
    } else {
      const i = Math.floor((yl - L.yIR) / L.rowIR);
      if (i >= 0 && i < p.constraints.length) return mk('constraint', p.constraints[i].id);
    }
  }
  if (L.yIndices !== null && yl >= L.yIndices) {
    const i = Math.floor((yl - L.yIndices) / L.rowIR);
    if (i >= 0 && i < p.indices.length) return mk('indice', p.indices[i].id);
  }
  if (L.yGatilhos !== null && yl >= L.yGatilhos) {
    const i = Math.floor((yl - L.yGatilhos) / L.rowIR);
    if (i >= 0 && i < p.gatilhos.length) return mk('gatilho', p.gatilhos[i].id);
  }
  return null;
}

/** Retângulo (relativo à tabela) do item, para o destaque de seleção; null se o item não está visível. */
export function retanguloDoItem(t: Forma, s: ItemSel, tamFonte = 12): { x: number; y: number; w: number; h: number } | null {
  const p = propsTabela(t);
  const L = layoutTabela(t, tamFonte);
  const larg = t.w - 2;
  switch (s.tipo) {
    case 'campo': {
      const i = p.campos.findIndex((c) => c.id === s.id);
      if (i < 0) return null;
      if (L.plain) {
        for (const ln of L.plain.linhas) {
          const it = ln.itens.find((k) => k.campoId === s.id);
          if (it) return { x: it.x - 1, y: ln.y - L.plain.rowH / 2, w: it.largura + 2, h: L.plain.rowH };
        }
        return null;
      }
      return { x: 1, y: L.yCampos + i * ALT_CAMPO, w: larg, h: ALT_CAMPO };
    }
    case 'constraint': {
      const i = p.constraints.findIndex((c) => c.id === s.id);
      if (i < 0 || L.yIR === null) return null;
      if (t.props.plainIR !== false) return { x: 1 + i * (L.rowIR + 2), y: L.yIR, w: L.rowIR, h: L.rowIR };
      return { x: 1, y: L.yIR + i * L.rowIR, w: larg, h: L.rowIR };
    }
    case 'indice': {
      const i = p.indices.findIndex((c) => c.id === s.id);
      return i < 0 || L.yIndices === null ? null : { x: 1, y: L.yIndices + i * L.rowIR, w: larg, h: L.rowIR };
    }
    case 'gatilho': {
      const i = p.gatilhos.findIndex((c) => c.id === s.id);
      return i < 0 || L.yGatilhos === null ? null : { x: 1, y: L.yGatilhos + i * L.rowIR, w: larg, h: L.rowIR };
    }
  }
}

function listaDoItem(t: Forma, tipo: TipoItem): { id: string }[] {
  const p = propsTabela(t);
  return tipo === 'campo' ? p.campos : tipo === 'constraint' ? p.constraints : tipo === 'indice' ? p.indices : p.gatilhos;
}
const CHAVE_LISTA: Record<TipoItem, 'campos' | 'constraints' | 'indices' | 'gatilhos'> = {
  campo: 'campos', constraint: 'constraints', indice: 'indices', gatilho: 'gatilhos',
};

function indice(t: Forma, s: ItemSel): { lista: { id: string }[]; i: number } {
  const lista = listaDoItem(t, s.tipo);
  return { lista, i: lista.findIndex((x) => x.id === s.id) };
}

export function podeMoverItem(t: Forma | undefined, s: ItemSel | null, delta: -1 | 1): boolean {
  if (!t || !s || s.formaId !== t.id) return false;
  const { lista, i } = indice(t, s);
  return i >= 0 && i + delta >= 0 && i + delta < lista.length;
}

/** Sobe/desce o item selecionado. (A sincronização de `constraintOrigem` acontece em `mutar`, via integridade.ts.) */
export function moverItemSelecionado(doc: Doc, s: ItemSel, delta: -1 | 1): Doc {
  const t = doc.formas.find((f) => f.id === s.formaId);
  if (!t || !podeMoverItem(t, s, delta)) return doc;
  const { lista, i } = indice(t, s);
  return atualizarProps(doc, t.id, { [CHAVE_LISTA[s.tipo]]: moverItem(lista, i, delta) });
}

/** Exclui o item selecionado: campo com tudo que o referencia, IR, índice ou gatilho. */
export function excluirItemSelecionado(doc: Doc, s: ItemSel): Doc {
  const t = doc.formas.find((f) => f.id === s.formaId);
  if (!t) return doc;
  const p = propsTabela(t);
  let novo: Forma;
  if (s.tipo === 'campo') novo = removerCampo(t, s.id);
  else if (s.tipo === 'constraint') novo = sincronizarFlags({ ...t, props: { ...t.props, constraints: p.constraints.filter((c) => c.id !== s.id) } });
  else if (s.tipo === 'indice') novo = { ...t, props: { ...t.props, indices: p.indices.filter((c) => c.id !== s.id) } };
  else novo = { ...t, props: { ...t.props, gatilhos: p.gatilhos.filter((c) => c.id !== s.id) } };
  return atualizarProps({ ...doc, formas: doc.formas.map((f) => (f.id === t.id ? novo : f)) }, t.id, {});
}

/**
 * Ferramenta Apagar sobre uma tabela: se o clique cai num campo ou numa IR,
 * só esse item some; devolve null quando não há item (aí o chamador apaga a tabela inteira).
 */
export function apagarSubItemNoPonto(doc: Doc, t: Forma, x: number, y: number, tamFonte = 12): Doc | null {
  const it = itemNoPonto(t, y, tamFonte, x);
  if (!it || (it.tipo !== 'campo' && it.tipo !== 'constraint')) return null;
  return excluirItemSelecionado(doc, it);
}

/** Conceitual: sobe/desce um atributo entre os atributos do mesmo dono (a ordem das ligações é a ordem dos campos). */
export function moverAtributo(doc: Doc, attrId: string, delta: -1 | 1): Doc {
  const idx = doc.ligacoes.findIndex((l) => l.para === attrId && doc.formas.some((f) => f.id === l.de));
  if (idx < 0) return doc;
  const dono = doc.ligacoes[idx].de;
  const irmas = doc.ligacoes
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.de === dono && ['atributo', 'atributoMulti'].includes(doc.formas.find((f) => f.id === l.para)?.kind ?? ''));
  const pos = irmas.findIndex((x) => x.i === idx);
  const alvo = irmas[pos + delta];
  if (!alvo) return doc;
  const ligacoes = doc.ligacoes.slice();
  [ligacoes[idx], ligacoes[alvo.i]] = [ligacoes[alvo.i], ligacoes[idx]];
  return { ...doc, ligacoes };
}

export function podeMoverAtributo(doc: Doc, attrId: string, delta: -1 | 1): boolean {
  return moverAtributo(doc, attrId, delta) !== doc;
}
