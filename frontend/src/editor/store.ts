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

import { reenquadrar } from './geometry';
import { useSyncExternalStore } from 'react';
import { AreaTransferencia, Doc, apagarComConfig, copiar as copiarOp } from './ops';
import { obterConfig } from './config';
import { sincronizarDocumento } from './integridade';
import { Formato, colarFormato, copiarFormato } from './formato';
import { DESCRICAO_FERRAMENTA, colarNoCanto, descricaoDaFerramenta, filtrarParaTipo } from './interacao';
import { registrarRecente } from './recentes';
import { MSG_AUTOSAVE, MSG_AUTOSAVE_FALHOU, gravarAutosaveEm } from './autosave';
import { Diagrama, NOME_TIPO, TipoDiagrama, VERSAO_DIAGRAMA, diagramaVazio } from './types';
import { ItemPaleta } from '../shapes/registry';

export interface Aba {
  doc: Doc;
  passado: Doc[];
  futuro: Doc[];
  /** Ids de formas/ligações selecionadas. */
  selecao: string[];
  alterado: boolean;
}

export type AbaSidebar = 'inspector' | 'navegacao' | 'configuracao' | 'banco';

export interface Estado {
  abas: Aba[];
  ativa: number;
  ferramenta: ItemPaleta | null;
  /** Ctrl mantém a ferramenta ativa depois de criar. */
  ferramentaFixa: boolean;
  area: AreaTransferencia | null;
  /** Tipo do diagrama de onde veio a cópia da memória. */
  areaTipo: string | null;
  mensagem: string;
  tema: 'claro' | 'escuro';
  miniMapa: boolean;
  abaSidebar: AbaSidebar;
  /** Últimas mensagens da barra de status (mais recente por último). */
  historicoMensagens: string[];
  /** Formato copiado (Copiar formatação). */
  formato: Formato | null;
  /** Realçar: esmaece o que não está ligado à seleção. */
  realce: boolean;
  /** O último auto-salvamento falhou (cota/armazenamento bloqueado): a barra de status avisa enquanto durar. */
  autosaveFalhou: boolean;
}

//# Limite de passos do histórico de desfazer.
const LIMITE_HISTORICO = 500;
const CHAVE_AUTOSAVE = 'modelforge:autosave';
const CHAVE_TEMA = 'modelforge:tema';

let estado: Estado = {
  abas: [],
  ativa: -1,
  ferramenta: null,
  ferramentaFixa: false,
  area: null,
  areaTipo: null,
  mensagem: '',
  tema: (typeof localStorage !== 'undefined' && localStorage.getItem(CHAVE_TEMA)) === 'escuro' ? 'escuro' : 'claro',
  miniMapa: true,
  abaSidebar: 'inspector',
  historicoMensagens: [],
  formato: null,
  realce: false,
  autosaveFalhou: false,
};

const ouvintes = new Set<() => void>();
let gestoAberto = false;

function definir(parcial: Partial<Estado>) {
  estado = { ...estado, ...parcial };
  ouvintes.forEach((o) => o());
  agendarAutosave();
}

export const obterEstado = (): Estado => estado;

export function useEditor(): Estado {
  return useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    () => estado,
  );
}

export const abaAtiva = (e: Estado = estado): Aba | null => (e.ativa >= 0 ? e.abas[e.ativa] ?? null : null);

function substituirAba(i: number, aba: Aba, extra: Partial<Estado> = {}) {
  const abas = estado.abas.slice();
  abas[i] = aba;
  definir({ abas, ...extra });
}

/** Aplica uma alteração ao diagrama ativo, registrando no histórico (exceto durante um gesto). */
export function mutar(fn: (d: Doc) => Doc, opts: { historico?: boolean } = {}) {
  const i = estado.ativa;
  const aba = estado.abas[i];
  if (!aba) return;
  const bruto = fn(aba.doc);
  if (bruto === aba.doc) return;
  //# Lógico: propagação entre tabelas (tipo, apagar coluna/IR/tabela, reindexar constraintOrigem).
  const novo = sincronizarDocumento(bruto, aba.doc);
  const guardar = opts.historico !== false && !gestoAberto;
  substituirAba(i, {
    ...aba,
    doc: novo,
    passado: guardar ? [...aba.passado, aba.doc].slice(-LIMITE_HISTORICO) : aba.passado,
    futuro: guardar ? [] : aba.futuro,
    alterado: true,
  });
}

/** Gesto = várias mutações (arrastar, redimensionar) que viram UM passo de desfazer. */
export function abrirGesto() {
  const aba = abaAtiva();
  if (!aba || gestoAberto) return;
  gestoAberto = true;
  substituirAba(estado.ativa, { ...aba, passado: [...aba.passado, aba.doc].slice(-LIMITE_HISTORICO), futuro: [] });
}

export function fecharGesto() {
  if (!gestoAberto) return;
  gestoAberto = false;
  const aba = abaAtiva();
  if (!aba) return;
  //# Se nada mudou de fato (clique sem arrastar), descarta o passo vazio.
  const ultimo = aba.passado[aba.passado.length - 1];
  if (ultimo === aba.doc) substituirAba(estado.ativa, { ...aba, passado: aba.passado.slice(0, -1) });
}

/**
 * Desfazer/refazer restauram o conteúdo, mas não o zoom, o nome nem o vínculo com o servidor: voltar atrás no histórico não pode "desalvar" o diagrama nem mudar a visão.
 */
export function preservarDaAtual(alvo: Doc, atual: Doc): Doc {
  if (alvo.zoom === atual.zoom && alvo.nome === atual.nome && alvo.id === atual.id && alvo.arquivo === atual.arquivo) return alvo;
  return { ...alvo, zoom: atual.zoom, nome: atual.nome, id: atual.id, arquivo: atual.arquivo };
}

export function desfazer() {
  const aba = abaAtiva();
  if (!aba || !aba.passado.length) return;
  const passado = aba.passado.slice(0, -1);
  substituirAba(estado.ativa, {
    ...aba, doc: preservarDaAtual(aba.passado[aba.passado.length - 1], aba.doc), passado, futuro: [aba.doc, ...aba.futuro], selecao: [], alterado: true,
  });
}

export function refazer() {
  const aba = abaAtiva();
  if (!aba || !aba.futuro.length) return;
  substituirAba(estado.ativa, {
    ...aba, doc: preservarDaAtual(aba.futuro[0], aba.doc), passado: [...aba.passado, aba.doc], futuro: aba.futuro.slice(1), selecao: [], alterado: true,
  });
}

export function selecionar(ids: string[]) {
  const aba = abaAtiva();
  if (!aba) return;
  const iguais = ids.length === aba.selecao.length && ids.every((x, k) => x === aba.selecao[k]);
  if (!iguais) substituirAba(estado.ativa, { ...aba, selecao: ids });
}

export function selecionarTudo() {
  const aba = abaAtiva();
  if (aba) selecionar([...aba.doc.formas.map((f) => f.id), ...aba.doc.ligacoes.map((l) => l.id)]);
}

const DICAS_DE_FERRAMENTA = new Set(Object.values(DESCRICAO_FERRAMENTA));

/**
 * Arma/desarma a ferramenta. Ao armar, a barra de status mostra a descrição ("Cria nova entidade"); ao desarmar,
 * some a descrição (e só ela: outras mensagens, como um aviso, permanecem).
 */
export function setFerramenta(f: ItemPaleta | null, fixa = false) {
  const dica = f ? descricaoDaFerramenta(f.kind) : '';
  const limpar = !dica && (DICAS_DE_FERRAMENTA.has(estado.mensagem) || (!f && estado.mensagem.startsWith('Clique na ')));
  definir({ ferramenta: f, ferramentaFixa: fixa, ...(dica ? { mensagem: dica } : limpar ? { mensagem: '' } : {}) });
}

export function setMensagem(mensagem: string) {
  const h = estado.historicoMensagens;
  //# Guarda só mensagens novas e não vazias (as últimas 50), sem repetir a anterior.
  const historicoMensagens = mensagem && h[h.length - 1] !== mensagem ? [...h, mensagem].slice(-50) : h;
  definir({ mensagem, historicoMensagens });
}

/** Limpar da janela "Logs e mensagens de erro". */
export function limparHistorico() {
  definir({ historicoMensagens: [], mensagem: '' });
}

export function setTema(tema: 'claro' | 'escuro') {
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch { /* armazenamento indisponível: só não persiste */ }
  definir({ tema });
}

export const setMiniMapa = (miniMapa: boolean) => definir({ miniMapa });
export const setAbaSidebar = (abaSidebar: AbaSidebar) => definir({ abaSidebar });

// ---- abas -----------------------------------------------------------------

function nomeNovo(tipo: TipoDiagrama): string {
  const usados = new Set(estado.abas.map((a) => a.doc.nome));
  let n = 1;
  while (usados.has(`${NOME_TIPO[tipo]}_${n}`)) n++;
  return `${NOME_TIPO[tipo]}_${n}`;
}

function inserirAba(doc: Diagrama, recente: boolean) {
  const aba: Aba = { doc, passado: [], futuro: [], selecao: [], alterado: false };
  definir({ abas: [...estado.abas, aba], ativa: estado.abas.length, ferramenta: null, realce: false });
  if (recente) registrarRecente(doc.nome, doc.id, doc.tipo);
}

export const abrirDiagrama = (doc: Diagrama) =>
  inserirAba({ ...doc, formas: doc.formas.map(reenquadrar) }, !!doc.id || doc.formas.length > 0);

export function novoDiagrama(tipo: TipoDiagrama) {
  inserirAba(diagramaVazio(tipo, nomeNovo(tipo)), false);
}

/** Fecha todas as abas (quem confirma alterações não salvas é o comando). */
export function fecharTodas() {
  definir({ abas: [], ativa: -1, ferramenta: null, realce: false });
}

export function ativar(i: number) {
  if (i >= 0 && i < estado.abas.length) definir({ ativa: i, ferramenta: null, realce: false });
}

export function fecharAba(i: number) {
  const abas = estado.abas.filter((_, k) => k !== i);
  let ativa = estado.ativa;
  if (i < ativa || ativa >= abas.length) ativa = Math.max(0, ativa - 1);
  definir({ abas, ativa: abas.length ? ativa : -1, ferramenta: null });
}

export function renomearAba(i: number, nome: string) {
  const aba = estado.abas[i];
  const limpo = nome.trim();
  if (!aba || !limpo || limpo === aba.doc.nome) return;
  substituirAba(i, { ...aba, doc: { ...aba.doc, nome: limpo }, alterado: true });
}

export function marcarSalvo(i: number, doc?: Diagrama) {
  const aba = estado.abas[i];
  if (aba) {
    substituirAba(i, { ...aba, doc: doc ?? aba.doc, alterado: false });
    registrarRecente((doc ?? aba.doc).nome, (doc ?? aba.doc).id, aba.doc.tipo);
  }
}

// ---- área de transferência --------------------------------------------------

export function copiarSelecao(): boolean {
  const aba = abaAtiva();
  if (!aba || !aba.selecao.length) return false;
  definir({ area: copiarOp(aba.doc, aba.selecao), areaTipo: aba.doc.tipo });
  return true;
}

export function recortarSelecao() {
  if (copiarSelecao()) apagarSelecao();
}

/** Canto superior esquerdo da parte visível da área de rolagem, em coordenadas do diagrama (o Canvas o registra). */
let cantoVisivel: () => { x: number; y: number } = () => ({ x: 0, y: 0 });
export function registrarCantoVisivel(fn: () => { x: number; y: number }): () => void {
  cantoVisivel = fn;
  return () => { if (cantoVisivel === fn) cantoVisivel = () => ({ x: 0, y: 0 }); };
}
export const obterCantoVisivel = () => cantoVisivel();

/**
 * Cola uma área (da memória ou do sistema) no canto visível e seleciona formas e linhas coladas. Formas que não existem no
 * tipo do diagrama são descartadas com aviso.
 */
export function colarAreaDe(area: AreaTransferencia, tipoOrigem?: string): boolean {
  const aba = abaAtiva();
  if (!aba) return false;
  const { area: filtrada, descartados } = filtrarParaTipo({ area, tipo: tipoOrigem }, aba.doc.tipo);
  if (descartados) setMensagem(`${descartados} objeto(s) não existem neste tipo de diagrama e não foram colados`);
  if (!filtrada.formas.length) return false;
  let ids: string[] = [];
  mutar((d) => {
    const r = colarNoCanto(d, filtrada, cantoVisivel());
    ids = r.ids;
    return r.doc;
  });
  selecionar(ids);
  return true;
}

/** Cola a cópia guardada na memória do editor (o Colar do sistema está em areaSistema.ts). */
export function colarArea(): boolean {
  const area = estado.area;
  return !!area && area.formas.length > 0 && colarAreaDe(area, estado.areaTipo ?? undefined);
}

export function apagarSelecao() {
  const aba = abaAtiva();
  if (!aba || !aba.selecao.length) return;
  const ids = aba.selecao;
  let bloqueados: string[] = [];
  mutar((d) => {
    const r = apagarComConfig(d, ids, obterConfig().propagarExclusao);
    bloqueados = r.bloqueados;
    return r.doc;
  });
  selecionar(bloqueados);
  if (bloqueados.length) setMensagem(`${bloqueados.length} objeto(s) não apagado(s): têm ligações e "Propague apagar" está desligado`);
}

// ---- formato e realce -------------------------------------------------------

export function copiarFormatoSelecao(): boolean {
  const aba = abaAtiva();
  const f = aba?.doc.formas.find((x) => aba.selecao.includes(x.id));
  if (!f) return false;
  definir({ formato: copiarFormato(f) });
  setMensagem(`Formatação de "${f.texto.split('\n')[0] || f.kind}" copiada`);
  return true;
}

export function colarFormatoSelecao() {
  const aba = abaAtiva();
  const fmt = estado.formato;
  if (!aba || !fmt || !aba.selecao.length) return;
  const ids = aba.selecao;
  mutar((d) => colarFormato(d, ids, fmt));
}

export const alternarRealce = () => definir({ realce: !estado.realce });

// ---- autosave ---------------------

let timer: ReturnType<typeof setTimeout> | undefined;

function gravarAutosave() {
  timer = undefined;
  const alterados = estado.abas.filter((a) => a.alterado).map((a) => a.doc);
  const r = gravarAutosaveEm(localStorage, CHAVE_AUTOSAVE, alterados, VERSAO_DIAGRAMA);
  if (r.estado === 'falhou') {
    //# Aviso persistente: o usuário precisa saber que o trabalho NÃO está sendo guardado.
    if (!estado.autosaveFalhou) definir({ autosaveFalhou: true });
    setMensagem(MSG_AUTOSAVE_FALHOU);
  } else {
    if (estado.autosaveFalhou) definir({ autosaveFalhou: false });
    if (r.estado === 'gravado') setMensagem(MSG_AUTOSAVE);
  }
}

/**
 * Intervalo configurável (minutos; 0 desativa). Uma gravação pendente não é adiada por novas alterações, para que
 * o trabalho contínuo também chegue a ser gravado; as mudanças posteriores entram na próxima rodada.
 */
function agendarAutosave() {
  if (typeof localStorage === 'undefined') return;
  const minutos = obterConfig().intervaloAutosave;
  if (minutos <= 0 || timer) return;
  timer = setTimeout(gravarAutosave, minutos * 60_000);
}

/** Diagramas com alterações não salvas da sessão anterior. */
export function lerAutosave(): Diagrama[] {
  try {
    const bruto = localStorage.getItem(CHAVE_AUTOSAVE);
    if (!bruto) return [];
    const dados = JSON.parse(bruto) as { docs?: Diagrama[] };
    return Array.isArray(dados.docs) ? dados.docs : [];
  } catch {
    return [];
  }
}

export function descartarAutosave() {
  try {
    localStorage.removeItem(CHAVE_AUTOSAVE);
  } catch { /* nada a fazer */ }
}
