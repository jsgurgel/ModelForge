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

import { centro, reenquadrar } from './geometry';
import { Doc, atualizarForma, atualizarProps, nomeLivre } from './ops';
import { Forma, Ligacao, novoId } from './types';

const ehAttr = (k: string) => k === 'atributo' || k === 'atributoMulti';
const ehEnt = (k: string) => k === 'entidade' || k === 'entidadeAssociativa';
const ehEsp = (k: string) => k.startsWith('especializacao');
const ehUniao = (k: string) => k === 'uniao' || k === 'uniaoEntidades';

export const formaPorId = (doc: Doc, id: string): Forma | undefined => doc.formas.find((f) => f.id === id);

/** Atributos ligados a um dono (entidade, relacionamento, associativa ou outro atributo), na ordem das ligações. */
export function atributosDe(doc: Doc, donoId: string): Forma[] {
  return doc.ligacoes
    .filter((l) => l.de === donoId)
    .map((l) => formaPorId(doc, l.para))
    .filter((f): f is Forma => !!f && ehAttr(f.kind));
}

export const donoDoAtributo = (doc: Doc, attrId: string): Forma | undefined => {
  const l = doc.ligacoes.find((x) => x.para === attrId && formaPorId(doc, x.de));
  return l ? formaPorId(doc, l.de) : undefined;
};

export const ehComposto = (doc: Doc, attrId: string) => atributosDe(doc, attrId).length > 0;

/** Formas ligadas (pelas ligações) a uma forma, para a lista "Ligações" do Inspector. */
export function formasLigadas(doc: Doc, id: string): Forma[] {
  const ids = new Set<string>();
  for (const l of doc.ligacoes) {
    if (l.de === id) ids.add(l.para);
    else if (l.para === id) ids.add(l.de);
  }
  return [...ids].map((i) => formaPorId(doc, i)).filter((f): f is Forma => !!f);
}

export const ehAutoRelacionamento = (doc: Doc, relId: string): boolean => {
  const ents = doc.ligacoes.filter((l) => l.para === relId && ehEnt(formaPorId(doc, l.de)?.kind ?? '')).map((l) => l.de);
  return ents.length === 2 && ents[0] === ents[1];
};

export interface InfoEspecializacao {
  malformada: boolean;
  exclusiva: boolean;
  naoExclusiva: boolean;
  parcial: boolean;
  total: boolean;
  principal?: Forma;
}

/** Ligação da entidade "de onde parte" a especialização/união (o ponto principal do triângulo). */
export function principalDe(doc: Doc, formaId: string): Forma | undefined {
  const l = doc.ligacoes.find((x) => (x.para === formaId || x.de === formaId) && x.props.principal);
  if (!l) return undefined;
  return formaPorId(doc, l.de === formaId ? l.para : l.de);
}

export function infoEspecializacao(doc: Doc, esp: Forma): InfoEspecializacao {
  const ligadas = formasLigadas(doc, esp.id);
  const principal = principalDe(doc, esp.id);
  let exclusiva = false;
  if (principal && ligadas.length > 1) {
    const outras = formasLigadas(doc, principal.id).filter((f) => ehEsp(f.kind) && principalDe(doc, f.id)?.id === principal.id);
    exclusiva = outras.length === 1;
  }
  const naoExclusiva = !exclusiva && !!principal && ligadas.length > 1;
  //# "Parcial" só vale com mais de uma ligação e o ponto principal ocupado.
  const parcial = parcialEfetiva(doc, esp);
  const total = !parcial && !!principal;
  return { malformada: (!exclusiva && !naoExclusiva) || (!parcial && !total), exclusiva, naoExclusiva, parcial, total, principal };
}

/** Parcial efetiva: >1 formas ligadas, entidade no ponto principal e a marca `parcial`. */
export function parcialEfetiva(doc: Doc, esp: Forma): boolean {
  return !!esp.props.parcial && formasLigadas(doc, esp.id).length > 1 && !!principalDe(doc, esp.id);
}

/**
 * Faixa cheia no lado do triângulo e posição do "p", em coordenadas locais da forma.
 * Up/Down: faixa de altura h/8 no topo/base; Right/Left: faixa de largura w/8 na direita/esquerda.
 */
export function pontoEBandaParcial(dir: string, w: number, h: number, tamFonte: number) {
  const bh = Math.floor(h / 8);
  const bw = Math.floor(w / 8);
  const fw = Math.ceil(tamFonte * 0.56); // largura de "p"
  const fh = Math.ceil((tamFonte * 1.15) / 2);
  switch (dir) {
    case 'Right': return { banda: { x: w - bw, y: 0, w: bw, h }, letra: { x: w / 2 - fw / 2, y: fh } };
    case 'Down': return { banda: { x: 0, y: h - bh, w, h: bh }, letra: { x: w - fw, y: h / 2 + fh / 2 } };
    case 'Left': return { banda: { x: 0, y: 0, w: bw, h }, letra: { x: w / 2 - fw / 2, y: fh } };
    default: return { banda: { x: 0, y: 0, w, h: bh }, letra: { x: w - fw, y: h / 2 + fh / 2 } };
  }
}

/** Retângulo do relacionamento interno da Entidade Associativa (x+8, y+8, w-18, h-18). */
export function internoDaAssociativa(f: Pick<Forma, 'w' | 'h'>): { x: number; y: number; w: number; h: number } {
  return { x: 8, y: 8, w: Math.max(4, f.w - 18), h: Math.max(4, f.h - 18) };
}

/**
 * Duplo clique no Conceitual: atributo alterna o lado (Esquerda/Direita); especialização/união gira o triângulo.
 * Devolve o novo documento ou null quando a forma não trata duplo clique.
 */
export function duploCliqueConceitual(doc: Doc, f: Forma): Doc | null {
  if (ehAttr(f.kind)) return atualizarProps(doc, f.id, { direcao: f.props.direcao === 'Right' ? 'Left' : 'Right' });
  if (ehEsp(f.kind) || ehUniao(f.kind)) {
    const ordem = ['Up', 'Right', 'Down', 'Left'];
    const atual = Math.max(0, ordem.indexOf(String(f.props.direcao ?? 'Up')));
    return atualizarProps(doc, f.id, { direcao: ordem[(atual + 1) % 4] });
  }
  return null;
}

/** Distribui os atributos do dono em volta dele (Organizar atributos): metade acima, metade abaixo. */
export function organizarAtributos(doc: Doc, donoId: string): Doc {
  const dono = formaPorId(doc, donoId);
  if (!dono) return doc;
  const attrs = atributosDe(doc, donoId);
  if (!attrs.length) return doc;
  const c = centro(dono);
  const acima = attrs.filter((_, i) => i % 2 === 0);
  const abaixo = attrs.filter((_, i) => i % 2 === 1);
  const passo = 90;
  const pos = new Map<string, { x: number; y: number }>();
  const dispor = (lista: Forma[], y: number) =>
    lista.forEach((a, i) => pos.set(a.id, { x: Math.round(c.x - ((lista.length - 1) * passo) / 2 + i * passo - a.w / 2), y }));
  dispor(acima, Math.round(dono.y - 44));
  dispor(abaixo, Math.round(dono.y + dono.h + 30));
  let res: Doc = {
    ...doc,
    formas: doc.formas.map((f) => {
      const p = pos.get(f.id);
      return p ? { ...f, x: Math.max(0, p.x), y: Math.max(0, p.y) } : f;
    }),
  };
  //# Atributos compostos levam os seus sub-atributos junto.
  for (const a of attrs) res = organizarAtributos(res, a.id);
  return res;
}

/** Cria um atributo ligado ao dono e devolve o documento. */
export function adicionarAtributo(doc: Doc, donoId: string, texto?: string): { doc: Doc; id: string } {
  const dono = formaPorId(doc, donoId);
  if (!dono) return { doc, id: '' };
  const id = novoId();
  const n = atributosDe(doc, donoId).length;
  const f: Forma = reenquadrar({
    id, kind: 'atributo', x: dono.x + n * 40, y: Math.max(0, dono.y - 44), w: 14, h: 14,
    texto: texto ?? nomeLivre(doc, 'Atributo'), props: { identificador: false, tipo: 'VARCHAR(80)' },
  });
  const l: Ligacao = { id: novoId(), kind: 'linha', de: donoId, para: id, texto: '', cardDe: '', cardPara: '', props: {} };
  return { doc: organizarAtributos({ ...doc, formas: [...doc.formas, f], ligacoes: [...doc.ligacoes, l] }, donoId), id };
}

/** Remove o atributo e os sub-atributos dele. */
export function removerAtributo(doc: Doc, attrId: string): Doc {
  const apagar = new Set<string>();
  const visita = (id: string) => {
    apagar.add(id);
    atributosDe(doc, id).forEach((a) => visita(a.id));
  };
  visita(attrId);
  return {
    ...doc,
    formas: doc.formas.filter((f) => !apagar.has(f.id)),
    ligacoes: doc.ligacoes.filter((l) => !apagar.has(l.de) && !apagar.has(l.para)),
  };
}

/** Relacionar (Inspector da entidade): cria um relacionamento entre duas entidades; a mesma entidade vira auto-relacionamento. */
export function relacionar(doc: Doc, entId: string, outraId: string): Doc {
  const a = formaPorId(doc, entId);
  const b = formaPorId(doc, outraId);
  if (!a || !b) return doc;
  const auto = a.id === b.id;
  const ca = centro(a);
  const cb = centro(b);
  const kind = auto ? 'autorelacionamento' : 'relacionamento';
  const w = 150, h = 50;
  const x = auto ? a.x + a.w + 60 : Math.round((ca.x + cb.x) / 2 - w / 2);
  const y = auto ? Math.round(ca.y - h / 2) : Math.round((ca.y + cb.y) / 2 - h / 2);
  const rid = novoId();
  const rel: Forma = { id: rid, kind, x: Math.max(0, x), y: Math.max(0, y), w, h, texto: nomeLivre(doc, auto ? 'Auto Rel.' : 'Relacionamento'), props: {} };
  const mk = (de: string): Ligacao => ({ id: novoId(), kind: 'linha', de, para: rid, texto: '', cardDe: '(0,n)', cardPara: '', props: {} });
  return { ...doc, formas: [...doc.formas, rel], ligacoes: [...doc.ligacoes, mk(a.id), mk(b.id)] };
}

export function relacionamentoParaAssociativa(doc: Doc, relId: string): Doc {
  const r = formaPorId(doc, relId);
  if (!r || ehAutoRelacionamento(doc, relId)) return doc;
  const pronto = atualizarForma(doc, relId, { kind: 'entidadeAssociativa', w: 158, h: 58 });
  const interno = { texto: r.texto, descricao: String(r.props.descricao ?? ''), observacao: String(r.props.observacao ?? '') };
  const res = atualizarProps(pronto, relId, { interno, atributosOcultos: '' });
  //# As ligações que chegavam ao relacionamento passam a pertencer ao seu relacionamento interno.
  return {
    ...res,
    ligacoes: res.ligacoes.map((l) => (l.para === relId || l.de === relId ? { ...l, props: { ...l.props, interno: true } } : l)),
  };
}

export function associativaParaRelacionamento(doc: Doc, assocId: string): Doc {
  const a = formaPorId(doc, assocId);
  if (!a) return doc;
  const interno = (a.props.interno as { texto?: string; descricao?: string; observacao?: string } | undefined) ?? {};
  let res = atualizarForma(doc, assocId, { kind: 'relacionamento', w: 150, h: 50, texto: interno.texto || a.texto });
  res = atualizarProps(res, assocId, { descricao: interno.descricao ?? '', observacao: interno.observacao ?? '' });
  //# Ligações da associativa atuando como entidade não fazem sentido num relacionamento simples: saem.
  return {
    ...res,
    ligacoes: res.ligacoes
      .filter((l) => !((l.para === assocId || l.de === assocId) && !l.props.interno))
      .map((l) => (l.props.interno ? { ...l, props: { ...l.props, interno: false } } : l)),
  };
}

export const tiposLigacaoConceitual = { ehAttr, ehEnt, ehEsp, ehUniao };
