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

import { ALT_LINHA, ALT_TITULO, alturaMinima, centro, larguraTexto, reenquadrar } from './geometry';
import { OpcoesLigacao, validarLigacao } from './canLiga';
import { aceitaPontaSolta, apagarFormasSoltandoPontas } from './linhasSoltas';
import { alternarFk, alternarPk, constraintChave, nomeieCampo, propsTabela } from './logico';
import { CARD_PADRAO_A, CARD_PADRAO_B, definirCardinalidade } from './logicoLinha';
import { CampoTabela, ConstraintTabela, Diagrama, Forma, Ligacao, PropsTabela, campoVazio, novoId, propsTabelaVazias } from './types';
import { FORMAS, LIGACOES } from '../shapes/registry';

export type Doc = Diagrama;

/** Próximo nome livre: "Entidade_1", "Entidade_2"... */
export function nomeLivre(doc: Doc, base: string): string {
  if (!base) return '';
  const usados = new Set(doc.formas.map((f) => f.texto));
  let n = 1;
  while (usados.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

function propsPadrao(kind: string): Record<string, unknown> {
  switch (FORMAS[kind]?.geo) {
    case 'table':
      return propsTabelaVazias() as unknown as Record<string, unknown>;
    case 'view':
      return { schema: '', corpo: '' };
    case 'seq':
      return { schema: '', inicio: '', incremento: '', minimo: '', maximo: '', ciclo: false };
    case 'domain':
      return { schema: '', tipoBase: '', padrao: '', naoNulo: false, restricao: '' };
    case 'enum':
      return { schema: '', rotulos: '' };
    case 'routine':
      return { schema: '', parametros: '', retorno: '', linguagem: 'plpgsql', corpo: '' };
    case 'colecao':
      return { campos: [] };
    case 'attr':
    case 'multiattr':
      return { identificador: false, tipo: 'VARCHAR(80)' };
    case 'lane':
      return { capturados: [], moverCapturados: true, autoCaptura: true };
    default:
      return {};
  }
}

export function novaForma(doc: Doc, kind: string, x: number, y: number): Forma {
  const def = FORMAS[kind];
  const f: Forma = {
    id: novoId(),
    kind,
    x: Math.max(0, Math.round(x - def.w / 2)),
    y: Math.max(0, Math.round(y - def.h / 2)),
    w: def.w,
    h: def.h,
    texto: nomeLivre(doc, def.textoBase),
    props: propsPadrao(kind),
    //# A materializada nasce com a borda roxa (0x7B1FA2).
    ...(kind === 'visaoMaterializada' ? { corBorda: '#7b1fa2' } : {}),
  };
  return reenquadrar(f);
}

export function adicionarForma(doc: Doc, f: Forma): Doc {
  return { ...doc, formas: [...doc.formas, f] };
}

export function atualizarForma(doc: Doc, id: string, patch: Partial<Forma>): Doc {
  return { ...doc, formas: doc.formas.map((f) => (f.id === id ? reenquadrar({ ...f, ...patch }) : f)) };
}

export function atualizarProps(doc: Doc, id: string, props: Record<string, unknown>): Doc {
  return { ...doc, formas: doc.formas.map((f) => (f.id === id ? reenquadrar({ ...f, props: { ...f.props, ...props } }) : f)) };
}

export const estaAncorada = (x: { props: Record<string, unknown> }): boolean => !!x.props.ancorado;
const ehRaia = (f: Forma) => FORMAS[f.kind]?.geo === 'lane';
const ehAtributoKind = (k: string) => k === 'atributo' || k === 'atributoMulti';

/** Ids que acompanham a movimentação: capturados da raia (moverCapturados) e atributos (e sub-atributos) do Conceitual. */
export function idsArrastados(doc: Doc, ids: string[]): string[] {
  const res = new Set(ids);
  const fila = [...ids];
  while (fila.length) {
    const id = fila.shift()!;
    const f = doc.formas.find((x) => x.id === id);
    if (!f) continue;
    if (ehRaia(f) && f.props.moverCapturados !== false) {
      for (const c of (f.props.capturados as string[] | undefined) ?? []) if (!res.has(c)) { res.add(c); fila.push(c); }
    }
    if (doc.tipo === 'conceitual') {
      for (const l of doc.ligacoes) {
        if (l.de !== id) continue;
        const alvo = doc.formas.find((x) => x.id === l.para);
        if (alvo && ehAtributoKind(alvo.kind) && !res.has(alvo.id)) { res.add(alvo.id); fila.push(alvo.id); }
      }
    }
  }
  return [...res];
}

/** Move as formas (com o que as acompanha), respeitando `ancorado`. */
export function moverFormas(doc: Doc, ids: string[], dx: number, dy: number): Doc {
  const s = new Set(idsArrastados(doc, ids));
  return { ...doc, formas: doc.formas.map((f) => (s.has(f.id) && !estaAncorada(f) ? { ...f, x: Math.max(0, f.x + dx), y: Math.max(0, f.y + dy) } : f)) };
}

export function redimensionar(doc: Doc, id: string, x: number, y: number, w: number, h: number): Doc {
  return {
    ...doc,
    formas: doc.formas.map((f) => {
      if (f.id !== id || estaAncorada(f)) return f;
      const min = alturaMinima(f);
      return { ...f, x: Math.max(0, x), y: Math.max(0, y), w: Math.max(20, w), h: Math.max(min, h) };
    }),
  };
}

export function ligacaoEntre(doc: Doc, de: string, para: string, kind?: string): Ligacao | undefined {
  return doc.ligacoes.find((l) => l.de === de && l.para === para && (!kind || l.kind === kind));
}

const ehMaiuscula = (t: string) => t === t.toUpperCase() && t !== t.toLowerCase();

/** Índice do campo sob o clique, pela posição vertical dentro da tabela. */
export function campoNoPonto(t: Forma, y: number): CampoTabela | undefined {
  const campos = propsTabela(t).campos;
  const i = Math.floor((y - t.y - ALT_TITULO) / ALT_LINHA);
  return i >= 0 && i < campos.length ? campos[i] : undefined;
}

/**
 * Ligação lógica entre tabelas: parte de um campo chave/único
 * da tabela de origem; na de destino usa o campo clicado ou cria "FK_<tabela>_<campo>"; marca o campo como FK e
 * cria (ou completa) a constraint FK apontando para a PK/UNIQUE de origem.
 */
export function ligacaoLogica(doc: Doc, oriId: string, destId: string, cmpOId: string | null, cmpDId: string | null, criarLinha = true, constraintNova = false): Doc {
  const ori = doc.formas.find((f) => f.id === oriId);
  const dest = doc.formas.find((f) => f.id === destId);
  const linha: Ligacao = { id: novoId(), kind: 'logicoLinha', de: oriId, para: destId, texto: '', cardDe: CARD_PADRAO_A, cardPara: CARD_PADRAO_B, props: {} };
  let res: Doc = criarLinha ? { ...doc, ligacoes: [...doc.ligacoes, linha] } : doc;
  if (!ori || !dest || FORMAS[ori.kind]?.geo !== 'table' || FORMAS[dest.kind]?.geo !== 'table') return res;
  const cmpO = propsTabela(ori).campos.find((c) => c.id === cmpOId);
  if (!cmpO || !(cmpO.unique || cmpO.pk)) return res;

  let campos = propsTabela(dest).campos;
  let cmpD = campos.find((c) => c.id === cmpDId);
  if (!cmpD) {
    const prefixo = ehMaiuscula(ori.texto) ? 'FK_' : 'fk_';
    let nome = `${prefixo}${ori.texto}_${cmpO.nome}`;
    nome = nomeieCampo(campos, nome);
    cmpD = { ...campoVazio(nome, cmpO.tipo) };
    campos = [...campos, cmpD];
  }
  if (cmpD.fk) return atualizarProps(res, destId, { campos });
  const chave = constraintChave(ori, cmpO.id);
  const origem = chave ? { tabelaId: ori.id, indice: chave.indice } : null;
  const cmpDf = cmpD;
  campos = campos.map((c) => (c.id === cmpDf.id ? { ...c, fk: true, tipo: cmpO.tipo } : c));
  let constraints: ConstraintTabela[] = propsTabela(dest).constraints;
  const combina = (c: ConstraintTabela) => c.tipo === 'FK' && !!c.constraintOrigem && !!origem
    && c.constraintOrigem.tabelaId === origem.tabelaId && c.constraintOrigem.indice === origem.indice;
  //# Sem `constraintNova`, uma FK para a mesma chave estende a existente; ao estender uma FK composta em andamento (sem linha nova) vale a última.
  const existente = constraintNova ? -1 : criarLinha ? constraints.findIndex(combina) : constraints.map(combina).lastIndexOf(true);
  const par = (c: ConstraintTabela): ConstraintTabela => {
    const i = c.camposDestino.indexOf(cmpDf.id);
    if (i >= 0) return { ...c, camposOrigem: c.camposOrigem.map((x, k) => (k === i ? cmpO.id : x)) };
    return { ...c, camposOrigem: [...c.camposOrigem, cmpO.id], camposDestino: [...c.camposDestino, cmpDf.id] };
  };
  if (existente >= 0) {
    constraints = constraints.map((c, k) => (k === existente ? par({ ...c, constraintOrigem: c.constraintOrigem ?? origem }) : c));
  } else {
    constraints = [...constraints, par({ id: novoId(), tipo: 'FK', nomeada: false, nome: '', expressao: '', camposOrigem: [], camposDestino: [], constraintOrigem: origem, onDelete: '', onUpdate: '' })];
  }
  return atualizarProps(res, destId, { campos, constraints });
}

const ehProcessoEap = (f?: Forma) => f?.kind === 'eapProcesso';
const ehBarraEap = (f?: Forma) => f?.kind === 'eapBarraLigacao';

/**
 * EAP (DiagramaEap cmdEapLigacao): um processo só se liga a uma barra de ligação. Ligar dois processos cria a barra no
 * meio (o primeiro é o pai, o segundo o filho). Numa barra, a primeira ligação é o pai (um só); as demais são filhos,
 * e um processo só pode ser filho de uma barra.
 */
export function ligacaoEap(doc: Doc, de: string, para: string): Doc {
  const a = doc.formas.find((f) => f.id === de);
  const b = doc.formas.find((f) => f.id === para);
  if (!a || !b || a.id === b.id) return doc;
  const nova = (d: string, p: string, papel: 'pai' | 'filho'): Ligacao => ({ id: novoId(), kind: 'eapLigacao', de: d, para: p, texto: '', cardDe: '', cardPara: '', props: { papel } });
  if (ehProcessoEap(a) && ehProcessoEap(b)) {
    const x = a.x <= b.x ? (a.x + a.w + b.x) / 2 : (b.x + b.w + a.x) / 2;
    const y = a.y <= b.y ? (a.y + a.h + b.y) / 2 : (b.y + b.h + a.y) / 2;
    const barra = novaForma(doc, 'eapBarraLigacao', x, y);
    const l1 = nova(a.id, barra.id, 'pai');
    const l2 = nova(b.id, barra.id, 'filho');
    return { ...adicionarForma(doc, barra), ligacoes: [...doc.ligacoes, l1, l2] };
  }
  let proc: Forma | undefined;
  let barra: Forma | undefined;
  if (ehProcessoEap(a) && ehBarraEap(b)) { proc = a; barra = b; } else if (ehBarraEap(a) && ehProcessoEap(b)) { proc = b; barra = a; }
  if (!proc || !barra) return doc; // processo só liga a barra (barra-barra e demais combinações são recusadas)
  if (doc.ligacoes.some((l) => l.kind === 'eapLigacao' && ((l.de === proc!.id && l.para === barra!.id) || (l.de === barra!.id && l.para === proc!.id)))) return doc;
  const barraTemPai = doc.ligacoes.some((l) => l.kind === 'eapLigacao' && (l.para === barra!.id || l.de === barra!.id) && l.props.papel === 'pai');
  if (!barraTemPai) return { ...doc, ligacoes: [...doc.ligacoes, nova(proc.id, barra.id, 'pai')] };
  const jaEFilho = doc.ligacoes.some((l) => l.kind === 'eapLigacao' && (l.de === proc!.id || l.para === proc!.id) && l.props.papel === 'filho');
  if (jaEFilho) return doc; // um processo tem um só pai
  return { ...doc, ligacoes: [...doc.ligacoes, nova(proc.id, barra.id, 'filho')] };
}

const OPOSTO: Record<string, string> = { Sim: 'Não', Não: 'Sim' };

/**
 * Fluxo: a segunda seta ligada a uma Decisão - contando todas as ligações do mesmo tipo
 * presas nela, entrando ou saindo - recebe o rótulo oposto (Sim/Não) ao da primeira. Vale para as duas pontas.
 */
export function ligacaoFluxo(doc: Doc, de: string, para: string, kind = 'fluxLigacao'): Doc {
  let l: Ligacao = { id: novoId(), kind, de, para, texto: '', cardDe: '', cardPara: '', props: {} };
  let ligs = doc.ligacoes;
  for (const decId of [de, para]) {
    if (doc.formas.find((f) => f.id === decId)?.kind !== 'fluxDecisao') continue;
    const presas = doc.ligacoes.filter((x) => x.kind === kind && (x.de === decId || x.para === decId));
    if (presas.length !== 1) continue;
    const primeira = presas[0];
    const rotulo = OPOSTO[primeira.texto] ? primeira.texto : 'Sim';
    ligs = ligs.map((x) => (x.id === primeira.id ? { ...x, texto: rotulo } : x));
    l = { ...l, texto: OPOSTO[rotulo] };
  }
  return { ...doc, ligacoes: [...ligs, l] };
}

export function novaLigacao(doc: Doc, kind: string, de: string, para: string, cmpOId: string | null = null, cmpDId: string | null = null, opc: OpcoesLigacao = {}): Doc {
  if (de === para && kind !== 'linha') return doc;
  //# Regras de ligação (entidade-entidade, dono único do atributo, limites do relacionamento...); normaliza dono -> atributo.
  const chk = validarLigacao(doc, kind, de, para, opc);
  if (!chk.ok) return doc;
  de = chk.de;
  para = chk.para;
  if (ligacaoEntre(doc, de, para, kind)) return doc;
  if (kind === 'logicoLinha') return ligacaoLogica(doc, de, para, cmpOId, cmpDId);
  if (kind === 'eapLigacao') return ligacaoEap(doc, de, para);
  if (kind === 'fluxLigacao' || kind === 'fluxSeta') return ligacaoFluxo(doc, de, para, kind);
  const def = LIGACOES[kind];
  if (kind === 'linha') {
    const a = doc.formas.find((f) => f.id === de);
    const b = doc.formas.find((f) => f.id === para);
    const ehEnt = (k?: string) => k === 'entidade' || k === 'entidadeAssociativa';
    const ehRel = (k?: string) => k === 'relacionamento' || k === 'autorelacionamento' || k === 'entidadeAssociativa';
    //# Só a ligação entidade -> relacionamento carrega cardinalidade (no lado da entidade); atributos e especializações não.
    if (a && b && ehEnt(a.kind) && ehRel(b.kind)) {
      return { ...doc, ligacoes: [...doc.ligacoes, { id: novoId(), kind, de, para, texto: '', cardDe: '(0,n)', cardPara: '', props: {} }] };
    }
    if (a && b && ehRel(a.kind) && ehEnt(b.kind) && a.kind !== 'entidadeAssociativa') {
      return { ...doc, ligacoes: [...doc.ligacoes, { id: novoId(), kind, de: para, para: de, texto: '', cardDe: '(0,n)', cardPara: '', props: {} }] };
    }
    //# A primeira entidade ligada a uma especialização/união é a geral/resultante (o ponto principal do triângulo).
    const espUniao = (k?: string) => !!k && (k.startsWith('especializacao') || k.startsWith('uniao'));
    const alvo = a && espUniao(a.kind) ? a : b && espUniao(b.kind) ? b : undefined;
    const outra = alvo === a ? b : a;
    if (alvo && outra && ehEnt(outra.kind)) {
      const ja = doc.ligacoes.some((x) => x.de === alvo.id || x.para === alvo.id);
      const [d, p] = alvo === a ? [para, de] : [de, para];
      return { ...doc, ligacoes: [...doc.ligacoes, { id: novoId(), kind, de: d, para: p, texto: '', cardDe: '', cardPara: '', props: ja ? {} : { principal: true } }] };
    }
    return { ...doc, ligacoes: [...doc.ligacoes, { id: novoId(), kind, de, para, texto: '', cardDe: '', cardPara: '', props: {} }] };
  }
  const l: Ligacao = { id: novoId(), kind, de, para, texto: '', cardDe: '', cardPara: '', props: {} };
  return { ...doc, ligacoes: [...doc.ligacoes, l] };
}

export function atualizarLigacao(doc: Doc, id: string, patch: Partial<Ligacao>): Doc {
  return { ...doc, ligacoes: doc.ligacoes.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

/** Apaga formas (e ligações que dependam delas) e ligações soltas. */
export function apagar(doc: Doc, ids: string[]): Doc {
  const s = new Set(ids);
  return {
    ...doc,
    formas: doc.formas.filter((f) => !s.has(f.id)).map((f) => {
      const cap = f.props.capturados;
      return Array.isArray(cap) && (cap as string[]).some((c) => s.has(c)) ? { ...f, props: { ...f.props, capturados: (cap as string[]).filter((c) => !s.has(c)) } } : f;
    }),
    ligacoes: doc.ligacoes.filter((l) => !s.has(l.id) && !s.has(l.de) && !s.has(l.para)),
  };
}

export interface AreaTransferencia {
  formas: Forma[];
  ligacoes: Ligacao[];
}

export function copiar(doc: Doc, ids: string[]): AreaTransferencia {
  const s = new Set(ids);
  const formas = doc.formas.filter((f) => s.has(f.id));
  const ok = new Set(formas.map((f) => f.id));
  return { formas, ligacoes: doc.ligacoes.filter((l) => ok.has(l.de) && ok.has(l.para)) };
}

/** Cola com ids novos, deslocada; devolve o documento e os ids colados (para selecionar). */
export function colar(doc: Doc, area: AreaTransferencia, deslocamento = 24): { doc: Doc; ids: string[] } {
  const mapa = new Map<string, string>();
  const mapaCampos = new Map<string, string>();
  const formas: Forma[] = area.formas.map((f) => {
    const id = novoId();
    mapa.set(f.id, id);
    const props = structuredClone(f.props);
    if (FORMAS[f.kind]?.geo === 'table') {
      for (const c of (props.campos as CampoTabela[]) ?? []) {
        const novo = novoId();
        mapaCampos.set(c.id, novo);
        c.id = novo;
      }
    }
    return { ...f, id, x: f.x + deslocamento, y: f.y + deslocamento, props };
  });
  //# Referências a campos/tabelas também coladas passam a apontar pras cópias; as demais continuam nos originais.
  const cc = (x: string | null) => (x ? mapaCampos.get(x) ?? x : x);
  for (const f of formas) {
    if (FORMAS[f.kind]?.geo !== 'table') continue;
    const p = f.props as unknown as PropsTabela;
    p.constraints = p.constraints.map((k) => ({
      ...k, id: novoId(), camposOrigem: k.camposOrigem.map(cc), camposDestino: k.camposDestino.map(cc),
      constraintOrigem: k.constraintOrigem ? { ...k.constraintOrigem, tabelaId: mapa.get(k.constraintOrigem.tabelaId) ?? k.constraintOrigem.tabelaId } : null,
    }));
    p.indices = p.indices.map((i) => ({ ...i, id: novoId(), campos: i.campos.map(cc) }));
    p.gatilhos = p.gatilhos.map((g) => ({ ...g, id: novoId() }));
  }
  const ligacoes = area.ligacoes.map((l) => ({ ...l, id: novoId(), de: mapa.get(l.de)!, para: mapa.get(l.para)! }));
  return { doc: { ...doc, formas: [...doc.formas, ...formas], ligacoes: [...doc.ligacoes, ...ligacoes] }, ids: formas.map((f) => f.id) };
}

export type ModoAlinhamento = 'esquerda' | 'topo' | 'direita' | 'base' | 'largura' | 'altura' | 'horizontal' | 'vertical';

/**
 * Igualar/alinhar: a primeira forma selecionada é a referência.
 * 'horizontal'/'vertical' centralizam as demais no eixo da referência.
 */
export function alinhar(doc: Doc, ids: string[], modo: ModoAlinhamento): Doc {
  const sel = ids.map((id) => doc.formas.find((f) => f.id === id)).filter((f): f is Forma => !!f);
  if (sel.length < 2) return doc;
  const ref = sel[0];
  const outros = new Set(sel.slice(1).map((f) => f.id));
  return {
    ...doc,
    formas: doc.formas.map((f) => {
      if (!outros.has(f.id)) return f;
      switch (modo) {
        case 'esquerda': return { ...f, x: ref.x };
        case 'topo': return { ...f, y: ref.y };
        case 'direita': return { ...f, x: ref.x + ref.w - f.w };
        case 'base': return { ...f, y: ref.y + ref.h - f.h };
        case 'largura': return { ...f, w: ref.w };
        case 'altura': return { ...f, h: Math.max(ref.h, alturaMinima(f)) };
        case 'horizontal': return { ...f, y: Math.round(centro(ref).y - f.h / 2) };
        case 'vertical': return { ...f, x: Math.round(centro(ref).x - f.w / 2) };
      }
    }),
  };
}

export function ordem(doc: Doc, ids: string[], onde: 'frente' | 'tras'): Doc {
  const s = new Set(ids);
  const marcadas = doc.formas.filter((f) => s.has(f.id));
  const resto = doc.formas.filter((f) => !s.has(f.id));
  return { ...doc, formas: onde === 'frente' ? [...resto, ...marcadas] : [...marcadas, ...resto] };
}

/** Ajusta a largura de uma forma ao texto (útil para Entidade/Relacionamento). */
export function ajustarAoTexto(doc: Doc, id: string): Doc {
  return {
    ...doc,
    formas: doc.formas.map((f) => {
      if (f.id !== id || FORMAS[f.kind]?.fixa) return f;
      const linhas = f.texto.split('\n');
      const w = Math.max(...linhas.map((l) => larguraTexto(l, doc.fonte.tamanho))) + 24;
      return { ...f, w: Math.max(w, 60) };
    }),
  };
}

/** Organiza formas em grade quando há muitas sobrepostas (equivalente simples do "Organizar tabelas"). */
export function organizarEmGrade(doc: Doc): Doc {
  const cols = Math.max(2, Math.min(6, Math.ceil(Math.sqrt(doc.formas.length))));
  const dx = Math.max(...doc.formas.map((f) => f.w), 120) + doc.espacoH;
  const dy = Math.max(...doc.formas.map((f) => f.h), 60) + doc.espacoV;
  return {
    ...doc,
    formas: doc.formas.map((f, i) => ({ ...f, x: 40 + (i % cols) * dx, y: 40 + Math.floor(i / cols) * dy })),
  };
}

// ---- raias (captura de formas) ----------------------------------------------

const capturadosDe = (r: Forma): string[] => (Array.isArray(r.props.capturados) ? (r.props.capturados as string[]) : []);
const centroDentro = (f: Forma, r: Forma) => {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
};

/** Captura todas as formas (exceto raias) cujo centro está dentro da raia. */
export function capturarNaArea(doc: Doc, raiaId: string): Doc {
  const raia = doc.formas.find((f) => f.id === raiaId);
  if (!raia || !ehRaia(raia)) return doc;
  const novos = doc.formas.filter((f) => f.id !== raiaId && !ehRaia(f) && centroDentro(f, raia)).map((f) => f.id);
  const captura = new Set(novos);
  return {
    ...doc,
    formas: doc.formas.map((f) => {
      if (f.id === raiaId) return { ...f, props: { ...f.props, capturados: [...new Set([...capturadosDe(f), ...novos])] } };
      // uma forma pertence a uma só raia
      if (ehRaia(f) && capturadosDe(f).some((c) => captura.has(c))) return { ...f, props: { ...f.props, capturados: capturadosDe(f).filter((c) => !captura.has(c)) } };
      return f;
    }),
  };
}

/** Solta as formas indicadas (ou todas) da raia. */
export function soltarDaArea(doc: Doc, raiaId: string, ids?: string[]): Doc {
  const s = ids ? new Set(ids) : null;
  return {
    ...doc,
    formas: doc.formas.map((f) => (f.id === raiaId && ehRaia(f)
      ? { ...f, props: { ...f.props, capturados: s ? capturadosDe(f).filter((c) => !s.has(c)) : [] } }
      : f)),
  };
}

/**
 * Depois de criar/soltar formas: quem ficou dentro de uma raia com `autoCaptura` é capturado (e sai da anterior);
 * quem saiu da raia que o capturava é solto.
 */
export function autoCapturar(doc: Doc, ids: string[]): Doc {
  const s = new Set(ids);
  const alvos = doc.formas.filter((f) => s.has(f.id) && !ehRaia(f));
  if (!alvos.length) return doc;
  const raias = doc.formas.filter(ehRaia);
  if (!raias.length) return doc;
  const novo = new Map<string, Set<string>>(raias.map((r) => [r.id, new Set(capturadosDe(r))]));
  for (const f of alvos) {
    const dono = [...raias].reverse().find((r) => r.props.autoCaptura !== false && centroDentro(f, r));
    for (const r of raias) {
      const set = novo.get(r.id)!;
      if (dono && r.id === dono.id) set.add(f.id);
      else if (set.has(f.id) && !centroDentro(f, r)) set.delete(f.id);
      else if (dono && set.has(f.id)) set.delete(f.id);
    }
  }
  let mudou = false;
  const formas = doc.formas.map((f) => {
    const set = novo.get(f.id);
    if (!set) return f;
    const antes = capturadosDe(f);
    if (antes.length === set.size && antes.every((c) => set.has(c))) return f;
    mudou = true;
    return { ...f, props: { ...f.props, capturados: [...set] } };
  });
  return mudou ? { ...doc, formas } : doc;
}

// ---- lógico -----------------------------------------------------------------

export type VarianteCampo = 'campo' | 'key' | 'fkey' | 'keyfkey';

/** Cardinalidade das pontas de uma LogicoLinha (ex.: "1" / "n"). */
export function definirCardinalidadeLogica(doc: Doc, ligacaoId: string, cardDe: string, cardPara: string): Doc {
  return {
    ...doc,
    ligacoes: doc.ligacoes.map((l) => {
      if (l.id !== ligacaoId || l.kind !== 'logicoLinha') return l;
      //# Aplica as duas pontas com a consistência e a seta automática.
      return definirCardinalidade(definirCardinalidade(l, 'A', cardDe), 'B', cardPara);
    }),
  };
}

/** Acrescenta um campo à tabela: comum, chave (PK), chave estrangeira ou chave+estrangeira (Campo/Key/FKey/KeyFKey). */
export function adicionarCampoVariante(doc: Doc, tabelaId: string, variante: VarianteCampo): Doc {
  const t = doc.formas.find((f) => f.id === tabelaId);
  if (!t || FORMAS[t.kind]?.geo !== 'table') return doc;
  const campos = propsTabela(t).campos;
  //# Campo novo com nome desambiguado: as quatro variantes se chamam "Campo" (Campo_1, Campo_2...).
  const c = { ...campoVazio(nomeieCampo(campos, 'Campo'), variante === 'campo' ? 'VARCHAR(80)' : 'INTEGER') };
  let novo = atualizarProps(doc, tabelaId, { campos: [...campos, c] });
  const alvo = novo.formas.find((f) => f.id === tabelaId)!;
  let f = alvo;
  if (variante === 'key' || variante === 'keyfkey') f = alternarPk(f, c.id, true);
  if (variante === 'fkey' || variante === 'keyfkey') f = alternarFk(f, c.id, true);
  novo = { ...novo, formas: novo.formas.map((x) => (x.id === tabelaId ? reenquadrar(f) : x)) };
  return novo;
}

// ---- teclado ----------------------------------------------------------------

/** Setas: move (ou, com `redimensionar`, muda largura/altura) as formas selecionadas; ancoradas ficam. */
export function microajustar(doc: Doc, ids: string[], dx: number, dy: number, redim: boolean): Doc {
  if (!redim) return moverFormas(doc, ids, dx, dy);
  const s = new Set(ids);
  return {
    ...doc,
    formas: doc.formas.map((f) => {
      if (!s.has(f.id) || estaAncorada(f) || FORMAS[f.kind]?.fixa) return f;
      return { ...f, w: Math.max(20, f.w + dx), h: Math.max(alturaMinima(f), f.h + dy) };
    }),
  };
}

/**
 * Apagar respeitando "Propague apagar": desligado, uma forma que ainda tem ligações não é apagada.
 * Devolve os ids que ficaram.
 */
export function apagarComConfig(doc: Doc, ids: string[], propagar: boolean): { doc: Doc; bloqueados: string[] } {
  if (propagar) return { doc: apagar(doc, ids), bloqueados: [] };
  //# Fluxo/Atividade/Livre representam linha solta: as ligações ficam com a ponta livre onde estavam.
  if (aceitaPontaSolta(doc, 'fluxSeta')) {
    const formasIds = ids.filter((id) => doc.formas.some((f) => f.id === id));
    const ligsIds = ids.filter((id) => doc.ligacoes.some((l) => l.id === id));
    return { doc: apagar(apagarFormasSoltandoPontas(doc, formasIds), ligsIds), bloqueados: [] };
  }
  const s = new Set(ids);
  const bloqueados = ids.filter((id) => doc.formas.some((f) => f.id === id) && doc.ligacoes.some((l) => (l.de === id || l.para === id) && !s.has(l.id)));
  const b = new Set(bloqueados);
  return { doc: apagar(doc, ids.filter((id) => !b.has(id))), bloqueados };
}
