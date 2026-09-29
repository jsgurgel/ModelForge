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

import { Ponto } from './geometry';
import { caminhoDaLigacao } from './roteamento';
import { pontoDeConexao } from './roteamentoInteligente';
import { Diagrama, Forma, Ligacao, novoId } from './types';

/**
 * Pontas soltas: em Fluxo/Atividade/Livre o extremo de uma linha pode
 * ficar em área vazia, grudar em outra linha ou num dos 8 pontos de ligação de uma forma.
 * Modelo: `de`/`para` = '' (ponto livre) ou id de outra ligação; o ponto fica em props.pontaA/pontaB; props.conexaoA/B (0-7).
 */

export const TIPOS_COM_PONTA_SOLTA = ['fluxo', 'atividade', 'livre'] as const;
export const aceitaPontaSolta = (doc: Pick<Diagrama, 'tipo'>, kind: string): boolean =>
  (TIPOS_COM_PONTA_SOLTA as readonly string[]).includes(doc.tipo) && kind !== 'eapLigacao' && kind !== 'logicoLinha';

export type Ponta = 'A' | 'B';
export type AlvoDePonta = { forma: string } | { ligacao: string; ponto: Ponto } | { ponto: Ponto };

const chaveId = (p: Ponta) => (p === 'A' ? 'de' : 'para');
const chaveLivre = (p: Ponta) => (p === 'A' ? 'pontaA' : 'pontaB');
const chaveConexao = (p: Ponta) => (p === 'A' ? 'conexaoA' : 'conexaoB');

const arred = (p: Ponto): Ponto => ({ x: Math.round(p.x), y: Math.round(p.y) });

/** Índice (0-7) do ponto de ligação da forma mais próximo de p. */
export function conexaoMaisProxima(f: Forma, p: Ponto): number {
  let melhor = 4;
  let menor = Infinity;
  for (let i = 0; i < 8; i++) {
    const q = pontoDeConexao(f, i);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < menor) { menor = d; melhor = i; }
  }
  return melhor;
}

/** Aplica um alvo a uma ponta: forma (com o ponto de ligação mais próximo), outra linha ou ponto livre. */
export function aplicarAlvoNaPonta(doc: Diagrama, ligId: string, ponta: Ponta, alvo: AlvoDePonta): Diagrama {
  return {
    ...doc,
    ligacoes: doc.ligacoes.map((l) => {
      if (l.id !== ligId) return l;
      const props: Record<string, unknown> = { ...l.props };
      delete props[chaveLivre(ponta)];
      delete props[chaveConexao(ponta)];
      let id = '';
      if ('forma' in alvo) id = alvo.forma;
      else if ('ligacao' in alvo) { id = alvo.ligacao; props[chaveLivre(ponta)] = arred(alvo.ponto); }
      else props[chaveLivre(ponta)] = arred(alvo.ponto);
      return { ...l, [chaveId(ponta)]: id, props } as Ligacao;
    }),
  };
}

/** Escolhe o ponto de ligação da forma mais próximo do ponto solto onde a ponta foi largada. */
export function prenderPontaNaForma(doc: Diagrama, ligId: string, ponta: Ponta, formaId: string, onde: Ponto): Diagrama {
  const f = doc.formas.find((x) => x.id === formaId);
  if (!f) return doc;
  const res = aplicarAlvoNaPonta(doc, ligId, ponta, { forma: formaId });
  const i = conexaoMaisProxima(f, onde);
  return { ...res, ligacoes: res.ligacoes.map((l) => (l.id === ligId ? { ...l, props: { ...l.props, [chaveConexao(ponta)]: i } } : l)) };
}

/** Cria uma ligação com as pontas dadas (forma ou ponto livre), pulando ligações a si mesmas. */
export function ligacaoComPontasSoltas(
  doc: Diagrama, kind: string, de: { forma?: string; ponto: Ponto }, para: { forma?: string; ponto: Ponto },
): { doc: Diagrama; id: string } {
  const l: Ligacao = { id: novoId(), kind, de: de.forma ?? '', para: para.forma ?? '', texto: '', cardDe: '', cardPara: '', props: {} };
  if (!de.forma) l.props.pontaA = arred(de.ponto);
  if (!para.forma) l.props.pontaB = arred(para.ponto);
  return { doc: { ...doc, ligacoes: [...doc.ligacoes, l] }, id: l.id };
}

/** Linha (que não seja a própria) sob o ponto, para grudar uma ponta nela. */
export function ligacaoNoPonto(doc: Diagrama, p: Ponto, ignorar?: string, raio = 6): { id: string; ponto: Ponto } | null {
  for (const l of doc.ligacoes) {
    if (l.id === ignorar || l.de === ignorar || l.para === ignorar) continue;
    const c = caminhoDaLigacao(doc, l);
    if (!c) continue;
    for (let i = 0; i < c.pontos.length - 1; i++) {
      const a = c.pontos[i];
      const b = c.pontos[i + 1];
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const n = vx * vx + vy * vy;
      const t = n === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / n));
      const q = { x: a.x + vx * t, y: a.y + vy * t };
      if (Math.hypot(p.x - q.x, p.y - q.y) <= raio) return { id: l.id, ponto: q };
    }
  }
  return null;
}

/**
 * "Propague apagar" desligado: em vez de recusar, as ligações das formas apagadas ficam com a ponta solta onde estavam.
 * Só vale para Fluxo/Atividade/Livre; devolve o documento sem as formas.
 */
export function apagarFormasSoltandoPontas(doc: Diagrama, ids: string[]): Diagrama {
  const s = new Set(ids);
  const ligacoes = doc.ligacoes.map((l) => {
    if (!aceitaPontaSolta(doc, l.kind) || s.has(l.id)) return l;
    let r = l;
    for (const ponta of ['A', 'B'] as const) {
      const id = ponta === 'A' ? l.de : l.para;
      if (!s.has(id)) continue;
      const c = caminhoDaLigacao(doc, l);
      const p = c ? (ponta === 'A' ? c.a : c.b) : { x: 0, y: 0 };
      const props: Record<string, unknown> = { ...r.props, [chaveLivre(ponta)]: arred(p) };
      delete props[chaveConexao(ponta)];
      r = { ...r, [chaveId(ponta)]: '', props } as Ligacao;
    }
    return r;
  });
  return {
    ...doc,
    formas: doc.formas.filter((f) => !s.has(f.id)),
    ligacoes: ligacoes.filter((l) => !s.has(l.id) && (s.has(l.de) || s.has(l.para) ? false : true)),
  };
}
