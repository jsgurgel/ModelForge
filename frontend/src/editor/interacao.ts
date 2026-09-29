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

import { Ponto, intersecta } from './geometry';
import { AreaTransferencia, Doc, colar } from './ops';
import { caminhoDaLigacao } from './roteamento';
import { Diagrama, Forma, Ligacao } from './types';
import { FORMAS, LIGACOES, PALETA } from '../shapes/registry';

/**
 * Regras puras do motor de interação (stream G1): zoom por passos, digitar para editar, Tab, caixa de seleção,
 * regiões da Raia e área de transferência. O Canvas, o store e os atalhos só chamam estas funções.
 */

// ---- zoom (de 5 em 5 %) ---------------------------------------------------------------

/** Zoom de 5% em 5%, de 5% a 500%. */
export const ZOOMS: number[] = Array.from({ length: 100 }, (_, i) => Math.round((i + 1) * 5) / 100);
const TOLERANCIA_ZOOM = 1e-6;

/** Próximo passo acima do zoom atual (o menor maior que o atual); sem passo acima, mantém. */
export function zoomMais(z: number): number {
  return ZOOMS.find((p) => p > z + TOLERANCIA_ZOOM) ?? z;
}

/** Passo imediatamente abaixo do zoom atual; sem passo abaixo, mantém. */
export function zoomMenos(z: number): number {
  for (let i = ZOOMS.length - 1; i >= 0; i--) if (ZOOMS[i] < z - TOLERANCIA_ZOOM) return ZOOMS[i];
  return z;
}

/** Texto do zoom com uma casa decimal: "100.0%", "12.5%". */
export const rotuloZoom = (z: number): string => `${(z * 100).toFixed(1)}%`;

// ---- digitar sobre a forma selecionada -------------------------------------------------------

const EXTRAS_TEXTO = ' !@#$%&*()-_+=\'"[{]},.;:<>|\\/?¬£¢§ªº}';

/** O caractere que inicia a edição de texto, ou null se a tecla não é de texto. */
export function teclaDeTexto(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): string | null {
  if (e.metaKey) return null;
  //# Ctrl+Alt junto é o AltGr do Windows (produz caracteres); Ctrl ou Alt sozinhos são atalhos.
  if ((e.ctrlKey || e.altKey) && !(e.ctrlKey && e.altKey)) return null;
  const k = e.key;
  if (!k || [...k].length !== 1) return null;
  return /[\p{L}\p{N}]/u.test(k) || EXTRAS_TEXTO.includes(k) ? k : null;
}

/** Texto inicial do editor quando a edição começa digitando: "Reescrever ao digitar" (apagarTextoAoEditar) apaga o anterior. */
export const textoAoDigitar = (atual: string, tecla: string, reescrever: boolean): string => (reescrever ? tecla : atual + tecla);

/** Formas de texto editável por digitação (tabelas e coleções abrem o próprio editor). */
export function aceitaDigitar(f: Forma | undefined): boolean {
  if (!f) return false;
  const geo = FORMAS[f.kind]?.geo;
  return !!geo && geo !== 'table' && geo !== 'colecao' && geo !== 'image' && geo !== 'drawer' && geo !== 'bar' && geo !== 'junction';
}

// ---- Ctrl+Tab / Ctrl+Shift+Tab (selecionar próximo / anterior) ---------------------------------------------------

/**
 * Próximo/anterior elemento (formas e depois linhas, na ordem de criação). Só vale com UM item selecionado e mais de um
 * no diagrama; com várias seleções não faz nada (sem rolar em círculo). Devolve null quando não há o que selecionar.
 */
export function vizinhoNaSelecao(ordem: string[], selecao: string[], passo: 1 | -1): string | null {
  if (selecao.length !== 1 || ordem.length < 2) return null;
  const atual = ordem.indexOf(selecao[0]);
  if (atual < 0) return null;
  const n = ordem.length;
  const prox = (atual + passo + n) % n;
  return prox === atual ? null : ordem[prox];
}

export const ordemDeSelecao = (doc: Doc): string[] => [...doc.formas.map((f) => f.id), ...doc.ligacoes.map((l) => l.id)];

// ---- caixa de seleção ---------------------------------------------------------------------------------------------

type Caixa = { x: number; y: number; w: number; h: number };

/** Segmento (a,b) toca o retângulo (Liang-Barsky). */
export function segmentoTocaCaixa(a: Ponto, b: Ponto, c: Caixa): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const teste = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return teste(-dx, a.x - c.x) && teste(dx, c.x + c.w - a.x) && teste(-dy, a.y - c.y) && teste(dy, c.y + c.h - a.y);
}

/** Ligações cujo traçado toca a caixa. */
export function ligacoesNaCaixa(doc: Doc, c: Caixa): string[] {
  const out: string[] = [];
  for (const l of doc.ligacoes) {
    const cam = caminhoDaLigacao(doc, l);
    if (!cam) continue;
    const pts = cam.pontos;
    let toca = pts.length === 1 && pts[0].x >= c.x && pts[0].x <= c.x + c.w && pts[0].y >= c.y && pts[0].y <= c.y + c.h;
    for (let i = 0; !toca && i + 1 < pts.length; i++) toca = segmentoTocaCaixa(pts[i], pts[i + 1], c);
    if (toca) out.push(l.id);
  }
  return out;
}

/** Ids (formas e ligações) atingidos pela caixa; `aditivo` (Shift ou Ctrl) soma à seleção atual em vez de substituí-la. */
export function selecaoDaCaixa(doc: Doc, c: Caixa, atual: string[], aditivo: boolean): string[] {
  const dentro = [...doc.formas.filter((f) => intersecta(f, c)).map((f) => f.id), ...ligacoesNaCaixa(doc, c)];
  return aditivo ? [...new Set([...atual, ...dentro])] : dentro;
}

/** Clique com Shift/Ctrl alterna o item na seleção; sem eles, seleciona só o item (se já não estiver selecionado). */
export function alternarNaSelecao(selecao: string[], id: string, combina: boolean): string[] {
  if (combina) return selecao.includes(id) ? selecao.filter((i) => i !== id) : [...selecao, id];
  return selecao.includes(id) ? selecao : [id];
}

// ---- Raia: regiões (adicionar, remover) --------------------------------------------

export interface AreaRaia { texto: string; largura: number }
export const areasDe = (f: Forma): AreaRaia[] => (Array.isArray(f.props.areas) ? (f.props.areas as AreaRaia[]) : []);

/** Nome livre "Área_N" entre a área padrão e as regiões. */
export function nomeDeArea(f: Forma): string {
  const usados = new Set([String(f.props.areaPadrao ?? 'Área default'), ...areasDe(f).map((a) => a.texto)]);
  let n = 1;
  while (usados.has(`Área_${n}`)) n++;
  return `Área_${n}`;
}

/** Duplo clique na raia: acrescenta uma região de largura max(w / (n + 2), 20). */
export function adicionarAreaRaia(f: Forma): Forma {
  const areas = areasDe(f);
  const largura = Math.max(Math.trunc(f.w / (areas.length + 2)), 20);
  return { ...f, props: { ...f.props, areas: [...areas, { texto: nomeDeArea(f), largura }] } };
}

export function removerAreaRaia(f: Forma, indice: number): Forma {
  const areas = areasDe(f);
  if (indice < 0 || indice >= areas.length) return f;
  return { ...f, props: { ...f.props, areas: areas.filter((_, i) => i !== indice) } };
}

/** Altura da faixa do título da raia (mesma conta do desenho: fonte * 1.25 * 1.5). */
export const alturaTituloRaia = (tamanhoFonte: number): number => Math.round(tamanhoFonte * 1.25 * 1.5);

/** Posição x (relativa à raia) da linha divisória de cada região, como o desenho as traça. */
export function divisoriasDaRaia(f: Forma): number[] {
  const out: number[] = [];
  let x = 0;
  for (const a of areasDe(f)) {
    x += Math.max(1, a.largura);
    if (x >= f.w - 2 || x <= 0) break;
    out.push(x);
  }
  return out;
}

/** Caixa da alça (largura de um ponto e altura de 4 pontos, centrada abaixo do título) da divisória `i`. */
export function alcaDaDivisoria(f: Forma, i: number, tamanhoFonte: number): Caixa | null {
  const xs = divisoriasDaRaia(f);
  if (i < 0 || i >= xs.length) return null;
  const centroY = alturaTituloRaia(tamanhoFonte) + f.h / 2;
  return { x: f.x + xs[i] - 4, y: f.y + centroY - 16, w: 8, h: 32 };
}

/** Índice da região cuja alça está sob o ponto (coordenadas do diagrama), ou -1. */
export function divisoriaNoPonto(f: Forma, p: Ponto, tamanhoFonte: number): number {
  const n = divisoriasDaRaia(f).length;
  for (let i = 0; i < n; i++) {
    const a = alcaDaDivisoria(f, i, tamanhoFonte);
    if (a && p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h) return i;
  }
  return -1;
}

// ---- área de transferência do sistema ---------------------------------------------------------------------------

/** Prefixo mágico: o texto da área de transferência só é tratado como formas do ModelForge se começar com ele. */
export const PREFIXO_AREA = 'modelforge/area/v1\n';

export interface CargaArea { area: AreaTransferencia; tipo?: string }

export function serializarArea(area: AreaTransferencia, tipo?: string): string {
  return PREFIXO_AREA + JSON.stringify({ tipo, formas: area.formas, ligacoes: area.ligacoes });
}

const numero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Lê o texto da área de transferência; devolve null se não for uma carga do ModelForge ou se estiver corrompida. */
export function lerCargaArea(texto: string | null | undefined): CargaArea | null {
  if (!texto || !texto.startsWith(PREFIXO_AREA)) return null;
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto.slice(PREFIXO_AREA.length));
  } catch {
    return null;
  }
  if (!bruto || typeof bruto !== 'object') return null;
  const o = bruto as { tipo?: unknown; formas?: unknown; ligacoes?: unknown };
  if (!Array.isArray(o.formas)) return null;
  const formas = (o.formas as Partial<Forma>[]).filter((f): f is Forma =>
    !!f && typeof f.id === 'string' && typeof f.kind === 'string' && !!FORMAS[f.kind] && numero(f.x) && numero(f.y) && numero(f.w) && numero(f.h)
    && typeof f.texto === 'string' && !!f.props && typeof f.props === 'object');
  const ids = new Set(formas.map((f) => f.id));
  const ligacoes = (Array.isArray(o.ligacoes) ? (o.ligacoes as Partial<Ligacao>[]) : []).filter((l): l is Ligacao =>
    !!l && typeof l.id === 'string' && typeof l.kind === 'string' && !!LIGACOES[l.kind] && typeof l.de === 'string' && typeof l.para === 'string'
    && ids.has(l.de) && ids.has(l.para) && !!l.props && typeof l.props === 'object');
  if (!formas.length) return null;
  return { area: { formas, ligacoes }, tipo: typeof o.tipo === 'string' ? o.tipo : undefined };
}

/** Kinds aceitos pelo tipo de diagrama (paleta), para descartar o que é "alienígena" ao colar. */
function kindsDoTipo(tipo: Diagrama['tipo']): Set<string> {
  return new Set((PALETA[tipo] ?? []).map((p) => p.kind));
}

/** Descarta formas que não existem neste tipo de diagrama e as ligações que ficaram sem ponta. */
export function filtrarParaTipo(carga: CargaArea, tipoDestino: Diagrama['tipo']): { area: AreaTransferencia; descartados: number } {
  if (carga.tipo === tipoDestino) return { area: carga.area, descartados: 0 };
  const ok = kindsDoTipo(tipoDestino);
  const formas = carga.area.formas.filter((f) => ok.has(f.kind));
  const ids = new Set(formas.map((f) => f.id));
  const ligacoes = carga.area.ligacoes.filter((l) => ids.has(l.de) && ids.has(l.para));
  return { area: { formas, ligacoes }, descartados: carga.area.formas.length - formas.length };
}

export type DecisaoColagem =
  | { tipo: 'area'; carga: CargaArea }
  | { tipo: 'imagem' }
  | { tipo: 'memoria' }
  | { tipo: 'nada' };

/**
 * O que colar: texto do ModelForge primeiro; sem texto, imagem. Texto alheio não cola nada. Se o
 * sistema não entregou nada (sem permissão / vazio), usa a cópia da memória do editor.
 */
export function decidirColagem(entrada: { texto: string | null | undefined; temImagem: boolean; memoria: boolean }): DecisaoColagem {
  const carga = lerCargaArea(entrada.texto);
  if (carga) return { tipo: 'area', carga };
  if (entrada.temImagem) return { tipo: 'imagem' };
  if (!entrada.texto) return entrada.memoria ? { tipo: 'memoria' } : { tipo: 'nada' };
  return { tipo: 'nada' };
}

/** Margem entre o canto visível e o que é colado. */
export const MARGEM_COLAGEM = 4;

/**
 * Cola com o canto superior esquerdo do conjunto no canto visível da área de rolagem. Move formas e
 * pontos de dobra das linhas coladas; devolve os ids das formas E das linhas para selecionar.
 */
export function colarNoCanto(doc: Doc, area: AreaTransferencia, canto: Ponto): { doc: Doc; ids: string[] } {
  if (!area.formas.length) return { doc, ids: [] };
  const menorX = Math.min(...area.formas.map((f) => f.x));
  const menorY = Math.min(...area.formas.map((f) => f.y));
  const dx = Math.round(Math.max(0, canto.x + MARGEM_COLAGEM) - menorX);
  const dy = Math.round(Math.max(0, canto.y + MARGEM_COLAGEM) - menorY);
  const antes = new Set(doc.ligacoes.map((l) => l.id));
  const r = colar(doc, area, 0);
  const novasLigacoes = new Set(r.doc.ligacoes.filter((l) => !antes.has(l.id)).map((l) => l.id));
  const novasFormas = new Set(r.ids);
  const mover = (p: unknown): unknown => (p && typeof p === 'object' && numero((p as Ponto).x) && numero((p as Ponto).y)
    ? { ...(p as Ponto), x: (p as Ponto).x + dx, y: (p as Ponto).y + dy } : p);
  const novo: Doc = {
    ...r.doc,
    formas: r.doc.formas.map((f) => (novasFormas.has(f.id) ? { ...f, x: f.x + dx, y: f.y + dy } : f)),
    ligacoes: r.doc.ligacoes.map((l) => (novasLigacoes.has(l.id) && Array.isArray(l.props.pontos) ? { ...l, props: { ...l.props, pontos: (l.props.pontos as unknown[]).map(mover) } } : l)),
  };
  return { doc: novo, ids: [...r.ids, ...novasLigacoes] };
}

/** Forma "Imagem" (Desenhador) com a imagem colada, no tamanho natural e no canto visível. */
export function formaDeImagem(doc: Doc, src: string, w: number, h: number, canto: Ponto, nome = 'imagem colada'): { doc: Doc; id: string } {
  const def = FORMAS.desenhador;
  const larg = Math.max(20, Math.round(w) || def.w);
  const alt = Math.max(20, Math.round(h) || def.h);
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `img${Date.now()}`;
  const forma: Forma = {
    id, kind: 'desenhador', x: Math.max(0, Math.round(canto.x + MARGEM_COLAGEM)), y: Math.max(0, Math.round(canto.y + MARGEM_COLAGEM)), w: larg, h: alt,
    texto: nome, props: { tipoDesenho: 'imagem', src, imgNome: nome, imgW: w, imgH: h },
  };
  return { doc: { ...doc, formas: [...doc.formas, forma] }, id };
}

/** Diagrama só com a seleção (formas e as ligações entre elas), para "Copiar como imagem" recortar exatamente o que foi selecionado. */
export function subDiagramaDaSelecao(doc: Doc, selecao: string[]): Doc {
  const sel = new Set(selecao);
  const formas = doc.formas.filter((f) => sel.has(f.id));
  const ids = new Set(formas.map((f) => f.id));
  return { ...doc, formas, ligacoes: doc.ligacoes.filter((l) => ids.has(l.de) && ids.has(l.para) && (sel.has(l.id) || (sel.has(l.de) && sel.has(l.para)))) };
}

// ---- mensagens da barra de status ao armar uma ferramenta (diagrama.*.descricao) ------------------------------

export const DESCRICAO_FERRAMENTA: Record<string, string> = {
  entidade: 'Cria nova entidade',
  relacionamento: 'Cria novo relacionamento',
  autorelacionamento: 'Cria novo auto relacionamento',
  entidadeAssociativa: 'Cria nova entidade associativa',
  linha: 'Cria nova ligação entre dois artefatos',
  especializacao: 'Cria nova especialização',
  atributo: 'Cria novo atributo',
  atributoMulti: 'Cria novo atributo multivalorado (com atributos)',
  especializacaoExclusiva: 'Cria nova especialização exclusiva (com uma entidade)',
  especializacaoDupla: 'Cria nova especialização não exclusiva (com duas entidades)',
  uniao: 'Cria nova união',
  uniaoEntidades: 'Cria nova união a partir de entidades existentes',
  tabela: 'Cria nova tabela',
  colecao: 'Cria nova coleção',
  visao: 'Cria nova view (CREATE VIEW)',
  visaoMaterializada: 'Cria nova view materializada (CREATE MATERIALIZED VIEW)',
  sequencia: 'Cria nova sequence (CREATE SEQUENCE)',
  dominio: 'Cria novo domínio (CREATE DOMAIN)',
  enum: 'Cria novo tipo enumerado (CREATE TYPE AS ENUM)',
  funcao: 'Cria nova function (CREATE FUNCTION)',
  procedure: 'Cria nova procedure (CREATE PROCEDURE)',
  logicoLinha: 'Cria novo relacionamento entre duas tabelas',
  decisaoAtividade: 'Cria nova decisão',
  estadoAtividade: 'Cria novo estado',
  inicioAtividade: 'Cria novo ponto de inicio',
  fimAtividade: 'Cria novo ponto final',
  raiaAtividade: 'Cria nova raia para separação dos artefatos',
  setaAtividade: 'Cria nova thread',
  ligacaoAtividade: 'Cria nova ligação',
  forkJoinAtividade: 'Cria nova junção ou divisão de fluxo',
  eapProcesso: 'Cria novo processo',
  eapBarraLigacao: 'Cria nova junção',
  eapLigacao: 'Cria nova ligação',
  fluxIniFim: 'Cria novo ponto inicial ou final',
  fluxProcesso: 'Cria novo processo',
  fluxConector: 'Cria novo conector',
  fluxDecisao: 'Cria nova decisão',
  fluxDocumento: 'Cria novo  documento',
  fluxNota: 'Cria nova nota',
  fluxVDocumentos: 'Cria novo artefato que representa um conjunto de documentos',
  fluxLigacao: 'Cria novo fluxo (ligação)',
  fluxSeta: 'Cria novo fluxo decisão (sim ou não)',
  livreRetangulo: 'Cria novo retângulo',
  livreRetanguloArr: 'Cria novo retângulo Arred.',
  livreDocumento: 'Cria nova informação',
  livreVariosDocumentos: 'Cria objeto que representa várias informações',
  livreNota: 'Cria nova nota',
  livreTriangulo: 'Cria novo triângulo',
  livreJuncao: 'Cria nova junção',
  livreCirculo: 'Cria novo circulo',
  livreLosango: 'Cria nova condição',
  livreSuperTexto: 'Cria novo texto estilizado',
  livreDrawer: 'Cria novo desenho com réguas',
  livreComentario: 'Cria novo comentário',
  livreLigacao: 'Cria nova ligação',
  livreLigacaoSimples: 'Cria nova ligação',
  texto: 'Cria nova observação (texto com informações adicionais)',
  desenhador: 'Cria um espaço para desenho de linhas ou inserção de imagens no diagrama',
  legenda: 'Cria uma legenda para as cores usadas no diagrama',
  apagar: 'Clique no objeto a ser apagado',
};

/** Mensagem de status ao armar a ferramenta. */
export const descricaoDaFerramenta = (kind: string): string => DESCRICAO_FERRAMENTA[kind] ?? '';
