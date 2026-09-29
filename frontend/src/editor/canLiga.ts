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

import { Diagrama, Forma, Ligacao } from './types';

/**
 * Regras de ligação: entidade, relacionamento, atributo, especialização, processo/barra da EAP, raia de atividade,
 * legenda e desenhador (seta/desenho livre). Quando a ligação não é permitida a ponta não gruda e o motivo vira
 * mensagem de status (pt-BR).
 *
 * Convenção de armazenamento no Conceitual: ligações de atributo ficam sempre dono -> atributo (de = dono, para = atributo).
 */

export interface ResultadoLigacao {
  ok: boolean;
  /** Motivo da recusa (pt-BR), quando !ok. */
  motivo?: string;
  /** Extremos já normalizados (dono -> atributo; entidade -> relacionamento). */
  de: string;
  para: string;
}

export interface OpcoesLigacao {
  /** Clique no losango interno da Entidade Associativa (ela age como relacionamento). */
  internoDe?: boolean;
  internoPara?: boolean;
}

type Papel = 'ent' | 'rel' | 'attr' | 'esp' | 'outro';

const ehAttr = (k: string) => k === 'atributo' || k === 'atributoMulti';
const ehEsp = (k: string) => k.startsWith('especializacao') || k.startsWith('uniao');

function papelDe(f: Forma, interno?: boolean): Papel {
  if (f.kind === 'entidade') return 'ent';
  if (f.kind === 'entidadeAssociativa') return interno ? 'rel' : 'ent';
  if (f.kind === 'relacionamento' || f.kind === 'autorelacionamento') return 'rel';
  if (ehAttr(f.kind)) return 'attr';
  if (ehEsp(f.kind)) return 'esp';
  return 'outro';
}

const recusa = (motivo: string, de: string, para: string): ResultadoLigacao => ({ ok: false, motivo, de, para });
const aceita = (de: string, para: string): ResultadoLigacao => ({ ok: true, de, para });

/** Ligações em que a forma participa, descontando a ligação ignorada. */
const ligacoesDe = (doc: Diagrama, id: string, ignorar?: string): Ligacao[] =>
  doc.ligacoes.filter((l) => l.kind === 'linha' && l.id !== ignorar && (l.de === id || l.para === id));

const outraPonta = (l: Ligacao, id: string) => (l.de === id ? l.para : l.de);
const formaDe = (doc: Diagrama, id: string) => doc.formas.find((f) => f.id === id);

/** Ligação principal do atributo (com o dono): a que chega nele vinda de um não-atributo ou de um atributo dono. */
export function ligacaoPrincipalDoAtributo(doc: Diagrama, attrId: string, ignorar?: string): Ligacao | undefined {
  return ligacoesDe(doc, attrId, ignorar).find((l) => {
    if (l.para === attrId) return true; // dono -> atributo
    const o = formaDe(doc, l.para);
    return !!o && !ehAttr(o.kind); // legado: atributo -> dono
  });
}

/** Dono (subindo a cadeia de compostos) para detectar ciclos. */
function ancestrais(doc: Diagrama, id: string): Set<string> {
  const res = new Set<string>();
  let atual = id;
  for (let i = 0; i < 100; i++) {
    const l = ligacaoPrincipalDoAtributo(doc, atual);
    if (!l) break;
    const dono = l.para === atual ? l.de : l.para;
    if (res.has(dono)) break;
    res.add(dono);
    atual = dono;
  }
  return res;
}

/** Entidades ligadas ao relacionamento, na ordem das ligações. */
function entidadesLigadas(doc: Diagrama, relId: string, ignorar?: string): string[] {
  const out: string[] = [];
  for (const l of ligacoesDe(doc, relId, ignorar)) {
    const o = formaDe(doc, outraPonta(l, relId));
    if (o && (o.kind === 'entidade' || o.kind === 'entidadeAssociativa')) out.push(o.id);
  }
  return out;
}

function conceitualLinha(doc: Diagrama, a: Forma, b: Forma, o: OpcoesLigacao): ResultadoLigacao {
  const pa = papelDe(a, o.internoDe);
  const pb = papelDe(b, o.internoPara);
  const par = (x: Papel, y: Papel) => (pa === x && pb === y) || (pa === y && pb === x);
  const semRel = 'Um relacionamento só liga entidades e atributos.';

  if (pa === 'ent' && pb === 'ent') {
    return recusa('Entidades não podem ser ligadas diretamente: use um relacionamento.', a.id, b.id);
  }
  if (pa === 'outro' || pb === 'outro') return aceita(a.id, b.id);

  if (par('rel', 'rel') || par('rel', 'esp')) return recusa(semRel, a.id, b.id);
  if (par('esp', 'esp')) return recusa('Especialização e união só ligam entidades.', a.id, b.id);
  if (par('attr', 'esp')) return recusa('Especialização e união só ligam entidades.', a.id, b.id);

  if (par('ent', 'esp')) {
    const ent = pa === 'ent' ? a : b;
    if (ent.kind !== 'entidade') return recusa('Especialização e união só ligam entidades.', a.id, b.id);
    return aceita(a.id, b.id);
  }

  if (par('ent', 'rel')) {
    const rel = pa === 'rel' ? a : b;
    const ent = pa === 'ent' ? a : b;
    const lst = entidadesLigadas(doc, rel.id);
    if (lst.length === 2 && lst[0] === lst[1]) {
      return recusa('Este auto-relacionamento já está completo (duas ligações com a mesma entidade).', ent.id, rel.id);
    }
    const interno = pa === 'rel' ? o.internoDe : o.internoPara;
    if (rel.kind === 'entidadeAssociativa' && interno) {
      if (lst.includes(ent.id)) return recusa('A entidade associativa não pode ser auto-relacionamento.', ent.id, rel.id);
    } else if (lst.includes(ent.id) && lst.length > 1) {
      return recusa('A entidade já está ligada a este relacionamento e ele possui outra ligação: não pode ser auto-relacionamento.', ent.id, rel.id);
    }
    return aceita(ent.id, rel.id);
  }

  // Atributo com dono (entidade, relacionamento, associativa) ou com outro atributo.
  if (pa === 'attr' && pb === 'attr') {
    const pA = ligacaoPrincipalDoAtributo(doc, a.id);
    const pB = ligacaoPrincipalDoAtributo(doc, b.id);
    if (pA && pB) return recusa('Os dois atributos já possuem ligação principal (cada atributo tem um só dono).', a.id, b.id);
    //# O filho é quem ainda não tem dono; se ambos estão livres, o primeiro clique é o dono.
    const [dono, filho] = !pB ? [a, b] : [b, a];
    if (ancestrais(doc, dono.id).has(filho.id)) {
      return recusa('O atributo não pode ser ligado a um dos seus próprios sub-atributos.', dono.id, filho.id);
    }
    return aceita(dono.id, filho.id);
  }
  const attr = pa === 'attr' ? a : b;
  const dono = pa === 'attr' ? b : a;
  if (ligacaoPrincipalDoAtributo(doc, attr.id)) {
    return recusa('O atributo já possui a ligação principal com o dono: um atributo só pode ter uma.', dono.id, attr.id);
  }
  return aceita(dono.id, attr.id);
}

const ehProcesso = (f: Forma) => f.kind === 'eapProcesso';
const ehBarra = (f: Forma) => f.kind === 'eapBarraLigacao';

function eapLinha(doc: Diagrama, a: Forma, b: Forma): ResultadoLigacao {
  if (ehProcesso(a) && ehProcesso(b)) return aceita(a.id, b.id); // a ferramenta cria a barra no meio
  const proc = ehProcesso(a) ? a : ehProcesso(b) ? b : undefined;
  const barra = ehBarra(a) ? a : ehBarra(b) ? b : undefined;
  if (!proc || !barra) return recusa('Na EAP, a junção só se liga a processos (e o processo só a junções).', a.id, b.id);
  const eap = doc.ligacoes.filter((l) => l.kind === 'eapLigacao');
  if (eap.some((l) => (l.de === proc.id && l.para === barra.id) || (l.de === barra.id && l.para === proc.id))) {
    return recusa('O processo já está ligado a esta junção.', a.id, b.id);
  }
  const temPai = eap.some((l) => (l.para === barra.id || l.de === barra.id) && l.props.papel === 'pai');
  if (temPai && eap.some((l) => (l.de === proc.id || l.para === proc.id) && l.props.papel === 'filho')) {
    return recusa('O processo já é filho de outra junção (um processo tem um só pai).', a.id, b.id);
  }
  return aceita(a.id, b.id);
}

/**
 * Decide se `de` e `para` podem ser ligados com uma ligação do tipo `kind` (2 cliques da ferramenta ou arrasto de ponta).
 * Devolve os extremos normalizados (dono -> atributo). Ligações sem regra própria são aceitas.
 */
export function validarLigacao(doc: Diagrama, kind: string, deId: string, paraId: string, o: OpcoesLigacao = {}): ResultadoLigacao {
  const a = formaDe(doc, deId);
  const b = formaDe(doc, paraId);
  if (!a || !b) return aceita(deId, paraId); // pontas soltas / em outra linha: sem regras de forma
  if (a.id === b.id) return recusa('Não é possível ligar um objeto a ele mesmo.', deId, paraId);
  for (const f of [a, b]) {
    if (f.kind === 'legenda') return recusa('A legenda não aceita ligações.', deId, paraId);
    if (f.kind === 'raiaAtividade') return recusa('A raia não aceita ligações.', deId, paraId);
    if (f.kind === 'desenhador' && (f.props.tipoDesenho === 'seta' || f.props.tipoDesenho === 'livre')) {
      return recusa('Este desenho não aceita ligações.', deId, paraId);
    }
  }
  if (doc.tipo === 'conceitual' && kind === 'linha') return conceitualLinha(doc, a, b, o);
  if (kind === 'eapLigacao') return eapLinha(doc, a, b);
  return aceita(deId, paraId);
}

/**
 * Normaliza ligações antigas do Conceitual: atributo -> dono vira dono -> atributo (o atributo acompanha o dono ao mover).
 * Ligações atributo-atributo ficam como estão.
 */
export function normalizarLigacoesDeAtributo(doc: Diagrama): Diagrama {
  if (doc.tipo !== 'conceitual') return doc;
  let mudou = false;
  const ligacoes = doc.ligacoes.map((l) => {
    if (l.kind !== 'linha') return l;
    const a = formaDe(doc, l.de);
    const b = formaDe(doc, l.para);
    if (a && b && ehAttr(a.kind) && !ehAttr(b.kind) && !ehEsp(b.kind)) {
      mudou = true;
      return { ...l, de: l.para, para: l.de };
    }
    return l;
  });
  return mudou ? { ...doc, ligacoes } : doc;
}
