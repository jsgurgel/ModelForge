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
import { internoDaAssociativa } from './conceitual';
import { Doc, adicionarForma, novaForma, novaLigacao } from './ops';
import { ladoMaisProximo } from './roteamento';
import { Forma, Ligacao, novoId } from './types';

/**
 * Comportamentos de criação do Conceitual: ferramentas que criam vários
 * objetos de uma vez. Tudo puro: recebe o documento e devolve o novo documento + ids criados (o primeiro é o principal).
 */
export interface Resultado {
  doc: Doc;
  ids: string[];
}

const ehEnt = (k?: string) => k === 'entidade' || k === 'entidadeAssociativa';
const ehRelKind = (k?: string) => k === 'relacionamento' || k === 'autorelacionamento';
const ehAttrKind = (k?: string) => k === 'atributo' || k === 'atributoMulti';
const ehEspUniao = (k?: string) => !!k && (k.startsWith('especializacao') || k.startsWith('uniao'));
/** Formas que podem ser donas de atributos. */
const ehDono = (k?: string) => ehEnt(k) || ehRelKind(k) || ehAttrKind(k);

const linha = (de: string, para: string, extra: Partial<Ligacao> = {}, props: Record<string, unknown> = {}): Ligacao => ({
  id: novoId(), kind: 'linha', de, para, texto: '', cardDe: '', cardPara: '', props, ...extra,
});

/** Cria a forma com o canto superior esquerdo em (x, y) e o tamanho padrão (ou o informado). */
function formaEmCanto(doc: Doc, kind: string, x: number, y: number, tam?: { w: number; h: number }): Forma {
  const base = novaForma(doc, kind, 0, 0);
  const w = tam?.w ?? base.w;
  const h = tam?.h ?? base.h;
  return { ...base, x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)), w, h };
}

/** Numa Entidade Associativa: clique dentro do losango interno (relacionamento) ou fora (parte "entidade"). */
export function zonaAssociativa(f: Forma, p: Ponto): 'interna' | 'externa' {
  if (f.kind !== 'entidadeAssociativa') return 'externa';
  //# O relacionamento interno ocupa (8, 8, w-18, h-18).
  const ri = internoDaAssociativa(f);
  const cx = f.x + ri.x + ri.w / 2;
  const cy = f.y + ri.y + ri.h / 2;
  const a = ri.w / 2;
  const b = ri.h / 2;
  if (a <= 0 || b <= 0) return 'externa';
  return Math.abs(p.x - cx) / a + Math.abs(p.y - cy) / b <= 1 ? 'interna' : 'externa';
}

/** Relacionamento no ponto médio entre duas entidades. */
export function relacionamentoNoMeio(doc: Doc, a: Forma, b: Forma): Resultado {
  const x = a.x <= b.x ? (a.x + a.w + b.x) / 2 : (b.x + b.w + a.x) / 2;
  const y = a.y <= b.y ? (a.y + a.h + b.y) / 2 : (b.y + b.h + a.y) / 2;
  const rel = formaEmCanto(doc, 'relacionamento', 0, 0);
  rel.x = Math.max(0, Math.round(x - rel.w / 2));
  rel.y = Math.max(0, Math.round(y - rel.h / 2));
  const l1 = linha(a.id, rel.id, { cardDe: '(0,n)' });
  const l2 = linha(b.id, rel.id, { cardDe: '(0,n)' });
  return { doc: { ...adicionarForma(doc, rel), ligacoes: [...doc.ligacoes, l1, l2] }, ids: [rel.id, l1.id, l2.id] };
}

/**
 * Auto-relacionamento junto ao lado da entidade mais próximo do clique: o losango fica a 50px da borda e duas
 * linhas (cardinalidade (0,1) nas duas) saem da entidade para ele, uma de cada lado do eixo.
 */
export function autoRelacionamentoNoLado(doc: Doc, ent: Forma, p: Ponto): Resultado {
  const lado = ladoMaisProximo(ent, p);
  const rel = formaEmCanto(doc, 'autorelacionamento', 0, 0);
  const cx = ent.x + ent.w / 2;
  const cy = ent.y + ent.h / 2;
  const folga = 50;
  const dobras: [Ponto, Ponto] = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  switch (lado) {
    case 0:
      rel.x = ent.x - rel.w - folga; rel.y = cy - rel.h / 2;
      dobras[0] = { x: ent.x - folga / 2, y: cy - 20 }; dobras[1] = { x: ent.x - folga / 2, y: cy + 20 };
      break;
    case 1:
      rel.x = cx - rel.w / 2; rel.y = ent.y - rel.h - folga;
      dobras[0] = { x: cx - 20, y: ent.y - folga / 2 }; dobras[1] = { x: cx + 20, y: ent.y - folga / 2 };
      break;
    case 2:
      rel.x = ent.x + ent.w + folga; rel.y = cy - rel.h / 2;
      dobras[0] = { x: ent.x + ent.w + folga / 2, y: cy - 20 }; dobras[1] = { x: ent.x + ent.w + folga / 2, y: cy + 20 };
      break;
    default:
      rel.x = cx - rel.w / 2; rel.y = ent.y + ent.h + folga;
      dobras[0] = { x: cx - 20, y: ent.y + ent.h + folga / 2 }; dobras[1] = { x: cx + 20, y: ent.y + ent.h + folga / 2 };
  }
  rel.x = Math.max(0, Math.round(rel.x));
  rel.y = Math.max(0, Math.round(rel.y));
  const l1 = linha(ent.id, rel.id, { cardDe: '(0,1)' }, { pontos: [dobras[0]] });
  const l2 = linha(ent.id, rel.id, { cardDe: '(0,n)' }, { pontos: [dobras[1]] });
  return { doc: { ...adicionarForma(doc, rel), ligacoes: [...doc.ligacoes, l1, l2] }, ids: [rel.id, l1.id, l2.id] };
}

/** Posição (canto superior esquerdo) de um atributo novo em torno do dono, segundo o lado clicado. */
export function posicaoDoAtributo(dono: Forma, p: Ponto, lado: 0 | 1 | 2 | 3): Ponto {
  switch (lado) {
    case 0: return { x: dono.x - 100, y: p.y - 7 };
    case 1: return { x: p.x - 7, y: dono.y - 44 };
    case 2: return { x: dono.x + dono.w + 60, y: p.y - 7 };
    default: return { x: p.x - 7, y: dono.y + dono.h + 34 };
  }
}

/**
 * Atributo (ou multivalorado) criado pelo clique numa entidade/relacionamento/atributo: cai no lado mais próximo,
 * liga com uma linha e, à esquerda, inverte o lado do texto. O multivalorado leva mais dois atributos.
 */
export function atributoNoClique(doc: Doc, kind: 'atributo' | 'atributoMulti', dono: Forma | undefined, p: Ponto): Resultado {
  if (!dono || !ehDono(dono.kind)) {
    //# Sem dono (DiagramaConceitual cmdAtributo): a caixa nasce 71px à direita e 3px acima do clique.
    const f = formaEmCanto(doc, kind, p.x + 71, p.y - 3);
    return { doc: adicionarForma(doc, f), ids: [f.id] };
  }
  const lado = ladoMaisProximo(dono, p);
  const pos = posicaoDoAtributo(dono, p, lado);
  const attr = formaEmCanto(doc, kind, pos.x, pos.y);
  //# Padrão: direção Esquerda (círculo à esquerda, voltado ao dono à esquerda do atributo); à esquerda do dono vira Direita.
  attr.props = { ...attr.props, direcao: lado === 0 ? 'Right' : 'Left' };
  const interno = dono.kind === 'entidadeAssociativa' && zonaAssociativa(dono, p) === 'interna';
  const lig = linha(dono.id, attr.id, {}, interno ? { interno: true } : {});
  let res: Doc = { ...adicionarForma(doc, attr), ligacoes: [...doc.ligacoes, lig] };
  const ids = [attr.id, lig.id];
  if (kind === 'atributoMulti') {
    const esq = lado === 0;
    for (const dy of [-14, 14]) {
      const sub = formaEmCanto(res, 'atributo', esq ? attr.x - 80 : attr.x + attr.w + 70, attr.y + dy);
      sub.props = { ...sub.props, direcao: esq ? 'Right' : 'Left' };
      const l = linha(attr.id, sub.id);
      res = { ...adicionarForma(res, sub), ligacoes: [...res.ligacoes, l] };
      ids.push(sub.id, l.id);
    }
  }
  return { doc: res, ids };
}

/** União de entidades: união abaixo das duas, entidade resultante logo abaixo dela e três linhas retas. */
export function uniaoDeEntidades(doc: Doc, a: Forma, b: Forma): Resultado {
  const ux = (Math.min(a.x + a.w, b.x + b.w) + Math.max(a.x, b.x)) / 2 - 20;
  const uy = Math.max(a.y + a.h, b.y + b.h) + 40;
  const uniao = formaEmCanto(doc, 'uniaoEntidades', ux, uy);
  let res = adicionarForma(doc, uniao);
  const resultante = formaEmCanto(res, 'entidade', ux - 40, uy + 40);
  res = adicionarForma(res, resultante);
  const reta = { inteligente: false };
  const l1 = linha(resultante.id, uniao.id, {}, { ...reta, principal: true });
  const l2 = linha(a.id, uniao.id, {}, { ...reta });
  const l3 = linha(b.id, uniao.id, {}, { ...reta });
  return { doc: { ...res, ligacoes: [...res.ligacoes, l1, l2, l3] }, ids: [uniao.id, resultante.id, l1.id, l2.id, l3.id] };
}

/**
 * Especialização exclusiva/dupla clicada sobre uma entidade: triângulo abaixo dela, ligado por uma linha no
 * ponto principal, com uma (exclusiva) ou duas (dupla) entidades especializadas. Fora de entidade: só o triângulo.
 */
export function especializacaoNoClique(doc: Doc, kind: string, geral: Forma | undefined, p: Ponto): Resultado {
  if (!geral || geral.kind !== 'entidade') {
    const f = novaForma(doc, kind, p.x, p.y);
    return { doc: adicionarForma(doc, f), ids: [f.id] };
  }
  const esp = formaEmCanto(doc, kind, p.x - 20, geral.y + geral.h * 1.5);
  let res = adicionarForma(doc, esp);
  const ids = [esp.id];
  const lig = linha(geral.id, esp.id, {}, { inteligente: false, principal: true });
  res = { ...res, ligacoes: [...res.ligacoes, lig] };
  ids.push(lig.id);
  const y = geral.y + geral.h * 2 + esp.h;
  const xs = kind === 'especializacaoExclusiva' ? [geral.x] : [geral.x - (geral.w * 2) / 3, geral.x + (geral.w * 2) / 3];
  for (const x of xs) {
    const filha = formaEmCanto(res, 'entidade', x, y);
    res = adicionarForma(res, filha);
    const l = linha(filha.id, esp.id, {}, { inteligente: false });
    res = { ...res, ligacoes: [...res.ligacoes, l] };
    ids.push(filha.id, l.id);
  }
  return { doc: res, ids };
}

/** Ferramentas de forma do Conceitual com comportamento especial; devolve null para as formas comuns. */
export function criarFormaConceitual(doc: Doc, kind: string, p: Ponto, alvo?: Forma): Resultado | null {
  switch (kind) {
    case 'autorelacionamento':
      if (alvo && ehEnt(alvo.kind)) return autoRelacionamentoNoLado(doc, alvo, p);
      //# Sem entidade sob o clique cria um Relacionamento comum.
      { const f = formaEmCanto(doc, 'relacionamento', p.x, p.y); return { doc: adicionarForma(doc, f), ids: [f.id] }; }
    case 'atributo':
    case 'atributoMulti':
      return atributoNoClique(doc, kind, alvo, p);
    case 'especializacaoExclusiva':
    case 'especializacaoDupla':
      return especializacaoNoClique(doc, kind, alvo, p);
    case 'entidade':
    case 'relacionamento':
    case 'entidadeAssociativa':
    case 'uniao':
    case 'especializacao': {
      //# O canto superior esquerdo fica no ponto do clique (SetBounds(posi.x, posi.y, ...)).
      const f = formaEmCanto(doc, kind, p.x, p.y);
      return { doc: adicionarForma(doc, f), ids: [f.id] };
    }
    case 'uniaoEntidades': {
      //# Fora do fluxo de duas entidades cria uma União simples.
      const f = formaEmCanto(doc, 'uniao', p.x, p.y);
      return { doc: adicionarForma(doc, f), ids: [f.id] };
    }
    default:
      return null;
  }
}

/**
 * Ferramenta Linha do Conceitual (2 cliques): entre duas entidades cria o relacionamento no meio com duas linhas;
 * na mesma entidade cria o auto-relacionamento; nos demais casos cai na ligação simples com as regras de ops.
 */
export function ligarConceitual(doc: Doc, de: Forma, para: Forma, pDe: Ponto, pPara: Ponto): Resultado {
  const zDe = zonaAssociativa(de, pDe);
  const zPara = zonaAssociativa(para, pPara);
  if (ehEnt(de.kind) && ehEnt(para.kind) && zDe === 'externa' && zPara === 'externa') {
    if (de.id === para.id) return autoRelacionamentoNoLado(doc, de, pPara);
    return relacionamentoNoMeio(doc, de, para);
  }
  const antes = doc.ligacoes.length;
  let res = novaLigacao(doc, 'linha', de.id, para.id, null, null, { internoDe: zDe === 'interna', internoPara: zPara === 'interna' });
  //# Clique no losango interno da associativa: a linha pertence ao relacionamento interno.
  if (res.ligacoes.length > antes && (zDe === 'interna' || zPara === 'interna')) {
    const ultima = res.ligacoes[res.ligacoes.length - 1];
    res = { ...res, ligacoes: res.ligacoes.map((l) => (l.id === ultima.id ? { ...l, props: { ...l.props, interno: true } } : l)) };
  }
  const nova = res.ligacoes[res.ligacoes.length - 1];
  return { doc: res, ids: res.ligacoes.length > antes && nova ? [nova.id] : [] };
}

export const podeSerOrigemDeUniao = (f?: Forma): f is Forma => !!f && f.kind === 'entidade';
export const ehFormaEspUniao = ehEspUniao;
