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

import { useSyncExternalStore } from 'react';
import { itemNoPonto } from './itemSel';
import { propsTabela } from './logico';
import { ConstraintTabela, Diagrama, Forma } from './types';

/**
 * "Roqued": ao passar o mouse numa LogicoLinha
 * ou numa linha de IR do tipo FK, os campos e as IR envolvidos (nas duas tabelas) ganham caixa pontilhada e o ícone
 * see.png, e a linha fica com o dobro da espessura. Estado só de interface; nada vai para o modelo.
 */

export interface RoqueAlvo { ligacaoId?: string; tabelaId?: string; constraintId?: string }

export interface Realce {
  campos: Set<string>;
  constraints: Set<string>;
  ligacoes: Set<string>;
}

let atual: RoqueAlvo | null = null;
const ouvintes = new Set<() => void>();
const inscrever = (fn: () => void) => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; };

export const roqueAtual = (): RoqueAlvo | null => atual;
export const useRoque = (): RoqueAlvo | null => useSyncExternalStore(inscrever, roqueAtual, roqueAtual);

const iguais = (a: RoqueAlvo | null, b: RoqueAlvo | null) =>
  a === b || (!!a && !!b && a.ligacaoId === b.ligacaoId && a.tabelaId === b.tabelaId && a.constraintId === b.constraintId);

export function definirRoque(r: RoqueAlvo | null) {
  if (iguais(atual, r)) return;
  atual = r;
  ouvintes.forEach((f) => f());
}

const ehTabela = (f: Forma) => Array.isArray(f.props.campos) && Array.isArray(f.props.constraints);
const ligacaoEntre = (doc: Diagrama, a: string, b: string) =>
  doc.ligacoes.filter((l) => l.kind === 'logicoLinha' && ((l.de === a && l.para === b) || (l.de === b && l.para === a)));

/** O que realçar para o alvo (vazio se o alvo não existe mais). */
export function realceDoRoque(doc: Diagrama, alvo: RoqueAlvo | null): Realce {
  const r: Realce = { campos: new Set(), constraints: new Set(), ligacoes: new Set() };
  if (!alvo) return r;
  const tabelas = new Map(doc.formas.filter(ehTabela).map((f) => [f.id, f]));
  const addFk = (tid: string, c: ConstraintTabela) => {
    r.constraints.add(c.id);
    c.camposDestino.forEach((x) => x && r.campos.add(x));
    c.camposOrigem.forEach((x) => x && r.campos.add(x));
    const o = c.constraintOrigem;
    if (!o) return;
    const cOrg = tabelas.get(o.tabelaId) && propsTabela(tabelas.get(o.tabelaId)!).constraints[o.indice];
    if (cOrg) r.constraints.add(cOrg.id);
    if (o.tabelaId !== tid) ligacaoEntre(doc, tid, o.tabelaId).forEach((l) => r.ligacoes.add(l.id));
  };
  if (alvo.ligacaoId) {
    const l = doc.ligacoes.find((x) => x.id === alvo.ligacaoId && x.kind === 'logicoLinha');
    if (!l) return r;
    r.ligacoes.add(l.id);
    for (const [tid, outro] of [[l.de, l.para], [l.para, l.de]]) {
      const t = tabelas.get(tid);
      if (!t) continue;
      for (const c of propsTabela(t).constraints) if (c.tipo === 'FK' && c.constraintOrigem?.tabelaId === outro) addFk(tid, c);
    }
  } else if (alvo.tabelaId && alvo.constraintId) {
    const t = tabelas.get(alvo.tabelaId);
    const c = t && propsTabela(t).constraints.find((x) => x.id === alvo.constraintId && x.tipo === 'FK');
    if (t && c) addFk(t.id, c);
  }
  return r;
}

/** Alvo sob o ponteiro: uma LogicoLinha ou uma IR de FK numa tabela. */
export function alvoDoPonteiro(doc: Diagrama, x: number, y: number, idLigacao: string | null, forma: Forma | undefined, tamFonte: number): RoqueAlvo | null {
  if (doc.tipo !== 'logico') return null;
  if (idLigacao && doc.ligacoes.some((l) => l.id === idLigacao && l.kind === 'logicoLinha')) return { ligacaoId: idLigacao };
  if (forma && ehTabela(forma)) {
    const it = itemNoPonto(forma, y, tamFonte, x);
    if (it?.tipo === 'constraint' && propsTabela(forma).constraints.find((c) => c.id === it.id)?.tipo === 'FK') return { tabelaId: forma.id, constraintId: it.id };
  }
  return null;
}

/** Hook do Canvas: chamado a cada movimento do mouse sem arrasto. */
export function atualizarRoque(doc: Diagrama, x: number, y: number, idLigacao: string | null, forma: Forma | undefined) {
  if (doc.tipo !== 'logico') { if (atual) definirRoque(null); return; }
  definirRoque(alvoDoPonteiro(doc, x, y, idLigacao, forma, forma?.fonte?.tamanho ?? doc.fonte.tamanho));
}

/** A ligação está realçada (espessura x2)? Só calcula quando há um alvo sob o mouse. */
export function useRoqueLigacao(doc: Diagrama, ligacaoId: string): boolean {
  const alvo = useRoque();
  if (!alvo) return false;
  return alvo.ligacaoId === ligacaoId || realceDoRoque(doc, alvo).ligacoes.has(ligacaoId);
}
