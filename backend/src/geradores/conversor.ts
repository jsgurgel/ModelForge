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

/**
 * Conversores entre os modelos Conceitual e Lógico:
 *  - `conceitualParaLogico`
 *  - `logicoParaConceitual`
 *  - layout por força direcionada, organização de tabelas e de entidades
 *    (o layout que os dois conversores aplicam ao final; as posições/tamanhos resultantes fazem parte do modelo).
 *
 * Cada decisão que a conversão pergunta ao usuário em um diálogo chega aqui como uma
 * chamada a `opcoes.escolher`; sem ela vale a resposta padrão de cada diálogo (o que o usuário obtém clicando "OK para
 * todos"), usado pelas fixtures de referência.
 *
 * O mapeamento do modelo conceitual está em `modelo/conceitual.ts`; o Lógico segue
 * `modelo/tipos.ts` (tabelas com `props.campos/constraints`) e as linhas de FK saem como ligações 'logicoLinha'
 * (`de` = ponta A, `para` = ponta B, `cardDe`/`cardPara` = cardinalidade de cada ponta, na notação "(1,n)").
 */
import type { Diagrama, Forma, Ligacao } from '../modelo/tipos';
import {
  GrafoConceitual, cardParaInt, cardParaTexto, ehAtributo, ehEspecializacao, ehPreEntidade, ehRelacionamento, ehUniao, str,
} from '../modelo/conceitual';
import { LIMITE_IDENTIFICADOR, equalsIgnoreCase, trimAscii, textoParaCampo } from './util';

// ============================================================================================================
// Opções
// ============================================================================================================

/** Tipos de pergunta que a conversão Conceitual -> Lógico faz ao usuário (cada um é um diálogo). */
export type TipoPergunta =
  | 'caracteres' // 0 = substituir caracteres especiais, 1 = manter como está
  | 'atributo' // 0 = criar tabela para o atributo, 1 = colunas na mesma tabela
  | 'autorelacionamento' // 0 = colunas na própria tabela (recursividade), 1 = tabela nova
  | 'especializacao' // 0 = tabela por entidade + FK, 1 = tudo na tabela da generalizada, 2 = uma tabela por especializada
  | 'relacionamento' // 0 = FK no lado 2 ... ver conversorConceitualParaLogico.converterRelacionamentoBinario
  | 'atributoDeRelacionamento' // em qual tabela ficam os atributos do relacionamento
  | 'uniao'; // 0 = FKs na tabela da resultante..., 1 = fundir

export interface Pergunta {
  tipo: TipoPergunta;
  /** Resposta padrão do diálogo (índice da opção). */
  padrao: number;
  /** Opções desabilitadas no diálogo. */
  desabilitadas: number[];
  /** id da forma do diagrama conceitual a que a pergunta se refere (quando houver). */
  forma?: string;
  /** Linhas em negrito do diálogo (contexto da pergunta). */
  textos: string[];
  /** O texto de cada opção (botão de rádio), na ordem dos índices. */
  opcoes: string[];
  /** Linhas sob o título "Observação:". */
  observacoes: string[];
}

/** Conteúdo textual do diálogo de uma pergunta . */
export interface TextoPergunta {
  textos: string[];
  opcoes: string[];
  observacoes: string[];
}

export interface OpcoesConversao {
  /**
   * Responde a uma pergunta do diálogo. Devolver `undefined` (ou não informar a função) usa `pergunta.padrao`.
   */
  escolher?: (pergunta: Pergunta) => number | undefined;
}

export interface ResultadoConversao {
  diagrama: Diagrama;
  /** Decisões que a conversão tomou sozinha (fusões de tabelas, nomes encurtados). */
  avisos: string[];
  /** Problemas (relacionamento/especialização mal formados...). */
  erros: string[];
}

// ============================================================================================================
// Layout por força direcionada (genérico sobre "caixas")
// ============================================================================================================

/** Uma forma posicionável (equivale a `Forma` para o layout). `mover` = `DoMove` (desloca a forma e o que segue com ela). */
export interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
  mover(dx: number, dy: number): void;
}

const CANVAS = 4096;

const distSelecao = 2; // distância de seleção
const round = (v: number): number => Math.floor(v + 0.5);
const idiv = (a: number, b: number): number => Math.trunc(a / b);

export function layoutForca(nos: Caixa[], arestas: [Caixa, Caixa][], iteracoes: number, comprimentoIdeal: number): void {
  if (nos.length < 2) return;
  const pos = new Map<Caixa, number[]>();
  for (const f of nos) pos.set(f, [f.x + f.w / 2.0, f.y + f.h / 2.0]);
  let temperatura = comprimentoIdeal;
  for (let it = 0; it < iteracoes; it++) {
    const forca = new Map<Caixa, number[]>();
    for (const f of nos) forca.set(f, [0, 0]);
    for (let i = 0; i < nos.length; i++) {
      for (let j = i + 1; j < nos.length; j++) {
        const f1 = nos[i];
        const f2 = nos[j];
        const p1 = pos.get(f1)!;
        const p2 = pos.get(f2)!;
        const dx = p1[0] - p2[0];
        const dy = p1[1] - p2[1];
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1.0);
        const repulsiva = (comprimentoIdeal * comprimentoIdeal) / dist;
        const fx = (dx / dist) * repulsiva;
        const fy = (dy / dist) * repulsiva;
        forca.get(f1)![0] += fx;
        forca.get(f1)![1] += fy;
        forca.get(f2)![0] -= fx;
        forca.get(f2)![1] -= fy;
      }
    }
    for (const [a, b] of arestas) {
      const p1 = pos.get(a);
      const p2 = pos.get(b);
      if (!p1 || !p2) continue;
      const dx = p1[0] - p2[0];
      const dy = p1[1] - p2[1];
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1.0);
      const atrativa = (dist * dist) / comprimentoIdeal;
      const fx = (dx / dist) * atrativa;
      const fy = (dy / dist) * atrativa;
      forca.get(a)![0] -= fx;
      forca.get(a)![1] -= fy;
      forca.get(b)![0] += fx;
      forca.get(b)![1] += fy;
    }
    for (const f of nos) {
      const fo = forca.get(f)!;
      const mag = Math.max(Math.sqrt(fo[0] * fo[0] + fo[1] * fo[1]), 0.001);
      const passo = Math.min(mag, temperatura);
      const p = pos.get(f)!;
      p[0] += (fo[0] / mag) * passo;
      p[1] += (fo[1] / mag) * passo;
    }
    temperatura *= 0.95;
  }
  for (const f of nos) {
    const p = pos.get(f)!;
    const novoLeft = round(p[0] - f.w / 2.0);
    const novoTop = round(p[1] - f.h / 2.0);
    const dx = novoLeft - f.x;
    const dy = novoTop - f.y;
    if (dx !== 0 || dy !== 0) f.mover(dx, dy);
  }
  ajusteFinal(nos, 40);
}

export function ajusteFinal(nos: Caixa[], margem: number): void {
  if (nos.length === 0) return;
  let minLeft = Number.MAX_SAFE_INTEGER;
  let minTop = Number.MAX_SAFE_INTEGER;
  let maxRight = -Number.MAX_SAFE_INTEGER;
  let maxBottom = -Number.MAX_SAFE_INTEGER;
  for (const f of nos) {
    minLeft = Math.min(minLeft, f.x);
    minTop = Math.min(minTop, f.y);
    maxRight = Math.max(maxRight, f.x + f.w);
    maxBottom = Math.max(maxBottom, f.y + f.h);
  }
  const areaLargura = Math.max(1, CANVAS - 2 * margem);
  const areaAltura = Math.max(1, CANVAS - 2 * margem);
  const arranjoLargura = Math.max(1, maxRight - minLeft);
  const arranjoAltura = Math.max(1, maxBottom - minTop);
  const escala = Math.min(1.0, Math.min(areaLargura / arranjoLargura, areaAltura / arranjoAltura));
  for (const f of nos) {
    const novoLeft = margem + round((f.x - minLeft) * escala);
    const novoTop = margem + round((f.y - minTop) * escala);
    const dx = novoLeft - f.x;
    const dy = novoTop - f.y;
    if (dx !== 0 || dy !== 0) f.mover(dx, dy);
  }
}

export function garantaPositivo(nos: Caixa[], margem: number): void {
  if (nos.length === 0) return;
  let minLeft = Number.MAX_SAFE_INTEGER;
  let minTop = Number.MAX_SAFE_INTEGER;
  for (const f of nos) {
    minLeft = Math.min(minLeft, f.x);
    minTop = Math.min(minTop, f.y);
  }
  const deslocaX = minLeft < margem ? margem - minLeft : 0;
  const deslocaY = minTop < margem ? margem - minTop : 0;
  if (deslocaX === 0 && deslocaY === 0) return;
  for (const f of nos) f.mover(deslocaX, deslocaY);
}

function empurreSeSobrepoe(movel: Caixa, fixo: Caixa, margem: number): void {
  // retângulo expandido pela margem e teste de interseção
  const fx = fixo.x - margem;
  const fy = fixo.y - margem;
  const fw = fixo.w + 2 * margem;
  const fh = fixo.h + 2 * margem;
  const mx = movel.x;
  const my = movel.y;
  const mw = movel.w;
  const mh = movel.h;
  const cruza = fw > 0 && fh > 0 && mw > 0 && mh > 0 && mx < fx + fw && mx + mw > fx && my < fy + fh && my + mh > fy;
  if (!cruza) return;
  const overlapX = Math.min(fx + fw, mx + mw) - Math.max(fx, mx);
  const overlapY = Math.min(fy + fh, my + mh) - Math.max(fy, my);
  let x = 0;
  let y = 0;
  if (overlapX < overlapY) x = (mx >= fixo.x ? 1 : -1) * overlapX;
  else y = (my >= fixo.y ? 1 : -1) * overlapY;
  movel.mover(x, y);
}

export function afasteSobrepostos(moveis: Caixa[], fixos: Caixa[], margem: number, passes: number): void {
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < moveis.length; i++) {
      const m1 = moveis[i];
      for (const f of fixos) empurreSeSobrepoe(m1, f, margem);
      for (let j = i + 1; j < moveis.length; j++) empurreSeSobrepoe(moveis[j], m1, margem);
    }
  }
}

/** Posição relativa de B em relação a A (0..7). */
export function mapaPosi(A: Caixa, B: Caixa): number {
  let dist = Math.max(A.w, B.w);
  if (Math.abs(A.x - B.x) < dist) return A.y > B.y ? 2 : 6;
  dist = Math.max(A.h, B.h);
  if (Math.abs(A.y - B.y) < dist) return A.x > B.x ? 0 : 4;
  if (A.x < B.x) return A.y < B.y ? 5 : 3;
  return A.y > B.y ? 1 : 7;
}

// ============================================================================================================
// Modelo Lógico emulado (Tabela/Campo/Constraint/LogicoLinha), só o que a conversão usa
// ============================================================================================================

type TipoConstraint = 'PK' | 'UNIQUE' | 'FK' | 'CHECK';

class LCampo {
  texto = '';
  tipo = '';
  complemento = '';
  observacao = '';
  dicionario = '';
  valorDefault = '';
  srid = '';
  subtipoGeometria = '';
  key = false;
  fkey = false;
  unique = false;
  separador = false;
  constructor(public tabela: LTabela) {}

  /** Campo de origem: derivado da primeira FK da tabela que contém este campo como destino. */
  get campoOrigem(): LCampo | null {
    const cons = this.tabela.constraints.find((c) => c.tipo === 'FK' && c.destino.includes(this));
    if (!cons) return null;
    const idx = cons.destino.indexOf(this);
    return idx > -1 ? cons.origem[idx] : null;
  }

  get tabelaOrigem(): LTabela | null {
    return this.campoOrigem?.tabela ?? null;
  }
}

class LConstraint {
  tipo: TipoConstraint = 'PK';
  nomeada = false;
  nome = '';
  expressao = '';
  origem: (LCampo | null)[] = [];
  destino: (LCampo | null)[] = [];
  constraintOrigem: LConstraint | null = null;
  ligacao: LLinha | null = null;
  onDelete = '';
  onUpdate = '';

  constructor(public tabela: LTabela) {
    tabela.constraints.push(this);
  }

  get tabelaDeOrigem(): LTabela | null {
    if (this.tipo === 'PK' || this.tipo === 'UNIQUE') return this.tabela;
    return this.constraintOrigem ? this.constraintOrigem.tabela : null;
  }

  setConstraintOrigem(co: LConstraint | null): void {
    if (this.constraintOrigem === co) return;
    if (this.tipo === 'FK') {
      if (co && co.tipo === 'FK') co = null;
      this.constraintOrigem = co;
      // Remove os campos da antiga origem.
      const tl = this.origem.length;
      this.origem = [];
      for (let i = 0; i < tl; i++) this.origem.push(null);
    }
  }

  /** Adiciona à constraint o par origem/destino (sem copiar tipo nem validar). */
  add(origem: LCampo | null, destino: LCampo | null): void {
    if (this.tipo !== 'FK') {
      if (this.origem.indexOf(origem) === -1) {
        this.origem.push(origem);
        this.destino.push(destino);
      }
    } else {
      const idx = this.destino.indexOf(destino);
      if (idx === -1) {
        this.origem.push(origem);
        this.destino.push(destino);
      } else {
        this.origem[idx] = origem;
      }
    }
  }

  /** `Add(origem, destino, lig, constraintOrigem)`. */
  addFK(origem: LCampo | null, destino: LCampo | null, lig: LLinha | null, orig: LConstraint | null): void {
    this.setConstraintOrigem(orig);
    this.ligacao = lig;
    this.add(origem, destino);
  }

  /** `LigacaoDireta`: liga direto à constraint de origem, mantendo os campos de origem já informados. */
  ligacaoDireta(constraintOrigem: LConstraint | null, ligacao: LLinha | null): void {
    if (constraintOrigem === null || constraintOrigem.tipo === 'FK' || this.constraintOrigem !== null || this.tipo !== 'FK') {
      this.setConstraintOrigem(constraintOrigem);
    } else {
      this.constraintOrigem = constraintOrigem;
      const ori = this.constraintOrigem.tabela;
      let tl = this.origem.length - 1;
      while (tl > -1) {
        const c = this.origem[tl];
        if (c !== null && c.tabela !== ori) this.origem[tl] = null;
        tl--;
      }
      this.ligacao = ligacao;
    }
  }

  removeFromDestino(cmp: LCampo): void {
    const idx = this.destino.indexOf(cmp);
    if (idx > -1) {
      this.destino.splice(idx, 1);
      this.origem.splice(idx, 1);
    }
  }
}

/** Ponto de uma linha ligado a uma tabela (o `PontoDeLinha`). */
interface LPonto {
  linha: LLinha;
  /** true = ponta A da linha. */
  ehA: boolean;
}

class LLinha {
  cardA = 1; // ponta A em (0,1); ponta B fica no padrão (0,n)
  cardB = 3;
  constructor(public a: LTabela, public b: LTabela) {}

  private ajuste(mudou: 'A' | 'B'): void {
    // Cardinalidade "n" numa ponta obriga a outra a ser "1"
    const c = mudou === 'A' ? this.cardA : this.cardB;
    if (c === 1 || c === 0) return;
    const outra = mudou === 'A' ? this.cardB : this.cardA;
    let nova = outra;
    if (outra === 3) nova = 1;
    else if (outra === 2) nova = 0;
    if (nova !== outra) this.setCard(mudou === 'A' ? 'B' : 'A', nova);
  }

  /** Muda a cardinalidade de uma ponta: índice inválido = (0,n); mudar uma ponta pode alterar a outra. */
  setCard(ponta: 'A' | 'B', valor: number): void {
    const v = valor < 0 || valor > 3 ? 3 : valor;
    const atual = ponta === 'A' ? this.cardA : this.cardB;
    if (v === atual) return;
    if (ponta === 'A') this.cardA = v;
    else this.cardB = v;
    this.ajuste(ponta);
  }

  outraPonta(t: LTabela): LTabela {
    return this.a === t ? this.b : this.a;
  }
}

class LTabela implements Caixa {
  x = 0;
  y = 0;
  w = 150;
  h = 100;
  texto = 'Tabela';
  textoAdicional = '';
  observacao = '';
  campos: LCampo[] = [];
  constraints: LConstraint[] = [];
  /** Pontos de linha ligados a esta tabela, na ordem em que foram ligados. */
  pontos: LPonto[] = [];
  removida = false;

  constructor(private dl: LDiagrama) {}

  mover(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

  get right(): number {
    return this.x + this.w;
  }

  get bottom(): number {
    return this.y + this.h;
  }

  /** Campo novo, com nome desambiguado ("_" nunca é alterado). */
  add(texto: string): LCampo {
    const c = new LCampo(this);
    this.campos.push(c);
    c.texto = this.nomeieCampo(texto);
    return c;
  }

  private nomeieCampo(nome: string): string {
    if (nome === '_') return '_';
    const nomes = this.campos.map((c) => c.texto);
    let i = 0;
    let tmp = nome;
    while (nomes.indexOf(tmp) > -1) tmp = nome + '_' + ++i;
    return tmp;
  }

  get linhas(): LLinha[] {
    return this.pontos.map((p) => p.linha);
  }

  presentAsFK(c: LCampo): LConstraint | null {
    return this.constraints.find((k) => k.tipo === 'FK' && k.destino.includes(c)) ?? null;
  }

  /** Garante o campo chave na constraint PK da tabela. */
  processeIrKey(cmp: LCampo): void {
    let pk = this.constraints.find((c) => c.tipo === 'PK') ?? null;
    if (!pk) {
      if (cmp.key) {
        pk = new LConstraint(this);
        pk.tipo = 'PK';
        pk.add(cmp, null);
      }
      return;
    }
    if (cmp.key && pk.origem.indexOf(cmp) === -1) pk.add(cmp, null);
  }
}

class LDiagrama {
  itens: (LTabela | LLinha)[] = [];

  get tabelas(): LTabela[] {
    return this.itens.filter((i): i is LTabela => i instanceof LTabela);
  }

  get linhasDoDiagrama(): LLinha[] {
    return this.itens.filter((i): i is LLinha => i instanceof LLinha);
  }

  /** Cria tabela 150x100, reenquadrada no canvas. */
  novaTabela(x: number, y: number): LTabela {
    const t = new LTabela(this);
    t.x = x;
    t.y = y;
    t.w = 150;
    t.h = 100;
    // Mantém a forma dentro do canvas
    let ax = t.x < 0 ? 0 : t.x;
    let ay = t.y < 0 ? 0 : t.y;
    if (t.x + t.w > CANVAS) ax = CANVAS - t.w;
    if (t.y + t.h > CANVAS) ay = CANVAS - t.h;
    t.x = ax;
    t.y = ay;
    this.itens.push(t);
    return t;
  }

  /** `LogicoLinha` ligando A e B (a linha só existe enquanto as duas pontas existirem). */
  novaLinha(a: LTabela, b: LTabela): LLinha {
    const l = new LLinha(a, b);
    a.pontos.push({ linha: l, ehA: true });
    b.pontos.push({ linha: l, ehA: false });
    // Ao ligar: constraints sem ligação cuja tabela de origem é a outra ponta passam a usar esta linha
    for (const [t, o] of [[a, b], [b, a]] as [LTabela, LTabela][]) {
      for (const c of t.constraints) if (c.ligacao === null && c.tabelaDeOrigem === o) c.ligacao = l;
    }
    this.itens.push(l);
    return l;
  }

  removerLinha(l: LLinha): void {
    const i = this.itens.indexOf(l);
    if (i > -1) this.itens.splice(i, 1);
    l.a.pontos = l.a.pontos.filter((p) => p.linha !== l);
    l.b.pontos = l.b.pontos.filter((p) => p.linha !== l);
  }

  /** Remove a tabela propagando a exclusão às linhas: tira a tabela e todas as linhas ligadas a ela. */
  removerTabela(t: LTabela): void {
    const linhas = [...new Set(t.linhas)];
    const i = this.itens.indexOf(t);
    if (i > -1) this.itens.splice(i, 1);
    t.removida = true;
    for (const l of linhas) this.removerLinha(l);
    // FKs de outras tabelas que apontavam para esta perdem a constraint de origem
    for (const o of this.tabelas) {
      for (const c of o.constraints) if (c.tabelaDeOrigem === t) c.setConstraintOrigem(null);
    }
  }
}

// ============================================================================================================
// Layout do Lógico: organização das tabelas
// ============================================================================================================

const DIST_LEFT = 160;
const DIST_TOP = 80;

function apliqueDistanciaTabelas(ori: LTabela, dest: LTabela): void {
  const m = mapaPosi(ori, dest);
  let x = 0;
  let y = 0;
  switch (m) {
    case 6:
      if (dest.y - ori.bottom < DIST_TOP) y = DIST_TOP - (dest.y - ori.bottom);
      break;
    case 5: {
      const distX = dest.x - ori.right;
      const distY = dest.y - ori.bottom;
      if (distY < DIST_TOP) y = DIST_TOP - (dest.y - ori.bottom);
      if (distX < DIST_LEFT) x = DIST_LEFT - (dest.x - ori.right);
      if (x > y) {
        x = distX < idiv(DIST_LEFT, 4) ? idiv(DIST_LEFT, 4) : 0;
      } else {
        y = distY < idiv(DIST_TOP, 4) ? idiv(DIST_TOP, 4) : 0;
      }
      break;
    }
    case 3:
    case 4:
      if (dest.x - ori.right < DIST_LEFT) x = DIST_LEFT - (dest.x - ori.right);
      break;
  }
  if (x > 0 || y > 0) dest.mover(x, y);
}

export function organizarTabelas(dl: LDiagrama): void {
  const tabelas = dl.tabelas;
  if (tabelas.length > 1) {
    const arestas: [Caixa, Caixa][] = dl.linhasDoDiagrama.map((l) => [l.a, l.b]);
    layoutForca(tabelas, arestas, 150, DIST_LEFT);
  }
  tabelas.forEach((t1) => tabelas.filter((t) => t !== t1).forEach((t2) => apliqueDistanciaTabelas(t1, t2)));
  const ord = [...tabelas].sort((a, b) => a.x - b.x);
  ord.forEach((t1) => ord.filter((t) => t !== t1).forEach((t2) => apliqueDistanciaTabelas(t1, t2)));
  for (let ciclo = 0; ciclo < 4; ciclo++) {
    ajusteFinal(tabelas, 40);
    tabelas.forEach((t1) => tabelas.filter((t) => t !== t1).forEach((t2) => apliqueDistanciaTabelas(t1, t2)));
    ord.forEach((t1) => ord.filter((t) => t !== t1).forEach((t2) => apliqueDistanciaTabelas(t1, t2)));
  }
  ajusteFinal(tabelas, 40);
}

// ============================================================================================================
// Serialização do Lógico emulado -> Diagrama web
// ============================================================================================================

const CARD_TEXTO = ['(1,1)', '(0,1)', '(1,n)', '(0,n)'];

function serializarLogico(dl: LDiagrama, nome: string): Diagrama {
  const ids = new Map<object, string>();
  let contador = 0;
  const id = (o: object, p: string): string => {
    let v = ids.get(o);
    if (!v) {
      v = p + contador++;
      ids.set(o, v);
    }
    return v;
  };
  const formas: Forma[] = [];
  const ligacoes: Ligacao[] = [];
  const tabelas = dl.tabelas;
  for (const t of tabelas) {
    const campos = t.campos.map((c) => ({
      id: id(c, 'c'), nome: c.texto, tipo: c.tipo, complemento: c.complemento, padrao: c.valorDefault, dicionario: c.dicionario,
      observacao: c.observacao, srid: c.srid, subtipoGeometria: c.subtipoGeometria, pk: c.key, fk: c.fkey, unique: c.unique,
      separador: c.separador,
    }));
    const constraints = t.constraints.map((k) => {
      const co = k.constraintOrigem;
      return {
        id: id(k, 'k'), tipo: k.tipo, nomeada: k.nomeada, nome: k.nome, expressao: k.expressao,
        camposOrigem: k.origem.map((c) => (c ? id(c, 'c') : null)),
        camposDestino: k.destino.map((c) => (c ? id(c, 'c') : null)),
        constraintOrigem: co ? { tabelaId: id(co.tabela, 't'), indice: co.tabela.constraints.indexOf(co) } : null,
        onDelete: k.onDelete, onUpdate: k.onUpdate,
      };
    });
    formas.push({
      id: id(t, 't'), kind: 'tabela', x: t.x, y: t.y, w: t.w, h: t.h, texto: t.texto,
      props: {
        schema: '', descricao: t.textoAdicional, observacao: t.observacao, estrategiaParticao: '', chaveParticao: '', tabelaPai: '',
        limiteParticao: '', campos, constraints, indices: [], gatilhos: [],
      },
    });
  }
  for (const l of dl.linhasDoDiagrama) {
    ligacoes.push({
      id: id(l, 'l'), kind: 'logicoLinha', de: id(l.a, 't'), para: id(l.b, 't'), texto: '', cardDe: CARD_TEXTO[l.cardA],
      cardPara: CARD_TEXTO[l.cardB], props: {},
    });
  }
  return { nome, tipo: 'logico', prefixo: '', formas, ligacoes };
}

// ============================================================================================================
// Conceitual -> Lógico (conversorConceitualParaLogico)
// ============================================================================================================

const DIST = 120;
const SUFIXO_PK = '_PK';
const SUFIXO_FK = '_FK';
const PREFIXO_FK = 'FK_';
const SUFIXO_TIPO = '_TIPO';
const TIPO_INT = 'INT';

/** Substitui cada `%s` das mensagens pelos argumentos, na ordem. */
function msg(modelo: string, ...args: (string | number)[]): string {
  let i = 0;
  return modelo.replace(/%[sd]/g, () => String(args[i++]));
}
/** A linha "Observações: ..." acrescentada aos textos do diálogo. */
function linhaObservacoes(obs: string, texto: string, origem: boolean): string {
  return 'Observações: ' + (obs === '' ? '[Não há observações]' : obs) + (origem ? ' - Origem: ' + texto : '');
}
const MSG14 = 'Cardinalidade máxima definida como "n" ou superior a 10, ou atributos multivalorados e/ou compostos que após a conversão gerariam mais que 50 campos. Necessário incluir em nova tabela';
const MSG40 = 'Relacionamento mal formulado [%s]';
const MSG25 = 'Especialização mal formulada ID %d';
const MSG74 = 'União mal formulada ID %d';
const MSG_FUSAO = 'Relacionamento "%s": cardinalidade 1:1 nos dois lados, então %s foram unificadas em "%s".';
const MSG_FUSAO_OPCAO = 'Relacionamento "%s": pela opção escolhida no diálogo ("Fundir as tabelas"), %s foram unificadas em "%s".';
const MSG_COLUNA_LONGA = 'O nome gerado para uma coluna passava de %s caracteres, limite dos SGBDs suportados, e foi encurtado para "%s".';
const MSG_NOME_LONGO = 'O nome gerado para a tabela passava de %s caracteres, limite dos SGBDs suportados, e foi encurtado para "%s".';
const MSG39 = 'Campo criado no processo de conversão: tipo de [%s]:';

const isUpper = (s: string): boolean => s.toUpperCase() === s;

/** Elemento do diagrama conceitual visto pelo conversor. O Relacionamento interno de uma associativa é um elemento à parte. */
interface Elem {
  key: string;
  f: Forma;
  interno: boolean;
}

interface Par {
  origem: string;
  destino: LTabela;
}

class ConversorCL {
  readonly g: GrafoConceitual;
  readonly dl = new LDiagrama();
  readonly avisos: string[] = [];
  readonly erros: string[] = [];
  private removerEspecial = false;
  private links: Par[] = [];
  private elems = new Map<string, Elem>();
  private origemLigacao = new Map<LLinha, LTabela>();
  private camposOrigem = new Map<LCampo, LCampo>();
  private frutoAutoRelacionamento: LTabela[] = [];
  private campoTipoJaSetado = new Map<LTabela, LCampo>();
  private directFK = new Map<LConstraint, LLinha | null>();
  private directPK = new Map<LConstraint, LTabela>();

  constructor(private origem: Diagrama, private opcoes: OpcoesConversao) {
    this.g = new GrafoConceitual(origem);
  }

  // ---------------------------------------------------------------------------- utilidades
  private elem(f: Forma, interno = false): Elem {
    const key = interno ? f.id + '#interno' : f.id;
    let e = this.elems.get(key);
    if (!e) {
      e = { key, f, interno };
      this.elems.set(key, e);
    }
    return e;
  }

  private texto(e: Elem): string {
    return e.interno ? str((e.f.props.interno as Record<string, unknown> | undefined)?.texto) : e.f.texto;
  }

  private textoAdicional(e: Elem): string {
    return str(e.interno ? (e.f.props.interno as Record<string, unknown> | undefined)?.descricao : e.f.props.descricao);
  }

  private observacao(e: Elem): string {
    return str(e.interno ? (e.f.props.interno as Record<string, unknown> | undefined)?.observacao : e.f.props.observacao);
  }

  /** Localização do elemento (a do interno é a da associativa recuada). */
  private local(e: Elem): [number, number] {
    if (e.interno) return [e.f.x + 4 * distSelecao, e.f.y + 4 * distSelecao];
    return [e.f.x, e.f.y];
  }

  private pergunta(tipo: TipoPergunta, padrao: number, desabilitadas: number[], forma: string | undefined, txt: TextoPergunta): number {
    const r = this.opcoes.escolher?.({
      tipo, padrao, desabilitadas: [...desabilitadas], forma,
      textos: [...txt.textos], opcoes: [...txt.opcoes], observacoes: [...txt.observacoes],
    });
    return r === undefined ? padrao : r;
  }

  private removerCaracteresEspeciais(original: string): string {
    return this.removerEspecial ? textoParaCampo(original) : original;
  }

  // ---------------------------------------------------------------------------- Links (conversorLink)
  private linkAdd(ori: string, dest: LTabela): void {
    if (this.links.some((p) => p.origem === ori && p.destino === dest)) return;
    this.links.push({ origem: ori, destino: dest });
  }

  private ligadosOrigem(ori: string): LTabela[] {
    return this.links.filter((p) => p.origem === ori).map((p) => p.destino);
  }

  private trocarLinksDestino(de: LTabela, para: LTabela): void {
    if (de === para) return;
    for (const p of this.links) if (p.destino === de) p.destino = para;
  }

  // ---------------------------------------------------------------------------- nomes
  private encurtar(nome: string | null, jaUsado: (n: string) => boolean): string | null {
    if (nome === null || nome.length <= LIMITE_IDENTIFICADOR) return null;
    const base = nome.substring(0, LIMITE_IDENTIFICADOR);
    let escolhido = base;
    let n = 2;
    while (jaUsado(escolhido)) {
      const sufixo = '_' + n;
      escolhido = base.substring(0, LIMITE_IDENTIFICADOR - sufixo.length) + sufixo;
      n++;
    }
    return escolhido;
  }

  private nomeJaUsado(nome: string, exceto: LTabela): boolean {
    return this.dl.tabelas.some((t) => t !== exceto && equalsIgnoreCase(nome, t.texto));
  }

  private limiteDeNome(tb: LTabela): string | null {
    const escolhido = this.encurtar(tb.texto, (n) => this.nomeJaUsado(n, tb));
    if (escolhido === null) return null;
    tb.texto = escolhido;
    return msg(MSG_NOME_LONGO, String(LIMITE_IDENTIFICADOR), escolhido);
  }

  private limiteDeNomeComAviso(tb: LTabela): void {
    const aviso = this.limiteDeNome(tb);
    if (aviso !== null) this.avisos.push(aviso);
  }

  private nomeDeCampoGerado(bruto: string, jaUsado: (n: string) => boolean): string {
    let nome = this.removerCaracteresEspeciais(bruto);
    const encurtou = nome.length > LIMITE_IDENTIFICADOR;
    if (encurtou) nome = nome.substring(0, LIMITE_IDENTIFICADOR);
    let res = nome;
    let i = 2;
    while (jaUsado(res)) {
      const sufixo = '_' + i;
      res = (nome.length + sufixo.length <= LIMITE_IDENTIFICADOR ? nome : nome.substring(0, LIMITE_IDENTIFICADOR - sufixo.length)) + sufixo;
      i++;
    }
    if (encurtou) this.avisos.push(msg(MSG_COLUNA_LONGA, String(LIMITE_IDENTIFICADOR), res));
    return res;
  }

  private nomeDeCampoGeradoEm(bruto: string, dest: LTabela): string {
    return this.nomeDeCampoGerado(bruto, (n) => dest.campos.some((c) => equalsIgnoreCase(n, c.texto)));
  }

  // ---------------------------------------------------------------------------- campos
  private importaComoCampo(tb: LTabela, a: Forma): void {
    const ax = this.removerCaracteresEspeciais(a.texto);
    const c = tb.add(ax);
    c.texto = ax;
    c.tipo = str(a.props.tipo);
    c.key = a.props.identificador === true;
    c.observacao = str(a.props.observacao);
    c.dicionario = str(a.props.descricao);
  }

  private importaCampo3(tb: LTabela, a: LCampo, preTxt: string): LCampo {
    const c = tb.add('_');
    const ax = this.nomeDeCampoGeradoEm(preTxt + a.texto, tb);
    c.texto = ax;
    c.tipo = a.tipo;
    c.key = a.key;
    c.fkey = a.fkey;
    c.observacao = a.observacao;
    c.dicionario = a.dicionario;
    return c;
  }

  private importaCampoIgnoreConstrais(tb: LTabela, a: LCampo, preTxt: string): LCampo {
    const c = tb.add('_');
    const ax = this.nomeDeCampoGeradoEm(preTxt + a.texto, tb);
    c.texto = ax;
    c.tipo = a.tipo;
    c.observacao = a.observacao;
    c.dicionario = a.dicionario;
    return c;
  }

  private importaCampoChave(ori: LTabela, dest: LTabela, preTxt: string): void {
    if (ori === dest) return;
    for (const a of ori.campos.filter((c) => c.key)) {
      const c = dest.add('_');
      c.texto = this.nomeDeCampoGeradoEm(preTxt + a.texto, dest);
      c.tipo = a.tipo;
      c.fkey = true;
      this.camposOrigem.set(c, a);
      c.observacao = a.observacao;
      c.dicionario = a.dicionario;
    }
  }

  private importaCampoChaveKFK(ori: LTabela, dest: LTabela, preTxt: string): void {
    if (ori === dest) return;
    for (const a of ori.campos.filter((c) => c.key)) {
      const c = dest.add('_');
      c.texto = this.nomeDeCampoGeradoEm(preTxt + a.texto, dest);
      c.tipo = a.tipo;
      c.fkey = true;
      c.key = true;
      this.camposOrigem.set(c, a);
      c.observacao = a.observacao;
      c.dicionario = a.dicionario;
    }
  }

  /** `ImportaCampo(Tabela ori, Tabela dest)`: copia para `dest` os campos de `ori` que ainda não existem lá. */
  private importaCampo(ori: LTabela | null, dest: LTabela | null): void {
    if (ori === dest || ori === null || dest === null) return;
    for (const a of [...ori.campos]) {
      const existe = dest.campos.some((ca) => ca.texto === a.texto && this.camposOrigem.get(ca) === this.camposOrigem.get(a)
        && ca.fkey === a.fkey && ca.key === a.key);
      if (!existe) {
        const c = dest.add('_');
        c.texto = this.removerCaracteresEspeciais(a.texto);
        c.tipo = a.tipo;
        c.key = a.key;
        c.fkey = a.fkey;
        if (c.fkey) {
          const o = this.camposOrigem.get(a);
          if (o) this.camposOrigem.set(c, o);
          else this.camposOrigem.delete(c);
        }
        c.observacao = a.observacao;
        c.dicionario = a.dicionario;
      }
    }
  }

  // ---------------------------------------------------------------------------- linhas
  private linkTable(origem: LTabela, destino: LTabela, cardO: number, cardD: number): LLinha {
    const lin = this.dl.novaLinha(origem, destino);
    lin.setCard('A', cardO);
    lin.setCard('B', cardD);
    return lin;
  }

  private moverLigacoes(origem: LTabela, destino: LTabela): boolean {
    if (origem === destino) return false;
    for (const p of [...origem.pontos]) {
      if (p.ehA) p.linha.a = destino;
      else p.linha.b = destino;
      origem.pontos = origem.pontos.filter((x) => x !== p);
      destino.pontos.push(p);
    }
    this.removaLigacoesIguais(destino);
    return true;
  }

  private cloneLigacoes(origem: LTabela, destino: LTabela): boolean {
    if (origem === destino) return false;
    for (const lig of origem.linhas) {
      const ca = lig.cardA;
      const cb = lig.cardB;
      let lin: LLinha;
      if (lig.a === origem) lin = this.linkTable(destino, lig.b, ca, cb);
      else lin = this.linkTable(lig.a, destino, cb, ca);
      if (this.origemLigacao.has(lig)) this.origemLigacao.set(lin, destino);
    }
    this.removaLigacoesIguais(destino);
    return true;
  }

  private static ligacoesIguais(lo: LLinha, ld: LLinha): boolean {
    return (lo.a === ld.a && lo.b === ld.b && lo.cardA === ld.cardA && lo.cardB === ld.cardB)
      || (lo.a === ld.b && lo.b === ld.a && lo.cardA === ld.cardB && lo.cardB === ld.cardA);
  }

  private removaLigacoesIguais(destino1: LTabela): void {
    const lista = destino1.linhas;
    const ja: LLinha[] = [];
    for (const linha of lista) {
      for (const lin of lista) {
        if (lin !== linha && !ja.includes(linha) && !ja.includes(lin) && ConversorCL.ligacoesIguais(linha, lin)) {
          this.dl.removerLinha(lin);
          ja.push(lin);
        }
      }
    }
  }

  private espacoOcupado(tb: LTabela, p: [number, number]): [number, number] {
    let ac: LTabela | null = tb;
    let res: [number, number] = [p[0], p[1]];
    while (ac !== null) {
      const x = res;
      ac = this.dl.tabelas.find((o) => o.x === x[0] && o.y === x[1]) ?? null;
      if (ac !== null) res = [ac.x, ac.bottom + idiv(DIST, 5)];
    }
    return res;
  }

  private criarTabelaAoLado(t: LTabela): LTabela {
    const p = this.espacoOcupado(t, [t.right + DIST, t.y]);
    return this.dl.novaTabela(p[0], p[1]);
  }

  // ---------------------------------------------------------------------------- passo 1 e 2: entidades e atributos
  private perguntaCaracteres(): boolean {
    const opc = this.pergunta('caracteres', 0, [], undefined, {
      textos: ['Início do processo de conversão do modelo conceitual para o modelo lógico'],
      opcoes: ['Substituir caracteres especiais (ç, +, ã, é e etc) por "_"', 'Não substituir caracteres especiais - manter como está.'],
      observacoes: [],
    });
    this.removerEspecial = opc === 0;
    return true;
  }

  private entidades(): Forma[] {
    return this.origem.formas.filter(ehPreEntidade);
  }

  private converterEntidades(): boolean {
    for (const e of this.entidades()) {
      const t = this.dl.novaTabela(e.x, e.y);
      t.texto = this.removerCaracteresEspeciais(e.texto);
      t.textoAdicional = str(e.props.descricao);
      t.observacao = str(e.props.observacao);
      this.linkAdd(e.id, t);
    }
    return true;
  }

  private converterAtributos(): boolean {
    for (const E of this.entidades()) {
      const lst = this.g.atributos(E);
      const tmp = this.ligadosOrigem(E.id);
      if (tmp.length === 0 || tmp.length > 1) {
        this.erros.push('Erro de conversão: quantidade de tabelas inesperada (' + tmp.length + ')');
        return false;
      }
      const tbl = tmp[0];
      if (!this.recebaEConvertaAtributos(this.elem(E), tbl, lst)) return false;
      this.recebaEConvertaAtributosOcultos(tbl, trimAscii(str(E.props.atributosOcultos)));
    }
    return true;
  }

  private recebaEConvertaAtributosOcultos(tb: LTabela, ao: string): void {
    for (let a of ao.split('\n')) {
      a = trimAscii(a);
      let tipo = '';
      if (a !== '') {
        if (a.includes(' ')) {
          const ct = a.replace(/ +/g, ' ').split(' ');
          a = ct[0];
          tipo = ct[1];
        }
        const c = tb.add(a);
        c.texto = this.removerCaracteresEspeciais(a);
        if (tipo !== '') c.tipo = tipo;
      }
    }
  }

  /** `captureAtributos`: achata composto/multivalorado em uma lista de folhas; devolve se ficou "limitado". */
  private captureAtributos(A: Forma, lst: Forma[], obs: string[] = []): boolean {
    let mv = 1;
    let seraLimitado = false;
    const multi = A.props.multivalorado === true;
    const cardMax = typeof A.props.cardMax === 'number' ? A.props.cardMax : -1;
    if (multi) {
      seraLimitado = cardMax < 0 || cardMax > 10;
      mv = seraLimitado ? 1 : cardMax;
    }
    const tmp = this.g.subAtributos(A);
    for (let i = 0; i < mv; i++) {
      if (tmp.length === 0) {
        lst.push(A);
      } else {
        for (const a of tmp) if (this.captureAtributos(a, lst, obs)) seraLimitado = true;
      }
      if (lst.length > 50) {
        seraLimitado = true;
        break;
      }
    }
    if (seraLimitado) obs.push(`Atributos de ${A.texto} limitados (quantidade) no processo de conversão`);
    return seraLimitado;
  }

  private recebaEConvertaAtributos(E: Elem, tb: LTabela, lst: Forma[]): boolean {
    for (const a of lst) {
      const multi = a.props.multivalorado === true;
      const opcional = a.props.opcional === true;
      const cardMax = typeof a.props.cardMax === 'number' ? a.props.cardMax : -1;
      const tmpcardMaxUtil = cardMax > 1 || cardMax === -1;
      if (this.g.isComposto(a) || opcional || (multi && tmpcardMaxUtil)) {
        const attrs: Forma[] = [];
        const obsCaptura: string[] = [];
        const limitado = this.captureAtributos(a, attrs, obsCaptura);
        let padrao = multi && tmpcardMaxUtil ? 0 : 1;
        const desab: number[] = [];
        if (limitado) {
          desab.push(1);
          padrao = 0;
        }
        const nCar = (opcional ? 1 : 0) + (this.g.isComposto(a) ? 1 : 0) + (multi ? 1 : 0);
        const e = ' e ';
        const obsA = str(a.props.observacao);
        const opc = this.pergunta('atributo', padrao, desab, a.id, {
          textos: [
            'Atributo ' + (this.g.isComposto(a) ? 'composto' : '') + (nCar === 3 ? ', ' : nCar > 1 ? e : '')
              + (opcional ? 'opcional' : '') + (nCar > 1 ? e : '') + (multi ? 'multivalorado' : '') + ': ' + a.texto,
            //# msg12 recebe a observação (e não o nome da entidade) como argumento.
            msg('Incluir o atributo como campo na futura tabela "%s"', obsA === '' ? '[Não há observações]' : obsA),
          ],
          opcoes: [
            'Criar uma tabela para acomodar os atributos',
            msg(opcional && nCar === 1 ? 'Incluir o atributo como campo na futura tabela "%s"' : 'Incluir os atributos como campos na futura tabela "%s"', tb.texto),
          ],
          observacoes: limitado ? [MSG14, ...obsCaptura] : [],
        });
        let ntb = tb;
        if (opc === 0) {
          ntb = this.criarTabelaAoLado(tb);
          const ax = this.removerCaracteresEspeciais(a.texto);
          ntb.texto = ax;
          this.linkAdd(a.id, ntb);
          this.origemLigacao.set(this.linkTable(tb, ntb, opcional ? 0 : multi ? 0 : 1, limitado ? 3 : 1), tb);
          const c = ntb.add(ax + SUFIXO_PK);
          c.texto = ax + SUFIXO_PK;
          c.key = true;
          c.tipo = TIPO_INT;
          c.complemento = 'NOT NULL';
          const c2 = tb.add(ax + SUFIXO_FK);
          c2.texto = ax + SUFIXO_FK;
          c2.fkey = true;
          this.camposOrigem.set(c2, c);
        }
        for (const at of attrs) this.importaComoCampo(ntb, at);
      } else {
        this.importaComoCampo(tb, a);
      }
    }
    void E;
    return true;
  }

  // ---------------------------------------------------------------------------- auto-relacionamento
  private converterAutoRelacionamento(): boolean {
    const lst = this.origem.formas.filter((f) => ehRelacionamento(f) && this.g.ehAutoRelacionamento(f));
    for (const R of lst) {
      if (this.g.formasLigadas(R).length === 0) continue;
      const E = this.g.formasLigadas(R).find(ehPreEntidade);
      if (!E) {
        this.erros.push(msg(MSG40, R.texto));
        continue;
      }
      const lig = this.g.ligacoesDeEntidade(R);
      if (lig.length < 2) {
        this.erros.push(msg(MSG40, R.texto));
        continue;
      }
      const tmp1 = cardParaInt(lig[0].lig.cardDe);
      const tmp2 = cardParaInt(lig[1].lig.cardDe);
      const Card2 = Math.max(tmp1, tmp2);
      const Card1 = Math.min(tmp1, tmp2);
      let AdCol = false;
      if (Card2 === 1) {
        AdCol = true;
      } else if (!(Card1 > 1)) {
        const desab: number[] = [];
        if (Card1 === 0 && (Card2 === 0 || Card2 === 2)) desab.push(0);
        const textos = [
          msg('Auto relacionamento com cardinalidade %s e %s encontrado!', cardParaTexto(Card1), cardParaTexto(Card2)),
          msg('Entre "%s" e "%s"', E.texto, R.texto),
          linhaObservacoes(str(R.props.observacao), R.texto, true),
        ];
        if (desab.length) {
          textos.push(msg('Informações: auto relacionamento com cardinalidades %s e %s não opcional, não pode ser convertida em tabela com recursividade', cardParaTexto(Card1), cardParaTexto(Card2)));
        }
        AdCol = this.pergunta('autorelacionamento', Card2 === 2 ? 0 : 1, desab, R.id, {
          textos,
          opcoes: [msg('Criar relacionamento recursivo na(s) tabela(s) resultante(s) de %s', E.texto), 'Criar uma tabela para o auto relacionamento.'],
          observacoes: [],
        }) === 0;
      }
      const tabs = this.ligadosOrigem(E.id);
      for (const T of tabs) {
        let T2 = T;
        if (AdCol) {
          for (let i = 0; i < T.campos.length; i++) {
            const C = T.campos[i];
            if (!C.key) continue;
            const c = this.importaCampo3(T, C, T.texto + '_');
            c.key = false;
            c.fkey = true;
            this.camposOrigem.set(c, C);
          }
        } else {
          const xres = this.criarTabelaAoLado(T);
          T2 = xres;
          const ax = this.removerCaracteresEspeciais(R.texto + (tabs.length > 1 ? '_' + String(tabs.indexOf(T) + 1) : ''));
          T2.texto = ax;
          T2.textoAdicional = str(R.props.descricao);
          T2.observacao = str(R.props.observacao);
          this.linkAdd(R.id, xres);
          this.origemLigacao.set(this.linkTable(T, T2, 0, Card2), T2);
          const TT = T2;
          for (const sufixo of ['_A_', '_B_']) {
            for (const C of T.campos.filter((c) => c.key)) {
              const c = this.importaCampo3(TT, C, T.texto + sufixo);
              c.key = false;
              c.fkey = true;
              this.camposOrigem.set(c, C);
            }
          }
          this.frutoAutoRelacionamento.push(TT);
        }
        if (!this.recebaEConvertaAtributos(this.elem(R), T2, this.g.atributos(R))) return false;
      }
    }
    return true;
  }

  // ---------------------------------------------------------------------------- especialização
  private especializacoesDeEspecializada(ent: Forma, exceto: Forma): Forma[] {
    return this.g.formasLigadas(ent).filter((f) => ehEspecializacao(f) && f !== exceto).filter((e) => this.g.principal(e) !== ent);
  }

  private converterEspecializacao(): boolean {
    const lst = this.origem.formas.filter(ehEspecializacao);
    let i = 0;
    while (i < lst.length) {
      const Esp = lst[i];
      if (this.g.principal(Esp) === null || this.g.qtdPontos(Esp) < 2) {
        this.erros.push(msg(MSG25, Esp.id));
        lst.splice(i, 1);
        continue;
      }
      i++;
    }
    i = 0;
    while (lst.length > 0 && i < lst.length) {
      const Esp = lst[i];
      const entP = this.g.principal(Esp)!;
      let tmpContinue = true;
      for (const espTmp of this.especializacoesDeEspecializada(entP, Esp)) {
        if (lst.indexOf(espTmp) !== -1) {
          tmpContinue = false;
          break;
        }
      }
      if (tmpContinue) {
        if (!this.converterEspecializacaoProcesse(Esp, entP)) return false;
        lst.splice(lst.indexOf(Esp), 1);
        i = 0;
      } else {
        i++;
      }
    }
    return true;
  }

  private converterEspecializacaoProcesse(Esp: Forma, entP: Forma): boolean {
    const lst = this.g.formasLigadas(Esp).filter((o) => ehPreEntidade(o) && o !== entP);
    let padrao = this.g.isParcial(Esp) ? 0 : 1;
    const desab: number[] = [];
    for (const pre of lst) {
      const naoPrincipal = this.g.formasLigadas(pre).filter((e) => ehEspecializacao(e) && this.g.principal(e) !== pre).length;
      if (naoPrincipal > 1) {
        padrao = 0;
        desab.push(1);
        break;
      }
    }
    const textos = [
      'Conversão de especialização/generalização ' + (this.g.isParcial(Esp) ? 'parcial e  ' : this.g.isTotal(Esp) ? 'total e  ' : '')
        + (this.g.isExclusiva(Esp) ? 'exclusiva' : this.g.isNaoExclusiva(Esp) ? 'não exclusiva' : ''),
      lst.length === 1 ? msg('Uma entidade especializada encontrada partindo de %s', entP.texto) : msg('%d entidades especializadas partindo de %s ', lst.length, entP.texto),
      linhaObservacoes(str(Esp.props.observacao), Esp.texto, false),
    ];
    const opcoes = ['Uso de uma tabela para cada entidade.', 'Uso de uma única tabela para toda hierarquia.'];
    if (this.g.formasLigadas(entP).filter((e) => ehEspecializacao(e) && this.g.principal(e) === entP).length === 1) {
      opcoes.push('Uso de tabela apenas para entidade(s) especializada(s)' + (this.g.isParcial(Esp) ? '(desaconselhado em especialização parcial)' : ''));
    } else {
      textos.push('Informações: entidade base de especialização/generalização/união.');
    }
    if (desab.length) textos.push('Informações: especialização/generalização especializada');
    const opc = this.pergunta('especializacao', padrao, desab, Esp.id, { textos, opcoes, observacoes: [] });
    const principais = this.ligadosOrigem(entP.id);
    for (const principal of principais) {
      const secundarias: LTabela[] = [];
      for (const pre of lst) for (const t of this.ligadosOrigem(pre.id)) secundarias.push(t);
      const pretx = (isUpper(principal.texto) ? PREFIXO_FK : PREFIXO_FK.toLowerCase()) + principal.texto + '_';
      switch (opc) {
        case 0:
          for (const s of secundarias) {
            this.origemLigacao.set(this.linkTable(principal, s, 0, 1), s);
            this.importaCampoChaveKFK(principal, s, pretx);
          }
          break;
        case 1: {
          const st = secundarias.filter((s) => s !== principal).map((s) => ', ' + s.texto).join('');
          for (const s of secundarias.filter((x) => x !== principal)) {
            this.moverLigacoes(s, principal);
            const oldkeys = principal.campos.filter((c) => c.key);
            this.importaCampo(s, principal);
            this.normaliseImportacaoKeys(principal, oldkeys, secundarias, pretx);
            this.trocarLinksDestino(s, principal);
            this.dl.removerTabela(s);
          }
          if (this.g.isExclusiva(Esp)) {
            if (!this.campoTipoJaSetado.has(principal)) {
              const c = principal.add('');
              const ax = this.removerCaracteresEspeciais(principal.texto);
              c.texto = ax + SUFIXO_TIPO;
              c.tipo = TIPO_INT;
              c.observacao = msg(MSG39, principal.texto);
              this.campoTipoJaSetado.set(principal, c);
            }
            const ct = this.campoTipoJaSetado.get(principal)!;
            ct.observacao = ct.observacao + st;
          }
          break;
        }
        case 2: {
          for (const L of principal.linhas) {
            const ori = L.outraPonta(principal);
            for (const s of secundarias.filter((x) => x !== principal && ori !== x)) {
              let c1 = L.cardA;
              let c2 = L.cardB;
              if (L.a !== principal) {
                c2 = L.cardA;
                c1 = L.cardB;
              }
              this.origemLigacao.set(this.linkTable(ori, s, c2, c1), s);
            }
            this.dl.removerLinha(L);
          }
          const destEqPrinc = this.links.filter((p) => p.destino === principal);
          this.links = this.links.filter((p) => p.destino !== principal);
          for (const s of secundarias.filter((x) => x !== principal)) {
            this.importaCampo(principal, s);
            for (const dp of destEqPrinc) this.linkAdd(dp.origem, s);
            this.linkAdd(entP.id, s);
          }
          this.dl.removerTabela(principal);
          this.links = this.links.filter((p) => !(p.origem === entP.id && p.destino === principal));
          break;
        }
      }
    }
    return true;
  }

  private normaliseImportacaoKeys(principal: LTabela, oldkeys: LCampo[], secundarias: LTabela[], pretx: string): void {
    const newkeys = principal.campos.filter((c) => c.key && !oldkeys.includes(c));
    if (newkeys.length === 0) return;
    const tbFks: LTabela[] = [];
    for (const [dest, ori] of this.camposOrigem) {
      if (oldkeys.includes(ori)) {
        const tbl = dest.tabela;
        if (!secundarias.includes(tbl) && !tbFks.includes(tbl)) tbFks.push(tbl);
      }
    }
    if (tbFks.length === 0) return;
    for (const a of newkeys) {
      for (const tab of tbFks) {
        const c = tab.add('_');
        c.texto = this.removerCaracteresEspeciais(pretx + a.texto);
        c.tipo = a.tipo;
        c.fkey = true;
        this.camposOrigem.set(c, a);
        c.observacao = a.observacao;
        c.dicionario = a.dicionario;
      }
    }
  }

  // ---------------------------------------------------------------------------- união
  private converterUniao(): boolean {
    const unioes = this.origem.formas.filter(ehUniao);
    let i = 0;
    while (i < unioes.length) {
      const U = unioes[i];
      if (this.g.principal(U) === null || this.g.qtdPontos(U) < 2) {
        this.erros.push(msg(MSG74, U.id));
        unioes.splice(i, 1);
        continue;
      }
      i++;
    }
    for (const U of unioes) {
      const entP = this.g.principal(U)!;
      const lst = this.g.formasLigadas(U).filter((o) => ehPreEntidade(o) && o !== entP);
      const opc = this.pergunta('uniao', 0, [], U.id, {
        textos: [
          'Conversão de união de entidades referente a ' + msg('%d entidades especializadas partindo de %s ', lst.length, entP.texto),
          linhaObservacoes(str(U.props.observacao), U.texto, false),
        ],
        opcoes: ['Uso de uma tabela para cada entidade.', 'Uso de uma única tabela para toda hierarquia.'],
        observacoes: [],
      });
      if (opc === 0) {
        for (const principal of this.ligadosOrigem(entP.id)) {
          const oldkeys = principal.campos.filter((c) => c.key);
          const secundarias: LTabela[] = [];
          const prefx = (isUpper(principal.texto) ? PREFIXO_FK : PREFIXO_FK.toLowerCase()) + principal.texto + '_';
          for (const pre of lst) {
            for (const s of this.ligadosOrigem(pre.id)) {
              this.origemLigacao.set(this.linkTable(principal, s, -1, 0), s);
              this.importaCampoChave(principal, s, prefx);
              secundarias.push(s);
            }
          }
          this.normaliseImportacaoKeys(principal, oldkeys, secundarias, prefx);
        }
      } else if (opc === 1) {
        for (const pre of lst) {
          const secundarias = this.ligadosOrigem(pre.id);
          for (const principal of this.ligadosOrigem(entP.id)) {
            const oldkeys = principal.campos.filter((c) => c.key);
            for (const s of secundarias) {
              this.cloneLigacoes(s, principal);
              this.importaCampo(s, principal);
              const destEqPrinc = this.links.filter((p) => p.destino === s);
              this.links = this.links.filter((p) => p.destino !== s);
              for (const dp of destEqPrinc) this.linkAdd(dp.origem, principal);
            }
            const pretx = (isUpper(principal.texto) ? PREFIXO_FK : PREFIXO_FK.toLowerCase()) + principal.texto + '_';
            this.normaliseImportacaoKeys(principal, oldkeys, secundarias, pretx);
          }
          for (const s of secundarias) {
            const linhas = [...s.linhas];
            this.dl.removerTabela(s);
            for (const L of linhas) this.dl.removerLinha(L);
          }
        }
      }
    }
    return true;
  }

  // ---------------------------------------------------------------------------- relacionamentos
  private converterRelacionamento(): boolean {
    const lst: Elem[] = this.origem.formas.filter(ehRelacionamento).map((f) => this.elem(f));
    for (const ea of this.origem.formas.filter((f) => f.kind === 'entidadeAssociativa')) lst.push(this.elem(ea, true));

    let j = 0;
    while (j < lst.length) {
      const re = lst[j];
      if (this.g.ehAutoRelacionamento(re.f, re.interno)) {
        lst.splice(j, 1);
        continue;
      }
      if (this.g.formasLigadas(re.f, re.interno).filter(ehPreEntidade).length < 2) {
        this.erros.push(msg(MSG40, this.texto(re)));
        lst.splice(j, 1);
        continue;
      }
      j++;
    }

    for (const re of lst) {
      const ligacoes = this.g.ligacoesDeEntidade(re.f, re.interno);
      const tl = ligacoes.filter((p) => cardParaInt(p.lig.cardDe) === 0).length;
      if (tl === ligacoes.length) {
        if (!this.converterRelacionamentoMerge(re, ligacoes.map((p) => p.outra), true)) return false;
        continue;
      }
      if (ligacoes.length > 2) {
        if (!this.converterRelacionamentoTernario(re, ligacoes)) return false;
      } else if (!this.converterRelacionamentoBinario(re, ligacoes)) {
        return false;
      }
    }
    return true;
  }

  private atributosDe(re: Elem): Forma[] {
    return this.g.formasLigadas(re.f, re.interno).filter(ehAtributo);
  }

  private converterRelacionamentoMerge(re: Elem, lst: Forma[], porCardinalidade: boolean): boolean {
    const tabelas: LTabela[] = [];
    for (const pree of lst) for (const t of this.ligadosOrigem(pree.id)) if (!tabelas.includes(t)) tabelas.push(t);
    if (tabelas.length < 2) {
      if (tabelas.length === 1) return this.recebaEConvertaAtributos(re, tabelas[0], this.atributosDe(re));
      return true;
    }
    const prin = tabelas.shift()!;
    for (const a of this.atributosDe(re)) this.importaComoCampo(prin, a);
    const unificadas: string[] = [prin.texto];
    for (const t of tabelas) unificadas.push(t.texto);
    let x = prin.x;
    let y = prin.y;
    for (const t of tabelas) {
      this.trocarLinksDestino(t, prin);
      if (this.moverLigacoes(t, prin)) this.importaCampo(t, prin);
      this.dl.removerTabela(t);
      x += t.x;
      y += t.y;
      prin.texto = this.removerCaracteresEspeciais(prin.texto + '_' + t.texto);
    }
    const avisoNome = this.limiteDeNome(prin);
    this.avisos.push(msg(porCardinalidade ? MSG_FUSAO : MSG_FUSAO_OPCAO, this.texto(re), unificadas.join(', '), prin.texto));
    if (avisoNome !== null) this.avisos.push(avisoNome);
    x = idiv(x, tabelas.length + 1);
    y = idiv(y, tabelas.length + 1);
    prin.mover(x - prin.x, y - prin.y);
    this.linkAdd(re.key, prin);
    return true;
  }

  private converterRelacionamentoTernario(re: Elem, ligacoes: { lig: Ligacao; outra: Forma }[]): boolean {
    const tabelas: LTabela[] = [];
    const cards: number[] = [];
    for (const L of ligacoes) {
      for (const t of this.ligadosOrigem(L.outra.id)) {
        if (!tabelas.includes(t)) {
          tabelas.push(t);
          cards.push(cardParaInt(L.lig.cardDe));
        }
      }
    }
    if (tabelas.length < 2) {
      if (tabelas.length === 1) return this.recebaEConvertaAtributos(re, tabelas[0], this.atributosDe(re));
      return true;
    }
    const [lx, ly] = this.local(re);
    const prin = this.dl.novaTabela(lx, ly);
    prin.texto = this.removerCaracteresEspeciais(this.texto(re));
    prin.textoAdicional = this.textoAdicional(re);
    prin.observacao = this.observacao(re);
    for (let i = 0; i < tabelas.length; i++) {
      const t = tabelas[i];
      const card = cards[i];
      const card2 = card === 1 || card === 3 ? 1 : 0;
      this.origemLigacao.set(this.linkTable(prin, t, card2, card), prin);
      this.importaCampoChave(t, prin, t.texto + '_');
      prin.texto = this.removerCaracteresEspeciais(prin.texto + '_' + t.texto);
    }
    this.limiteDeNomeComAviso(prin);
    this.linkAdd(re.key, prin);
    return true;
  }

  private converterRelacionamentoBinario(re: Elem, ligacoes: { lig: Ligacao; outra: Forma }[]): boolean {
    const tabelasO: LTabela[] = [];
    const tabelasD: LTabela[] = [];
    const cards: number[] = [];
    const entidades: Forma[] = [];
    for (const L of ligacoes) {
      entidades.push(L.outra);
      cards.push(cardParaInt(L.lig.cardDe));
    }
    for (const t of this.ligadosOrigem(entidades[0].id)) if (!tabelasO.includes(t)) tabelasO.push(t);
    for (const t of this.ligadosOrigem(entidades[1].id)) if (!tabelasD.includes(t)) tabelasD.push(t);

    if (tabelasO.length === 0 || tabelasD.length === 0) {
      if (tabelasO.length === 0 && tabelasD.length === 0) return true;
      return this.recebaEConvertaAtributos(re, tabelasO.length === 0 ? tabelasD[0] : tabelasO[0], this.atributosDe(re));
    }

    let card1: number;
    let card2: number;
    let ent1: Forma;
    let ent2: Forma;
    let tabsOrigem: LTabela[];
    let tabsDestino: LTabela[];
    if (cards[1] < cards[0]) {
      card1 = cards[1];
      card2 = cards[0];
      ent2 = entidades[0];
      ent1 = entidades[1];
      tabsDestino = tabelasO;
      tabsOrigem = tabelasD;
    } else {
      tabsDestino = tabelasD;
      tabsOrigem = tabelasO;
      card1 = cards[0];
      card2 = cards[1];
      ent1 = entidades[0];
      ent2 = entidades[1];
    }
    const attrs = this.atributosDe(re);

    if ((card1 === 0 && card2 === 0) || (card1 < 2 && card2 > 1) || (card1 === 0 && card2 === 1)) {
      // opções: 0 = FK em ent2 (recebe a chave de ent1); 1 = (card2 == 0) FK no outro sentido | (card2 == 1) fundir; última = tabela nova
      const opcoesRel = [msg('Adicionar a(s) chave(s) de "%s" à "%s".', ent1.texto, ent2.texto)];
      if (card2 === 0) opcoesRel.push(msg('Adicionar a(s) chave(s) de "%s" à "%s".', ent2.texto, ent1.texto));
      else if (card2 === 1) opcoesRel.push(msg('Fundir as tabelas relacionadas com "%s" a "%s".', ent1.texto, ent2.texto));
      opcoesRel.push('Criar uma tabela para o relacionamento.');
      const opc = this.pergunta('relacionamento', 0, [], re.f.id, {
        textos: [
          msg('Relacionamento com cardinalidade %s e %s. Observações:', cardParaTexto(card1), cardParaTexto(card2)),
          msg('Entre "%s" e "%s"', ent1.texto, ent2.texto) + msg('. Relacionamento: %s', this.texto(re)),
          linhaObservacoes(this.observacao(re), this.texto(re), true),
        ],
        opcoes: opcoesRel,
        observacoes: [],
      });
      if (opc === 0 || (opc === 1 && card2 === 0)) {
        if (opc === 0) {
          const pf = isUpper(ent1.texto) ? PREFIXO_FK : PREFIXO_FK.toLowerCase();
          for (const tab1 of tabsOrigem) {
            for (const tab2 of tabsDestino) {
              if (tab1 !== tab2) {
                this.importaCampoChave(tab1, tab2, pf + ent1.texto + '_');
                this.origemLigacao.set(this.linkTable(tab1, tab2, card1, card2), tab2);
                this.linkAdd(re.key, tab2);
              } else {
                this.adicionarChaveEstrangeira(tab1, tab1, null);
              }
            }
          }
        } else {
          const pf = isUpper(ent2.texto) ? PREFIXO_FK : PREFIXO_FK.toLowerCase();
          for (const tab2 of tabsDestino) {
            for (const tab1 of tabsOrigem) {
              if (tab1 !== tab2) {
                this.importaCampoChave(tab2, tab1, pf + ent2.texto + '_');
                this.origemLigacao.set(this.linkTable(tab2, tab1, card2, card1), tab1);
                this.linkAdd(re.key, tab1);
              } else {
                this.adicionarChaveEstrangeira(tab1, tab1, null);
              }
            }
          }
        }
        const oldopc = opc;
        let continuo = card2 === 0 ? -1 : 3;
        let tl = 0;
        for (const a of attrs) {
          if (continuo < 2) {
            let padrao = oldopc;
            if (attrs.length > 1 && tl < attrs.length - 1) padrao = oldopc + 2;
            const opcoesAt = [
              msg('Mover os atributos do relacionamento para o resultante da entidade "%s".', ent2.texto),
              msg('Mover os atributos do relacionamento para "%s".', ent1.texto),
            ];
            if (attrs.length > 1 && tl < attrs.length - 1) {
              opcoesAt.push(msg('Mover todos os demais atributos do relacionamento para o resultante da entidade "%s".', ent2.texto));
              opcoesAt.push(msg('Mover todos os demais atributos do relacionamento para o resultante da entidade "%s".', ent1.texto));
            }
            continuo = this.pergunta('atributoDeRelacionamento', padrao, [], a.id, {
              textos: [msg('Encontrado atributo "%s" no relacionamento "%s"!', a.texto, this.texto(re)), linhaObservacoes(str(a.props.observacao), a.texto, true)],
              opcoes: opcoesAt,
              observacoes: [],
            });
          }
          tl++;
          const tmp = [a];
          if (continuo === 0 || continuo === 2) {
            for (const tab1 of tabsOrigem) if (!this.recebaEConvertaAtributos(re, tab1, tmp)) return false;
          } else {
            for (const tab2 of tabsDestino) if (!this.recebaEConvertaAtributos(re, tab2, tmp)) return false;
          }
        }
        return true;
      } else if (opc === 1 && card2 === 1) {
        return this.converterRelacionamentoMerge(re, entidades, false);
      }
    }

    const [lx, ly] = this.local(re);
    const prin = this.dl.novaTabela(lx, ly);
    const nomeRe = this.texto(re);
    prin.texto = this.removerCaracteresEspeciais(nomeRe === '' ? ent1.texto + '_' + ent2.texto : nomeRe);
    prin.textoAdicional = this.textoAdicional(re);
    prin.observacao = this.observacao(re);
    const pf = isUpper(prin.texto) ? PREFIXO_FK : PREFIXO_FK.toLowerCase();
    const jaLigada: LTabela[] = [];
    for (const t of tabsOrigem) {
      const c2 = card1;
      let c1 = 1;
      if (c2 === 0 || c2 === 2) c1 = 0;
      if (prin !== t) {
        this.origemLigacao.set(this.linkTable(prin, t, c2, c1), prin);
        jaLigada.push(t);
      }
      this.importaCampoChave(t, prin, pf + t.texto + '_');
    }
    for (const t of tabsDestino) {
      const c2 = card2;
      let c1 = 1;
      if (c2 === 0 || c2 === 2) c1 = 0;
      if (jaLigada.includes(t)) {
        const lig = this.linkTable(prin, t, c2, c1);
        this.origemLigacao.set(lig, prin);
        this.adicionarChaveEstrangeira(prin, t, lig);
      } else {
        if (prin !== t) this.origemLigacao.set(this.linkTable(prin, t, c2, c1), prin);
        this.importaCampoChave(t, prin, pf + t.texto + '_');
      }
    }
    if (!this.recebaEConvertaAtributos(re, prin, attrs)) return false;
    this.linkAdd(re.key, prin);
    return true;
  }

  private adicionarChaveEstrangeira(tabRecebedora: LTabela, tabOrigemPK: LTabela, lig: LLinha | null): void {
    const novaFK = new LConstraint(tabRecebedora);
    novaFK.tipo = 'FK';
    const camposKey = tabOrigemPK.campos.filter((c) => c.key);
    const pf = isUpper(tabRecebedora.texto) ? PREFIXO_FK : PREFIXO_FK.toLowerCase();
    for (const C of camposKey) {
      const c = this.importaCampoIgnoreConstrais(tabRecebedora, C, pf + tabOrigemPK.texto + '_');
      c.fkey = true;
      novaFK.add(C, c);
    }
    this.directFK.set(novaFK, lig);
    this.directPK.set(novaFK, tabOrigemPK);
  }

  // ---------------------------------------------------------------------------- entidade associativa
  private converterEntidadeAssociativa(): boolean {
    for (const entP of this.origem.formas.filter((f) => f.kind === 'entidadeAssociativa')) {
      const principal = this.ligadosOrigem(entP.id)[0] ?? null;
      const secundaria = this.ligadosOrigem(entP.id + '#interno')[0] ?? null;
      if (principal === null || secundaria === null) {
        this.erros.push(msg(MSG40, entP.texto));
        continue;
      }
      this.moverLigacoes(secundaria, principal);
      this.importaCampo(secundaria, principal);
      this.trocarLinksDestino(secundaria, principal);
      principal.texto = this.removerCaracteresEspeciais(principal.texto + '_' + secundaria.texto);
      this.limiteDeNomeComAviso(principal);
      this.dl.removerTabela(secundaria);
    }
    return true;
  }

  // ---------------------------------------------------------------------------- constraints
  private condicaoIR(linha: LLinha | null, tabFk: LTabela, IR: LConstraint): void {
    if (linha === null) return;
    let cardA: number;
    let cardB: number;
    if (linha.b === tabFk) {
      cardA = linha.cardA;
      cardB = linha.cardB;
    } else {
      cardA = linha.cardB;
      cardB = linha.cardA;
    }
    // 0 = (1,1), 1 = (0,1), 2 = (1,n), 3 = (0,n)
    if (cardA === 1) {
      IR.onDelete = cardB === 3 || cardB === 1 ? 'SET NULL' : 'CASCADE';
    } else if (cardA === 0) {
      IR.onDelete = cardB === 3 || cardB === 1 ? 'CASCADE' : 'RESTRICT';
    } else {
      IR.onDelete = 'NO ACTION';
    }
  }

  private processeConstraints(): boolean {
    for (const tb of this.dl.tabelas) for (const cmp of [...tb.campos]) if (cmp.key) tb.processeIrKey(cmp);
    for (const tbFk of this.dl.tabelas) {
      for (const cmp of [...tbFk.campos]) {
        if (!(cmp.fkey && this.camposOrigem.get(cmp))) continue;
        const cmpOri = this.camposOrigem.get(cmp)!;
        const tbPk = cmpOri.tabela;
        const constrPk = tbPk.constraints.find((c) => c.tipo === 'PK') ?? null;
        let constrFk = tbFk.constraints.find((c) => c.tipo === 'FK' && c.constraintOrigem === constrPk) ?? null;
        if (constrFk === null) {
          constrFk = new LConstraint(tbFk);
          constrFk.tipo = 'FK';
        }
        const lin = tbFk.linhas.find((L) => L.outraPonta(tbFk) === tbPk && this.origemLigacao.get(L) === tbFk) ?? null;
        constrFk.addFK(cmpOri, cmp, lin, constrPk);
        this.condicaoIR(lin, tbFk, constrFk);
      }
      if (this.frutoAutoRelacionamento.includes(tbFk)) this.processeFrutoAutoRel(tbFk);
    }
    return this.processeConstraintsDirect();
  }

  private processeConstraintsDirect(): boolean {
    for (const [fk, lig] of this.directFK) {
      const tPk = this.directPK.get(fk)!;
      const constrPk = tPk.constraints.find((c) => c.tipo === 'PK') ?? null;
      if (constrPk !== null) {
        const tFk = fk.tabela;
        const pf = isUpper(tFk.texto) ? PREFIXO_FK : PREFIXO_FK.toLowerCase();
        for (const C of tPk.campos.filter((cm) => cm.key && fk.origem.indexOf(cm) < 0)) {
          const c = this.importaCampoIgnoreConstrais(tFk, C, pf + tPk.texto + '_');
          c.fkey = true;
          fk.add(C, c);
        }
        fk.ligacaoDireta(constrPk, lig);
        this.condicaoIR(lig, tFk, fk);
      }
    }
    return true;
  }

  private processeFrutoAutoRel(tbFk: LTabela): void {
    const ascons = tbFk.constraints.filter((c) => c.tipo === 'FK');
    for (const constrFk of ascons) {
      const tmp: (LCampo | null)[] = [];
      const replicado: (LCampo | null)[] = [];
      for (let i = 0; i < constrFk.origem.length; i++) {
        const co = constrFk.origem[i];
        if (tmp.indexOf(co) > -1) replicado.push(constrFk.destino[i]);
        else tmp.push(co);
      }
      if (replicado.length === 0) continue;
      const novaFk = new LConstraint(tbFk);
      novaFk.tipo = 'FK';
      let lin = constrFk.ligacao;
      if (lin !== null) {
        let Card2 = lin.cardB;
        if (lin.b !== tbFk) Card2 = lin.cardA;
        lin = this.linkTable(constrFk.constraintOrigem!.tabela, tbFk, 0, Card2);
        this.origemLigacao.set(lin, tbFk);
      }
      const lig = lin;
      for (const rp of replicado) {
        const idx = constrFk.destino.indexOf(rp);
        const cmpOri = idx > -1 ? constrFk.origem[idx] : null;
        if (rp) constrFk.removeFromDestino(rp);
        novaFk.addFK(cmpOri, rp, lig, constrFk.constraintOrigem);
      }
      this.condicaoIR(lin, tbFk, novaFk);
    }
  }

  private renomeieFKs(): void {
    for (const tt of this.dl.tabelas) {
      const nm: string[] = [];
      const pf = isUpper(tt.texto) ? PREFIXO_FK : PREFIXO_FK.toLowerCase();
      for (const C of tt.campos.filter((c) => c.fkey && c.campoOrigem !== null && c.tabelaOrigem !== null)) {
        const ax = this.nomeDeCampoGerado(pf + C.tabelaOrigem!.texto + '_' + C.campoOrigem!.texto, (n) => nm.indexOf(n) > -1);
        nm.push(ax);
        C.texto = ax;
      }
      if (this.frutoAutoRelacionamento.includes(tt)) {
        const ja: string[] = [];
        for (const cmp of tt.campos) {
          if (ja.indexOf(cmp.texto) > -1) cmp.texto = cmp.texto + '_' + tt.texto;
          else ja.push(cmp.texto);
        }
      }
    }
  }

  executar(): boolean {
    const ok = this.perguntaCaracteres() && this.converterEntidades() && this.converterAtributos() && this.converterEspecializacao()
      && this.converterUniao() && this.converterAutoRelacionamento() && this.converterRelacionamento()
      && this.converterEntidadeAssociativa() && this.processeConstraints();
    if (ok) {
      this.renomeieFKs();
      organizarTabelas(this.dl);
    }
    return ok;
  }
}

/**
 * Conceitual -> Lógico. Mesmos passos, decisões e nomes de `conversorConceitualParaLogico.beginConvert`
 * (o diálogo de opções é `opcoes.escolher`; sem ele valem as respostas padrão de cada pergunta).
 */
export function conceitualParaLogico(d: Diagrama, opcoes: OpcoesConversao = {}): ResultadoConversao {
  const conv = new ConversorCL(d, opcoes);
  conv.executar();
  return { diagrama: serializarLogico(conv.dl, d.nome), avisos: conv.avisos, erros: conv.erros };
}

// ============================================================================================================
// Geometria do Conceitual (o mínimo que o layout usa: formas, pontos de ligação e cardinalidades)
// ============================================================================================================

export type TipoG = 'ent' | 'rel' | 'attr' | 'card';

/** Ponto de ligação (`PontoDeLinha`): lado 0=esquerda, 1=topo, 2=direita, 3=base; (cx, cy) = centro; 6x6. */
export class GPonto {
  lado = 0;
  cx = 0;
  cy = 0;
  em: GForma | null = null;
  constructor(public readonly linha: GLigacao, public readonly ehA: boolean) {}
  get left(): number {
    return this.cx - 3;
  }
  get top(): number {
    return this.cy - 3;
  }
  get outro(): GPonto {
    return this.ehA ? this.linha.b : this.linha.a;
  }
}

export class GLigacao {
  a: GPonto = new GPonto(this, true);
  b: GPonto = new GPonto(this, false);
  card: GForma | null = null;
  /** Ligação web correspondente (quando o modelo veio/vai para o JSON). */
  cardTexto = 3;
  papel = '';
  duplaLinha = false;
}

/** Forma do diagrama conceitual em construção. */
export class GForma implements Caixa {
  pontos: GPonto[] = [];
  texto = '';
  descricao = '';
  observacao = '';
  extra: Record<string, unknown> = {};
  direcao: 'Left' | 'Right' = 'Left';
  /** Ponto que a cardinalidade acompanha. */
  fixo: GPonto | null = null;
  constructor(public tipo: TipoG, public x: number, public y: number, public w: number, public h: number) {}

  get right(): number {
    return this.x + this.w;
  }

  get bottom(): number {
    return this.y + this.h;
  }

  /** `DoMove`: move a forma e os pontos de ligação ligados a ela. */
  mover(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    if (this.tipo !== 'card') {
      for (const p of this.pontos) {
        p.cx += dx;
        p.cy += dy;
        // o ponto avisa a linha (meOrganizeLigacao -> reSetBounds -> PrepareCardinalidade): a etiqueta é reposicionada
        // a partir do ponto da entidade, sempre que qualquer ponta da ligação se mexe
        const card = p.linha.card;
        if (card?.fixo) posicioneCardinalidade(card, card.fixo);
      }
    }
  }

  /** Mantém a forma dentro do canvas. */
  reenquadre(): void {
    let ax = this.x < 0 ? 0 : this.x;
    let ay = this.y < 0 ? 0 : this.y;
    if (this.x + this.w > CANVAS) ax = CANVAS - this.w;
    if (this.y + this.h > CANVAS) ay = CANVAS - this.h;
    if (ax !== this.x || ay !== this.y) this.mover(ax - this.x, ay - this.y);
  }
}

function dist(px: number, py: number, qx: number, qy: number): number {
  const dx = px - qx;
  const dy = py - qy;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Os 12 pontos de ligação do losango. */
function subPontosLosango(f: GForma): [number, number][] {
  const p4: [number, number] = [f.x + idiv(f.w, 2), f.y];
  const p5: [number, number] = [f.x + f.w, f.y + idiv(f.h, 2)];
  const p6: [number, number] = [f.x + idiv(f.w, 2), f.y + f.h];
  const p7: [number, number] = [f.x, f.y + idiv(f.h, 2)];
  const p0: [number, number] = [p7[0], p4[1]];
  const p1: [number, number] = [p5[0], p4[1]];
  const x = p6[0] - f.x; // pontoPosi6.x - pontoPosi3.x
  const y = f.y + f.h - p7[1]; // pontoPosi3.y - pontoPosi7.y
  let tam = idiv(x, 3);
  const nvX1 = x - tam;
  const nvX2 = nvX1 - tam;
  tam = idiv(y, 3);
  const nvY2 = y - tam;
  const nvY1 = nvY2 - tam;
  const sp: [number, number][] = new Array(12);
  sp[0] = p7;
  sp[1] = p4;
  sp[2] = p5;
  sp[3] = p6;
  sp[4] = [nvX2 + p0[0], nvY2 + p0[1]];
  sp[5] = [nvX1 + p0[0], nvY1 + p0[1]];
  sp[6] = [nvX1 + p4[0], nvY2 + p1[1]];
  sp[7] = [nvX2 + p6[0], nvY2 + p5[1]];
  sp[11] = [nvX1 + p7[0], nvY2 + p7[1]];
  sp[9] = [nvX2 + p4[0], nvY1 + p1[1]];
  sp[10] = [nvX1 + p6[0], nvY1 + p5[1]];
  sp[8] = [nvX2 + p7[0], nvY1 + p7[1]];
  return sp;
}

/** Acomoda o ponto no lado (ou ponto de ligação) certo da forma. */
export function posicionePonto(f: GForma, p: GPonto): void {
  if (f.tipo === 'ent') {
    // ordem: 0 = esquerda, 1 = topo, 2 = direita, 3 = base
    const v = [p.cx - f.x, p.cy - f.y, f.x + f.w - p.cx, f.y + f.h - p.cy];
    let mx = 0;
    for (let i = 1; i < 4; i++) if (v[mx] > v[i]) mx = i;
    p.lado = mx;
    switch (mx) {
      case 0:
        p.cx = f.x - 3 - 1 + 3;
        break;
      case 1:
        p.cy = f.y - 3 - 1 + 3;
        break;
      case 2:
        p.cx = f.x + f.w - 3 + 3;
        break;
      case 3:
        p.cy = f.y + f.h - 3 + 3;
        break;
    }
  } else if (f.tipo === 'rel') {
    const ll = subPontosLosango(f);
    let mx = 0;
    let dmx = dist(p.cx, p.cy, ll[0][0], ll[0][1]);
    for (let i = 1; i < ll.length; i++) {
      const d = dist(p.cx, p.cy, ll[i][0], ll[i][1]);
      if (dmx > d) {
        mx = i;
        dmx = d;
      }
    }
    p.cx = ll[mx][0];
    p.cy = ll[mx][1];
    if (mx > 3) mx -= 4;
    if (mx > 3) mx -= 4;
    p.lado = mx;
  } else if (f.tipo === 'attr') {
    // Posiciona o atributo: âncora esquerda ou direita, a mais próxima
    const l: [number, number] = [f.x, f.y + idiv(f.h, 2)];
    const r: [number, number] = [f.x + f.w, f.y + idiv(f.h, 2)];
    const dp0 = dist(p.cx, p.cy, l[0], l[1]);
    const dp2 = dist(p.cx, p.cy, r[0], r[1]);
    if (dp0 < dp2) {
      p.cx = l[0];
      p.cy = l[1];
      p.lado = 0;
    } else {
      p.cx = r[0];
      p.cy = r[1];
      p.lado = 2;
    }
  }
}

/** Liga duas formas como `Ligacao.FormasALigar = {A, B}; SuperInicie(0, ptPrimeiro, ptFinal); Ligar()`. */
export function ligarFormas(A: GForma, B: GForma, ptPrimeiro: [number, number], ptFinal: [number, number]): GLigacao {
  const l = new GLigacao();
  // SuperInicie(0, pFim, pIni): o primeiro ponto (ponta A) nasce em ptFinal; o último (ponta B) em ptPrimeiro
  l.a.cx = ptFinal[0];
  l.a.cy = ptFinal[1];
  l.b.cx = ptPrimeiro[0];
  l.b.cy = ptPrimeiro[1];
  l.a.em = A;
  A.pontos.push(l.a);
  posicionePonto(A, l.a);
  l.b.em = B;
  B.pontos.push(l.b);
  posicionePonto(B, l.b);
  return l;
}

/** Posição da cardinalidade: a etiqueta (150x100 enquanto não pintada) acompanha o ponto da entidade. */
export function posicioneCardinalidade(card: GForma, fixo: GPonto): void {
  const corr = 4;
  let x = 0;
  let y = 0;
  const fl = fixo.left;
  const ft = fixo.top;
  switch (fixo.lado) {
    case 0:
    case 2:
      x = fixo.lado === 0 ? fl - card.w - 2 * distSelecao : fl + 6 + 2 * distSelecao;
      y = ft - card.h - distSelecao + corr;
      break;
    case 1:
    case 3:
      y = fixo.lado === 1 ? ft - card.h - 2 * distSelecao : ft + 6 + 2 * distSelecao;
      x = fl - card.w - distSelecao + corr;
      break;
  }
  card.x = x;
  card.y = y;
}

// ---------------------------------------------------------------------------------------------------------
// Organização das entidades do Conceitual
// ---------------------------------------------------------------------------------------------------------

const DIST_ENT_LEFT = 260;
const DIST_ENT_TOP = 220;
const MARGEM_ATRIBUTO = 40;
const DISTANCIA_LINHA = 10; // distância mínima da linha

/** Diagrama conceitual em construção, com as operações de layout. */
export class GDiagrama {
  /** Todos os itens na ordem de criação. */
  itens: (GForma | GLigacao)[] = [];

  get formas(): GForma[] {
    return this.itens.filter((i): i is GForma => i instanceof GForma);
  }

  get ligacoes(): GLigacao[] {
    return this.itens.filter((i): i is GLigacao => i instanceof GLigacao);
  }

  nova(tipo: TipoG, x: number, y: number, w: number, h: number): GForma {
    const f = new GForma(tipo, x, y, w, h);
    this.itens.push(f);
    return f;
  }

  novaLigacao(A: GForma, B: GForma, ptPrimeiro: [number, number], ptFinal: [number, number]): GLigacao {
    const l = ligarFormas(A, B, ptPrimeiro, ptFinal);
    this.itens.push(l);
    return l;
  }

  /** `Ligacao.PrepareCardinalidade`: entidade<->relacionamento ganha a etiqueta, acompanhando o ponto da entidade. */
  prepareCardinalidade(l: GLigacao): void {
    const fa = l.a.em;
    const fb = l.b.em;
    if (!fa || !fb) return;
    let pontoEnt: GPonto | null = null;
    if (fa.tipo === 'ent' && fb.tipo === 'rel') pontoEnt = l.a;
    else if (fb.tipo === 'ent' && fa.tipo === 'rel') pontoEnt = l.b;
    if (pontoEnt === null) {
      if (l.card) {
        this.itens = this.itens.filter((i) => i !== l.card);
        l.card = null;
      }
      return;
    }
    if (!l.card) {
      l.card = new GForma('card', 0, 0, 150, 100);
      this.itens.push(l.card);
    }
    l.card.fixo = pontoEnt;
    posicioneCardinalidade(l.card, pontoEnt);
  }

  private atributosLigados(e: GForma): GForma[] {
    const res: GForma[] = [];
    for (const p of e.pontos) {
      const o = p.outro.em;
      if (o && o.tipo === 'attr') res.push(o);
    }
    return res;
  }

  private maiorLarguraAtributo(e: GForma): number {
    return this.atributosLigados(e).reduce((m, a) => Math.max(m, a.w), 0);
  }

  private alturaEmpilhamentoAtributos(e: GForma): number {
    return this.atributosLigados(e).length * 19;
  }

  private apliqueDistanciaEntidades(ori: GForma, dest: GForma): void {
    const m = mapaPosi(ori, dest);
    const distEntLeft = Math.max(DIST_ENT_LEFT, Math.max(this.maiorLarguraAtributo(ori), this.maiorLarguraAtributo(dest)) + MARGEM_ATRIBUTO);
    const distEntTop = Math.max(DIST_ENT_TOP, Math.max(this.alturaEmpilhamentoAtributos(ori), this.alturaEmpilhamentoAtributos(dest)) + MARGEM_ATRIBUTO);
    let x = 0;
    let y = 0;
    switch (m) {
      case 6:
        if (dest.y - ori.bottom < distEntTop) y = distEntTop - (dest.y - ori.bottom);
        break;
      case 5: {
        const distX = dest.x - ori.right;
        const distY = dest.y - ori.bottom;
        if (distY < distEntTop) y = distEntTop - (dest.y - ori.bottom);
        if (distX < distEntLeft) x = distEntLeft - (dest.x - ori.right);
        if (x > y) {
          x = distX < idiv(distEntLeft, 2) ? idiv(distEntLeft, 2) : 0;
        } else {
          y = distY < idiv(distEntTop, 2) ? idiv(distEntTop, 2) : 0;
        }
        break;
      }
      case 3:
      case 4:
        if (dest.x - ori.right < distEntLeft) x = distEntLeft - (dest.x - ori.right);
        break;
    }
    if (x > 0 || y > 0) dest.mover(x, y);
  }

  private reancoreRelacionamento(r: GForma): void {
    const ligadas: GForma[] = [];
    for (const p of r.pontos) {
      const o = p.outro.em;
      if (o && o.tipo === 'ent') ligadas.push(o);
    }
    if (ligadas.length === 0) return;
    if (new Set(ligadas).size === 1) return;
    let somaX = 0;
    let somaY = 0;
    for (const e of ligadas) {
      somaX += e.x + idiv(e.w, 2);
      somaY += e.y + idiv(e.h, 2);
    }
    const centroX = idiv(somaX, ligadas.length);
    const centroY = idiv(somaY, ligadas.length);
    const novoLeft = centroX - idiv(r.w, 2);
    const novoTop = centroY - idiv(r.h, 2);
    r.mover(novoLeft - r.x, novoTop - r.y);
  }

  /** Reorganiza os atributos ao redor da entidade. */
  organizeAtributos(ent: GForma): void {
    const pts = ent.pontos.filter((p) => p.outro.em?.tipo === 'attr');
    // Ordenação estável (decrescente): empate mantém a ordem original
    const ordenados = pts.map((p, i) => ({ p, i })).sort((a, b) => b.p.left - a.p.left || a.i - b.i).map((x) => x.p);

    const atribuidoA = new Map<GPonto, GForma>();
    const ordemLogica = this.atributosLigados(ent);
    const porLado = new Map<number, GPonto[]>();
    for (const p of ordenados) {
      if (!porLado.has(p.lado)) porLado.set(p.lado, []);
      porLado.get(p.lado)!.push(p);
    }
    for (const grupo of porLado.values()) {
      const grupoEsquerdaDireita = [...grupo].reverse();
      const ordemDoLado: GForma[] = [];
      for (const a of ordemLogica) {
        for (const p of grupo) {
          if (p.outro.em === a) {
            ordemDoLado.push(a);
            break;
          }
        }
      }
      for (let i = 0; i < grupoEsquerdaDireita.length && i < ordemDoLado.length; i++) atribuidoA.set(grupoEsquerdaDireita[i], ordemDoLado[i]);
    }

    let lastL0 = 0;
    let lastL1 = 0;
    let lastL2 = 0;
    let lastL3 = 0;
    for (const p of ordenados) {
      const atr = atribuidoA.get(p) ?? p.outro.em!;
      const disH = 20;
      const disW = 40;
      let X = 0;
      let Y = 0;
      switch (p.lado) {
        case 0:
          atr.direcao = 'Right';
          X = ent.x - disW - atr.w;
          if (lastL0 === 0) {
            Y = ent.y;
            lastL0 = atr.h + 5;
          } else {
            Y = ent.y + lastL0;
            lastL0 += atr.h + 5;
          }
          break;
        case 2:
          atr.direcao = 'Left';
          X = ent.right + disW;
          if (lastL2 === 0) {
            Y = ent.y;
            lastL2 = atr.h + 5;
          } else {
            Y = ent.y + lastL2;
            lastL2 += atr.h + 5;
          }
          break;
        case 1:
          atr.direcao = 'Left';
          X = p.cx + DISTANCIA_LINHA;
          Y = ent.y - disH - atr.h;
          if (lastL1 === 0) {
            lastL1 = atr.h + 5;
          } else {
            Y -= lastL1;
            lastL1 += atr.h + 5;
          }
          break;
        case 3:
          atr.direcao = 'Left';
          X = p.cx + DISTANCIA_LINHA;
          Y = ent.bottom + disH;
          if (lastL3 === 0) {
            lastL3 = atr.h + 5;
          } else {
            Y += lastL3;
            lastL3 += atr.h + 5;
          }
          break;
      }
      atr.mover(X - atr.x, Y - atr.y);
      atr.reenquadre();
    }
  }

  organizeEntidades(): void {
    const formas = this.formas;
    const entidades = formas.filter((f) => f.tipo === 'ent');
    const relacionamentos = formas.filter((f) => f.tipo === 'rel');

    // layout por força
    const nos: GForma[] = [...entidades, ...relacionamentos];
    if (nos.length >= 2) {
      const arestas: [Caixa, Caixa][] = [];
      for (const l of this.ligacoes) {
        const a = l.a.em;
        const b = l.b.em;
        if (a && b && (a.tipo === 'ent' || a.tipo === 'rel') && (b.tipo === 'ent' || b.tipo === 'rel')) arestas.push([a, b]);
      }
      layoutForca(nos, arestas, 150, DIST_ENT_LEFT);
    }

    const par = (lista: GForma[]): void => lista.forEach((e1) => lista.filter((e) => e !== e1).forEach((e2) => this.apliqueDistanciaEntidades(e1, e2)));
    par(entidades);
    const ord = [...entidades].sort((a, b) => a.x - b.x);
    par(ord);

    const entidadesERelacionamentos: GForma[] = [...entidades, ...relacionamentos];
    for (let ciclo = 0; ciclo < 4; ciclo++) {
      ajusteFinal(entidadesERelacionamentos, 300);
      par(entidades);
      par(ord);
    }
    ajusteFinal(entidadesERelacionamentos, 300);

    relacionamentos.forEach((r) => this.reancoreRelacionamento(r));
    entidades.forEach((e) => this.organizeAtributos(e));

    const atributos = this.formas.filter((f) => f.tipo === 'attr');
    afasteSobrepostos(relacionamentos, [...entidades, ...atributos], 30, 4);

    this.ligacoes.forEach((l) => this.prepareCardinalidade(l));

    const cardinalidades = this.formas.filter((f) => f.tipo === 'card');
    const tudo: GForma[] = [...entidades, ...atributos, ...relacionamentos, ...cardinalidades];
    ajusteFinal(tudo, 40);
    afasteSobrepostos(atributos, entidades, 2, 8);
    garantaPositivo(tudo, 40);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Serialização do Conceitual em construção -> Diagrama web
// ---------------------------------------------------------------------------------------------------------

/** Dados das formas web associados a cada forma geométrica. */
export function serializarConceitual(gd: GDiagrama, nome: string, prefixoId = 'f'): Diagrama {
  const ids = new Map<object, string>();
  let n = 0;
  const id = (o: object, p: string): string => {
    let v = ids.get(o);
    if (!v) {
      v = p + n++;
      ids.set(o, v);
    }
    return v;
  };
  const formas: Forma[] = [];
  const ligacoes: Ligacao[] = [];
  const entidadesDaRel = (r: GForma): GForma[] =>
    r.pontos.map((p) => p.outro.em).filter((o): o is GForma => !!o && o.tipo === 'ent');
  for (const it of gd.itens) {
    if (!(it instanceof GForma) || it.tipo === 'card') continue;
    if (it.tipo === 'ent') {
      formas.push({
        id: id(it, prefixoId), kind: 'entidade', x: it.x, y: it.y, w: it.w, h: it.h, texto: it.texto,
        props: { descricao: it.descricao, observacao: it.observacao, atributosOcultos: str(it.extra.atributosOcultos) },
      });
    } else if (it.tipo === 'rel') {
      const ents = entidadesDaRel(it);
      const auto = ents.length === 2 && ents[0] === ents[1];
      formas.push({
        id: id(it, prefixoId), kind: auto ? 'autorelacionamento' : 'relacionamento', x: it.x, y: it.y, w: it.w, h: it.h, texto: it.texto,
        props: { descricao: it.descricao, observacao: it.observacao },
      });
    } else {
      formas.push({
        id: id(it, prefixoId), kind: 'atributo', x: it.x, y: it.y, w: it.w, h: it.h, texto: it.texto,
        props: {
          tipo: str(it.extra.tipo), identificador: it.extra.identificador === true, opcional: it.extra.opcional === true, multivalorado: false,
          cardMin: typeof it.extra.cardMin === 'number' ? it.extra.cardMin : 1,
          cardMax: -1, direcao: it.direcao, descricao: it.descricao, observacao: it.observacao,
        },
      });
    }
  }
  for (const it of gd.itens) {
    if (!(it instanceof GLigacao)) continue;
    const fa = it.a.em;
    const fb = it.b.em;
    if (!fa || !fb) continue;
    let de: GForma;
    let para: GForma;
    let cardDe = '';
    if (fa.tipo === 'attr' || fb.tipo === 'attr') {
      para = fa.tipo === 'attr' ? fa : fb;
      de = fa.tipo === 'attr' ? fb : fa;
    } else {
      const aEnt = fa.tipo === 'ent';
      de = aEnt ? fa : fb;
      para = aEnt ? fb : fa;
      cardDe = cardParaTexto(it.cardTexto);
    }
    ligacoes.push({
      id: id(it, 'l'), kind: 'linha', de: id(de, prefixoId), para: id(para, prefixoId), texto: '', cardDe, cardPara: '',
      props: { papel: it.papel, duplaLinha: it.duplaLinha, interno: false },
    });
  }
  return { nome, tipo: 'conceitual', formas, ligacoes };
}

// ============================================================================================================
// Lógico -> Conceitual (conversorLogicoParaConceitual)
// ============================================================================================================

interface CampoWeb {
  nome?: string;
  tipo?: string;
  pk?: boolean;
  fk?: boolean;
  dicionario?: string;
  observacao?: string;
}

/**
 * Lógico -> Conceitual: cada tabela vira Entidade, cada coluna que não é FK vira Atributo (a PK vira identificador),
 * cada linha de FK vira Relacionamento com as duas cardinalidades; tabela puramente associativa (só FKs/chave própria,
 * ligando exatamente duas tabelas e não referenciada por outra) vira um Relacionamento N:M direto. Em seguida o layout
 * (organização das entidades + afastamento de losangos sobrepostos) é aplicado.
 *
 * A ORDEM em que os atributos das entidades (e as relações vindas de tabelas associativas) são criados segue a
 * ordem das tabelas, o que torna a conversão determinística.
 */
export function logicoParaConceitual(d: Diagrama, _opcoes: OpcoesConversao = {}): ResultadoConversao {
  const tabelas = d.formas.filter((f) => f.kind === 'tabela');
  const porId = new Map(tabelas.map((t) => [t.id, t]));
  interface Linha {
    a: Forma;
    b: Forma;
    cardA: number;
    cardB: number;
  }
  const linhas: Linha[] = [];
  for (const l of d.ligacoes) {
    if (l.kind !== 'logicoLinha') continue;
    const a = porId.get(l.de);
    const b = porId.get(l.para);
    if (!a || !b) continue;
    linhas.push({ a, b, cardA: cardParaInt(l.cardDe), cardB: cardParaInt(l.cardPara) });
  }
  const camposDe = (t: Forma): CampoWeb[] => (Array.isArray(t.props.campos) ? (t.props.campos as CampoWeb[]) : []);

  const tabelasLigadas = (t: Forma): Forma[] => {
    const res: Forma[] = [];
    for (const l of linhas) {
      if (l.a !== t && l.b !== t) continue;
      const o = l.a === t ? l.b : l.a;
      if (o && o !== t && !res.includes(o)) res.push(o);
    }
    return res;
  };
  const associativas = new Set<Forma>();
  for (const t of tabelas) {
    const campos = camposDe(t);
    if (campos.length === 0 || !campos.every((c) => c.fk === true || c.pk === true) || !campos.some((c) => c.fk === true)) continue;
    if (linhas.some((l) => l.a === t)) continue;
    if (tabelasLigadas(t).length === 2) associativas.add(t);
  }

  const gd = new GDiagrama();
  const entidades = new Map<Forma, GForma>();
  const avisos: string[] = [];

  // converterTabelasParaEntidades
  for (const t of tabelas) {
    if (associativas.has(t)) continue;
    const ent = gd.nova('ent', t.x, t.y, t.w, t.h);
    ent.reenquadre();
    ent.texto = t.texto;
    ent.descricao = str(t.props.descricao);
    ent.observacao = str(t.props.observacao);
    entidades.set(t, ent);
  }

  // converterAtributos
  for (const [t, ent] of entidades) {
    let offset = 0;
    for (const c of camposDe(t)) {
      if (c.fk === true) continue;
      const posAttr: [number, number] = [ent.right + 80, ent.y + offset];
      offset += 30;
      const att = gd.nova('attr', posAttr[0], posAttr[1], 72, 14);
      att.texto = str(c.nome);
      att.reenquadre();
      const ptEnt: [number, number] = [ent.right, posAttr[1] + 7];
      gd.novaLigacao(att, ent, posAttr, ptEnt);
      att.extra.tipo = str(c.tipo);
      att.extra.identificador = c.pk === true;
      att.descricao = str(c.dicionario);
      att.observacao = str(c.observacao);
    }
  }

  // converterRelacionamentos
  const relacionamentosCriados: GForma[] = [];
  const criarRelacionamento = (entA: GForma, entB: GForma, nome: string, descricao: string, observacao: string, cardA: number, cardB: number): void => {
    const x = entA.x <= entB.x ? idiv(entA.right + entB.x, 2) : idiv(entB.right + entA.x, 2);
    const y = entA.y <= entB.y ? idiv(entA.bottom + entB.y, 2) : idiv(entB.bottom + entA.y, 2);
    const rel = gd.nova('rel', x, y, 150, 50);
    rel.reenquadre();
    rel.texto = nome;
    rel.descricao = descricao;
    rel.observacao = observacao;
    rel.reenquadre();
    const ptA: [number, number] = [entA.x + idiv(entA.w, 2), entA.y + idiv(entA.h, 2)];
    const ptB: [number, number] = [entB.x + idiv(entB.w, 2), entB.y + idiv(entB.h, 2)];
    const ligA = gd.novaLigacao(entA, rel, ptA, ptB);
    gd.prepareCardinalidade(ligA);
    ligA.cardTexto = cardA;
    const ligB = gd.novaLigacao(entB, rel, ptB, ptA);
    gd.prepareCardinalidade(ligB);
    ligB.cardTexto = cardB;
    rel.reenquadre();
    relacionamentosCriados.push(rel);
  };
  for (const t of associativas) {
    const ligadas = tabelasLigadas(t);
    if (ligadas.length !== 2) continue;
    const entA = entidades.get(ligadas[0]);
    const entB = entidades.get(ligadas[1]);
    if (!entA || !entB) continue;
    criarRelacionamento(entA, entB, t.texto, str(t.props.descricao), str(t.props.observacao), 3, 3);
  }
  for (const lin of linhas) {
    if (associativas.has(lin.a) || associativas.has(lin.b)) continue;
    const entA = entidades.get(lin.a);
    const entB = entidades.get(lin.b);
    if (!entA || !entB) continue;
    criarRelacionamento(entA, entB, 'Relacionamento', '', '', lin.cardA, lin.cardB);
  }

  // Com sucesso: organização das entidades + afastarRelacionamentosSobrepostos
  gd.organizeEntidades();
  afastarRelacionamentosSobrepostos(gd, relacionamentosCriados, [...entidades.values()]);

  return { diagrama: serializarConceitual(gd, d.nome), avisos, erros: [] };
}

function afastarRelacionamentosSobrepostos(gd: GDiagrama, rels: GForma[], entidades: GForma[]): void {
  // reposicioneNoMeioDasEntidades
  for (const rel of rels) {
    const ents = rel.pontos.map((p) => p.outro.em).filter((o): o is GForma => !!o && o.tipo === 'ent');
    if (ents.length !== 2) continue;
    const [entA, entB] = ents;
    const cxDesejado = idiv(entA.x + idiv(entA.w, 2) + entB.x + idiv(entB.w, 2), 2);
    const cyDesejado = idiv(entA.y + idiv(entA.h, 2) + entB.y + idiv(entB.h, 2), 2);
    const cxAtual = rel.x + idiv(rel.w, 2);
    const cyAtual = rel.y + idiv(rel.h, 2);
    rel.mover(cxDesejado - cxAtual, cyDesejado - cyAtual);
  }
  const atributos = gd.formas.filter((f) => f.tipo === 'attr');
  const margem = 30;
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < rels.length; i++) {
      const r1 = rels[i];
      for (const e of entidades) empurreSeSobrepoe(r1, e, margem);
      for (const a of atributos) empurreSeSobrepoe(r1, a, margem);
      for (let j = i + 1; j < rels.length; j++) empurreSeSobrepoe(rels[j], r1, margem);
    }
  }
}
