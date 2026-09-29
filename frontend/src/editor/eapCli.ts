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

import { LARG_BARRA, organizarEapCompleto } from './organizar';
import { Diagrama, Forma, Ligacao, novoId } from './types';

/**
 * Construtor de EAP: a partir de um "quadro principal" e de uma lista de processos
 * (um por linha) cria os processos, a barra de ligação e as ligações, e organiza toda a hierarquia.
 * Linhas recuadas (tab ou 2+ espaços) viram sub-processos do item anterior, cada um com a
 * sua barra.
 */

export type OrganizacaoEap = 'vertical' | 'horizontal-centro' | 'horizontal-esquerda' | 'horizontal-direita';

export const ORGANIZACOES_EAP: { valor: OrganizacaoEap; rotulo: string }[] = [
  { valor: 'vertical', rotulo: 'Vertical' },
  { valor: 'horizontal-centro', rotulo: 'Horizontal (centro)' },
  { valor: 'horizontal-esquerda', rotulo: 'Horizontal à esquerda' },
  { valor: 'horizontal-direita', rotulo: 'Horizontal à direita' },
];

export interface NoEap { texto: string; filhos: NoEap[] }

export interface OpcoesEap {
  principal: string;
  /** Texto dos processos, um por linha; recuo cria sub-processos. */
  processos: string;
  organizacao: OrganizacaoEap;
  x: number;
  y: number;
  larguraProcesso?: number;
  alturaProcesso?: number;
}

const recuoDe = (linha: string): number => {
  const m = /^[\t ]*/.exec(linha)![0];
  return m.replace(/\t/g, '  ').length;
};

/** Converte as linhas recuadas em árvore (o recuo relativo ao item anterior define o pai). */
export function analisarProcessos(texto: string): NoEap[] {
  const raizes: NoEap[] = [];
  const pilha: { recuo: number; no: NoEap }[] = [];
  for (const bruta of texto.split('\n')) {
    if (!bruta.trim()) continue;
    const recuo = recuoDe(bruta);
    const no: NoEap = { texto: bruta.trim(), filhos: [] };
    while (pilha.length && pilha[pilha.length - 1].recuo >= recuo) pilha.pop();
    if (pilha.length) pilha[pilha.length - 1].no.filhos.push(no);
    else raizes.push(no);
    pilha.push({ recuo, no });
  }
  return raizes;
}

export interface ResultadoEap { doc: Diagrama; erro?: string; idsCriados: string[] }

const forma = (kind: string, texto: string, x: number, y: number, w: number, h: number, props: Record<string, unknown> = {}): Forma => ({
  id: novoId(), kind, x, y, w, h, texto, props,
});

/**
 * Cria a EAP no diagrama. Exige pelo menos dois processos no total (o quadro principal + 1)
 * ("Erro ao informar a quantidade de processos").
 */
export function construirEap(doc: Diagrama, o: OpcoesEap): ResultadoEap {
  const filhos = analisarProcessos(o.processos);
  if (!o.principal.trim() || filhos.length < 1) {
    return { doc, idsCriados: [], erro: 'Informe o quadro principal e ao menos um processo (um por linha).' };
  }
  const w = o.larguraProcesso ?? 120;
  const h = o.alturaProcesso ?? 58;
  const formas: Forma[] = [];
  const ligacoes: Ligacao[] = [];
  const dir = o.organizacao === 'vertical' ? 'Vertical' : 'Horizontal';
  const posicao = o.organizacao === 'horizontal-esquerda' ? 'Esquerda' : o.organizacao === 'horizontal-direita' ? 'Direita' : 'Centro';
  const lig = (de: string, para: string, papel: 'pai' | 'filho'): Ligacao => ({ id: novoId(), kind: 'eapLigacao', de, para, texto: '', cardDe: '', cardPara: '', props: { papel } });

  let barraRaiz = '';
  const criar = (no: NoEap, x: number, y: number): Forma => {
    const p = forma('eapProcesso', no.texto, x, y, w, h);
    formas.push(p);
    if (no.filhos.length) {
      const barra = forma('eapBarraLigacao', '', x, y + h + 20, dir === 'Vertical' ? LARG_BARRA : w, dir === 'Vertical' ? w : LARG_BARRA, { direcao: dir, posicao, distancia: LARG_BARRA });
      formas.push(barra);
      if (!barraRaiz) barraRaiz = barra.id;
      ligacoes.push(lig(p.id, barra.id, 'pai'));
      no.filhos.forEach((f, i) => {
        const c = criar(f, x + i * (w + 10), y + h + 60);
        ligacoes.push(lig(c.id, barra.id, 'filho'));
      });
    }
    return p;
  };
  criar({ texto: o.principal.trim(), filhos }, Math.max(0, o.x), Math.max(0, o.y));
  const novo: Diagrama = { ...doc, formas: [...doc.formas, ...formas], ligacoes: [...doc.ligacoes, ...ligacoes] };
  return { doc: organizarEapCompleto(novo, barraRaiz), idsCriados: formas.map((f) => f.id) };
}
