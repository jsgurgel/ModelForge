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

import { adicionarCampoVariante, alinhar, ajustarAoTexto, capturarNaArea, microajustar, ModoAlinhamento, ordem, soltarDaArea, VarianteCampo } from './ops';
import { organizarDiagrama } from './organizar';
import { copiarComoImagem, colarDoSistema, copiarParaSistema, recortarParaSistema } from './areaSistema';
import { ordemDeSelecao, vizinhoNaSelecao, zoomMais, zoomMenos } from './interacao';
import { organizarAtributos } from './conceitual';
import { limparRecentes, obterRecentes } from './recentes';
import { passoMicroajuste } from './formato';
import { restaurarConfig } from './config';
import { FORMAS } from '../shapes/registry';
import { ACEITA_ABRIR, abrirArquivo, escolherArquivo, salvarLocal, salvarPacote } from './arquivo';
import { baixar, gerarPng, gerarSvg, imprimir } from './exportar';
import {
  abaAtiva, abrirDiagrama, alternarRealce, apagarSelecao, colarFormatoSelecao, copiarFormatoSelecao, desfazer,
  fecharAba, fecharTodas, marcarSalvo, mutar, novoDiagrama, obterEstado, refazer, selecionar, selecionarTudo,
  setMiniMapa, setTema, setMensagem, setFerramenta,
} from './store';
import { NOME_TIPO, TIPOS, TipoDiagrama } from './types';
import { abrirDialogo, aviso } from '../ui/dialogos';
import { api } from '../api';

export interface Comando {
  id: string;
  rotulo: string;
  icone?: string;
  /** Texto do atalho, ex.: "Ctrl+Z". */
  atalho?: string;
  /** Quando ausente, sempre habilitado (desde que haja diagrama aberto, se `precisaAba`). */
  precisaAba?: boolean;
  precisaSelecao?: boolean;
  /** O atalho é só rótulo (o tratamento é feito à parte em atalhos.ts, ex.: setas e Ctrl+1..4). */
  soExibir?: boolean;
  /** Recurso ainda não implementado (aparece desabilitado). */
  emBreve?: boolean;
  executar: () => void | Promise<void>;
}

const erro = (titulo: string) => (e: unknown) => aviso(titulo, e instanceof Error ? e.message : String(e));

function fazerAlinhar(modo: ModoAlinhamento) {
  const aba = abaAtiva();
  if (aba) mutar((d) => alinhar(d, aba.selecao, modo));
}

/** Zoom pelos passos (12,5% a 500%): 'mais'/'menos' andam um passo; um número define o valor. */
export function zoom(acao: 'mais' | 'menos' | 'reset' | number) {
  mutar((d) => {
    const z = acao === 'mais' ? zoomMais(d.zoom) : acao === 'menos' ? zoomMenos(d.zoom) : acao === 'reset' ? 1 : Math.min(5, Math.max(0.05, acao));
    return z === d.zoom ? d : { ...d, zoom: z };
  }, { historico: false });
}

async function abrirDeArquivo(pacote: boolean) {
  const f = await escolherArquivo(ACEITA_ABRIR);
  if (!f) return;
  const docs = await abrirArquivo(f);
  docs.forEach(abrirDiagrama);
  setMensagem(`${docs.length} diagrama(s) aberto(s)${pacote ? ' do pacote' : ''}`);
}

async function salvarNoServidor(i = obterEstado().ativa) {
  const aba = obterEstado().abas[i];
  if (!aba) return;
  const salvo = await api.salvar(aba.doc);
  marcarSalvo(i, { ...aba.doc, id: salvo.id });
  setMensagem(`"${aba.doc.nome}" salvo no servidor`);
}

const c = (id: string, rotulo: string, executar: Comando['executar'], extra: Partial<Comando> = {}): Comando => ({
  id, rotulo, executar, ...extra,
});

const lista: Comando[] = [
  ...TIPOS.map((t: TipoDiagrama) => c(`novo.${t}`, NOME_TIPO[t], () => novoDiagrama(t), { atalho: `Ctrl+Shift+${{ conceitual: 'C', logico: 'L', fluxo: 'F', atividade: 'A', eap: 'E', livre: 'I', nosql: 'N' }[t]}` })),
  c('arquivo.abrir', 'Abrir...', () => abrirDeArquivo(false).catch(erro('Abrir')), { atalho: 'Alt+A', icone: 'menu_abrir.png' }),
  c('arquivo.abrirPacote', 'Abrir pacote de diagramas...', () => abrirDeArquivo(true).catch(erro('Abrir pacote')), { atalho: 'Ctrl+K', icone: 'menu_abrir.png' }),
  c('arquivo.abrirServidor', 'Abrir do servidor...', () => abrirDialogo({ tipo: 'servidor' }), { icone: 'menu_abrir.png' }),
  c('arquivo.fechar', 'Fechar', () => {
    const e = obterEstado();
    const aba = e.abas[e.ativa];
    if (!aba) return;
    if (aba.alterado) abrirDialogo({ tipo: 'confirmar', titulo: 'Fechar', mensagem: `"${aba.doc.nome}" tem alterações não salvas. Fechar mesmo assim?`, aoConfirmar: () => fecharAba(e.ativa) });
    else fecharAba(e.ativa);
  }, { atalho: 'Alt+F', icone: 'menu_fechar.png', precisaAba: true }),
  c('arquivo.salvar', 'Salvar (servidor)', () => salvarNoServidor().catch(erro('Salvar')), { atalho: 'Ctrl+S', icone: 'menu_salvar.png', precisaAba: true }),
  c('arquivo.salvarComo', 'Salvar como (arquivo)...', () => {
    const aba = abaAtiva();
    if (aba) { salvarLocal(aba.doc); marcarSalvo(obterEstado().ativa); }
  }, { atalho: 'Alt+1', icone: 'menu_salvarc.png', precisaAba: true }),
  c('arquivo.salvarTodos', 'Salvar todos (servidor)', async () => {
    const e = obterEstado();
    for (let i = 0; i < e.abas.length; i++) if (e.abas[i].alterado) await salvarNoServidor(i);
  }, { atalho: 'Alt+2', icone: 'menu_salvart.png', precisaAba: true }),
  c('arquivo.salvarPacote', 'Salvar tudo em um arquivo...', () => salvarPacote(obterEstado().abas.map((a) => a.doc)), { atalho: 'Ctrl+U', icone: 'menu_salvarc.png', precisaAba: true }),
  c('arquivo.imprimir', 'Imprimir...', () => {
    const aba = abaAtiva();
    if (aba && !imprimir(aba.doc)) aviso('Imprimir', 'O navegador bloqueou a janela de impressão.');
  }, { atalho: 'Ctrl+P', icone: 'menu_imprimir.png', precisaAba: true }),
  c('exportar.png', 'Exportar PNG...', async () => {
    const aba = abaAtiva();
    if (aba) baixar(`${aba.doc.nome}.png`, await gerarPng(aba.doc), 'image/png');
  }, { precisaAba: true, icone: 'menu_exportar.png' }),
  c('exportar.pngDireto', 'Exportar PNG...', async () => {
    const aba = abaAtiva();
    if (aba) baixar(`${aba.doc.nome}.png`, await gerarPng(aba.doc), 'image/png');
  }, { precisaAba: true, icone: 'menu_exportar.png' }),
  c('exportar.svg', 'Exportar SVG...', () => {
    const aba = abaAtiva();
    if (aba) baixar(`${aba.doc.nome}.svg`, gerarSvg(aba.doc), 'image/svg+xml');
  }, { precisaAba: true, icone: 'menu_exportar.png' }),
  c('exportar.pdf', 'Exportar PDF (imprimir)...', () => {
    const aba = abaAtiva();
    if (aba) imprimir(aba.doc);
  }, { atalho: 'Alt+E', precisaAba: true, icone: 'menu_exportar.png' }),

  c('editar.desfazer', 'Desfazer', desfazer, { atalho: 'Ctrl+Z', icone: 'undo_16.png', precisaAba: true }),
  c('editar.refazer', 'Refazer', refazer, { atalho: 'Ctrl+R', icone: 'redo_16.png', precisaAba: true }),
  c('editar.copiar', 'Copiar', () => { copiarParaSistema(); }, { atalho: 'Ctrl+C', icone: 'copy.png', precisaSelecao: true }),
  c('editar.colar', 'Colar', colarDoSistema, { atalho: 'Ctrl+V', icone: 'pastex.png', precisaAba: true }),
  c('editar.recortar', 'Recortar', recortarParaSistema, { atalho: 'Ctrl+X', icone: 'cut_16.gif', precisaSelecao: true }),
  c('editar.apagar', 'Apagar', apagarSelecao, { atalho: 'Delete', icone: 'Borracha.png', precisaSelecao: true }),
  c('editar.copiarImagem', 'Copiar como imagem', copiarComoImagem, { atalho: 'Ctrl+G', icone: 'copyimg.png', precisaSelecao: true }),
  c('editar.selecionarTudo', 'Selecionar tudo', selecionarTudo, { atalho: 'Ctrl+T', icone: 'all.png', precisaAba: true }),
  c('editar.selecionarTipo', 'Selecionar todos deste tipo', () => {
    const aba = abaAtiva();
    if (!aba) return;
    const kinds = new Set(aba.doc.formas.filter((f) => aba.selecao.includes(f.id)).map((f) => f.kind));
    selecionar(aba.doc.formas.filter((f) => kinds.has(f.kind)).map((f) => f.id));
  }, { atalho: 'Ctrl+N', icone: 'allt.png', precisaSelecao: true }),
  c('editar.proximo', 'Selecionar próximo', () => percorrer(1), { atalho: 'Ctrl+O', icone: 'prox.png', precisaAba: true }),
  c('editar.anterior', 'Selecionar anterior', () => percorrer(-1), { atalho: 'Ctrl+E', icone: 'ant.png', precisaAba: true }),
  c('editar.frente', 'Trazer para frente', () => { const a = abaAtiva(); if (a) mutar((d) => ordem(d, a.selecao, 'frente')); }, { atalho: 'Ctrl+B', icone: 'bring.png', precisaSelecao: true }),
  c('editar.tras', 'Enviar para trás', () => { const a = abaAtiva(); if (a) mutar((d) => ordem(d, a.selecao, 'tras')); }, { atalho: 'Ctrl+D', icone: 'send.png', precisaSelecao: true }),
  c('editar.ajustarTexto', 'Ajustar largura ao texto', () => {
    const a = abaAtiva();
    if (a) mutar((d) => a.selecao.reduce((acc, id) => ajustarAoTexto(acc, id), d));
  }, { precisaSelecao: true }),
  c('alinhar.esquerda', 'Igualar à borda esquerda', () => fazerAlinhar('esquerda'), { atalho: 'Ctrl+5', icone: 'cpdim_left.png', precisaSelecao: true }),
  c('alinhar.topo', 'Igualar à borda superior', () => fazerAlinhar('topo'), { atalho: 'Ctrl+6', icone: 'cpdim_top.png', precisaSelecao: true }),
  c('alinhar.direita', 'Igualar à borda direita', () => fazerAlinhar('direita'), { atalho: 'Ctrl+7', icone: 'cpdim_right.png', precisaSelecao: true }),
  c('alinhar.base', 'Igualar à borda inferior', () => fazerAlinhar('base'), { atalho: 'Ctrl+8', icone: 'cpdim_bottom.png', precisaSelecao: true }),
  c('alinhar.largura', 'Igualar largura', () => fazerAlinhar('largura'), { atalho: 'Ctrl+9', icone: 'cpdim_width.png', precisaSelecao: true }),
  c('alinhar.altura', 'Igualar altura', () => fazerAlinhar('altura'), { atalho: 'Ctrl+0', icone: 'cpdim_height.png', precisaSelecao: true }),
  c('alinhar.horizontal', 'Alinhar horizontalmente', () => fazerAlinhar('horizontal'), { icone: 'cpdim_h.png', precisaSelecao: true }),
  c('alinhar.vertical', 'Alinhar verticalmente', () => fazerAlinhar('vertical'), { icone: 'cpdim_v.png', precisaSelecao: true }),
  c('editar.tema', 'Tema escuro', () => setTema(obterEstado().tema === 'escuro' ? 'claro' : 'escuro'), { atalho: 'Ctrl+Shift+T' }),

  c('zoom.mais', 'Aumentar zoom', () => zoom('mais'), { atalho: 'Ctrl+=', icone: 'zoom.png', precisaAba: true }),
  c('zoom.menos', 'Diminuir zoom', () => zoom('menos'), { atalho: 'Ctrl+-', icone: 'zoommenos.png', precisaAba: true }),
  c('zoom.reset', 'Zoom 100%', () => zoom('reset'), { atalho: 'Ctrl+1', precisaAba: true }),
  c('ferramentas.miniMapa', 'MiniMapa', () => setMiniMapa(!obterEstado().miniMapa), { atalho: 'Ctrl+Shift+M' }),
  c('ferramentas.busca', 'Busca global...', () => abrirDialogo({ tipo: 'busca' }), { atalho: 'Ctrl+Shift+P', precisaAba: true }),
  c('ajuda.ajuda', 'Ajuda', () => abrirDialogo({ tipo: 'ajuda' }), { atalho: 'F1', icone: 'ajuda.png' }),
  c('ajuda.sobre', 'Sobre o ModelForge', () => abrirDialogo({ tipo: 'sobre' }), { icone: 'ModelForge.png' }),

  c('diagrama.organizar', 'Organizar diagrama', () => mutar((d) => organizarDiagrama(d, abaAtiva()?.selecao ?? [])), { precisaAba: true }),

  // ---- edição (formato, realce, micro-ajuste, apagar para seleção) ----
  c('editar.copiarFormato', 'Copiar formatação', () => { copiarFormatoSelecao(); }, { atalho: 'Ctrl+M', icone: 'cpdim_cp.png', precisaSelecao: true }),
  c('editar.colarFormato', 'Colar formatação', colarFormatoSelecao, { atalho: 'Ctrl+F', icone: 'Pastef.png', precisaSelecao: true }),
  c('editar.realcar', 'Destacar (seleção e relacionados)', () => alternarRealce(), { atalho: 'Ctrl+W', icone: 'destaque.png', precisaAba: true }),
  c('editar.apagarParaSelecao', 'Selecionar e apagar (borracha)', () => setFerramenta({ tipo: 'apagar', kind: 'apagar' }), { atalho: 'Ctrl+Delete', icone: 'Borracha.png', precisaAba: true }),
  c('editar.microEsq', 'Mover/redimensionar para a esquerda', () => microajustarSelecao('left', {}), { soExibir: true, icone: 'ma0.png', precisaSelecao: true }),
  c('editar.microCima', 'Mover/redimensionar para cima', () => microajustarSelecao('up', {}), { atalho: 'Ctrl+2', soExibir: true, icone: 'ma1.png', precisaSelecao: true }),
  c('editar.microBaixo', 'Mover/redimensionar para baixo', () => microajustarSelecao('down', {}), { atalho: 'Ctrl+3', soExibir: true, icone: 'ma2.png', precisaSelecao: true }),
  c('editar.microDir', 'Mover/redimensionar para a direita', () => microajustarSelecao('right', {}), { atalho: 'Ctrl+4', soExibir: true, icone: 'ma3.png', precisaSelecao: true }),
  c('editar.editarTexto', 'Editar texto', () => { const a = abaAtiva(); if (a?.selecao[0]) window.dispatchEvent(new CustomEvent('modelforge:editar-texto', { detail: { id: a.selecao[0] } })); }, { atalho: 'F2', precisaSelecao: true }),
  //# Escape só cancela a ferramenta armada ; não desmarca a seleção.
  c('editar.cancelar', 'Cancelar ferramenta', () => { setFerramenta(null); }, { atalho: 'Escape', soExibir: true }),

  // ---- arquivo (recentes, fechar todos) ----
  c('arquivo.fecharTodos', 'Fechar todos', () => {
    const e = obterEstado();
    const sujos = e.abas.filter((a) => a.alterado).length;
    if (sujos) abrirDialogo({ tipo: 'confirmar', titulo: 'Fechar todos', mensagem: `${sujos} diagrama(s) com alterações não salvas. Fechar todos mesmo assim?`, aoConfirmar: fecharTodas });
    else fecharTodas();
  }, { icone: 'menu_fechar.png', precisaAba: true }),
  c('arquivo.limparRecentes', 'Limpar recentes', () => limparRecentes(), { }),
  c('config.restaurar', 'Restaurar configuração padrão', () => restaurarConfig(), { }),

  // ---- por objeto (menu de contexto) ----
  c('forma.ancorar', 'Ancorar / desancorar', () => alternarAncora(), { precisaSelecao: true }),
  c('linha.centralizar', 'Centralizar linha (remover pontos de dobra)', () => {
    const a = abaAtiva();
    if (a) mutar((d) => ({ ...d, ligacoes: d.ligacoes.map((l) => (a.selecao.includes(l.id) && !l.props.ancorado ? { ...l, props: { ...l.props, pontos: [], textoDx: 0, textoDy: 0 } } : l)) }));
  }, { precisaSelecao: true }),
  c('linha.inteligente', 'Linha inteligente (alternar)', () => {
    const a = abaAtiva();
    if (a) mutar((d) => ({ ...d, ligacoes: d.ligacoes.map((l) => (a.selecao.includes(l.id) ? { ...l, props: { ...l.props, inteligente: l.props.inteligente === false } } : l)) }));
  }, { precisaSelecao: true }),
  c('conceitual.organizarAtributos', 'Organizar atributos', () => {
    const a = abaAtiva();
    if (a) mutar((d) => a.selecao.reduce((acc, id) => organizarAtributos(acc, id), d));
  }, { precisaSelecao: true }),
  c('raia.capturar', 'Capturar formas da área', () => {
    const a = abaAtiva();
    if (a) mutar((d) => a.selecao.reduce((acc, id) => capturarNaArea(acc, id), d));
  }, { precisaSelecao: true }),
  c('raia.soltar', 'Soltar formas da área', () => {
    const a = abaAtiva();
    if (a) mutar((d) => a.selecao.reduce((acc, id) => soltarDaArea(acc, id), d));
  }, { precisaSelecao: true }),
  ...(['campo', 'key', 'fkey', 'keyfkey'] as VarianteCampo[]).map((v) => c(
    `logico.add.${v}`,
    { campo: 'Novo campo', key: 'Novo campo chave (PK)', fkey: 'Novo campo chave estrangeira (FK)', keyfkey: 'Novo campo PK + FK' }[v],
    () => {
      const a = abaAtiva();
      const t = a?.doc.formas.find((f) => a.selecao.includes(f.id) && FORMAS[f.kind]?.geo === 'table');
      if (a && t) mutar((d) => adicionarCampoVariante(d, t.id, v));
    },
    { icone: { campo: 'Campo.png', key: 'CampoK.png', fkey: 'CampoFK.png', keyfkey: 'CampoKFK.png' }[v], precisaSelecao: true },
  )),
];

export const COMANDOS: Record<string, Comando> = Object.fromEntries(lista.map((x) => [x.id, x]));

/** Registra comandos adicionais (ex.: os que dependem do backend) sem inflar este arquivo. */
export function registrar(...novos: Comando[]) {
  for (const n of novos) COMANDOS[n.id] = n;
}

/** Ctrl+Tab / Ctrl+Shift+Tab e Selecionar próximo/anterior: com um item selecionado vai ao vizinho (formas, depois linhas); com vários, nada. */
export function percorrer(passo: 1 | -1) {
  const aba = abaAtiva();
  if (!aba) return;
  const ordem = ordemDeSelecao(aba.doc);
  if (!aba.selecao.length) {
    //# Sem seleção começa pela primeira/última (Ctrl+O / Ctrl+E são atalhos globais).
    if (ordem.length) selecionar([passo > 0 ? ordem[0] : ordem[ordem.length - 1]]);
    return;
  }
  const alvo = vizinhoNaSelecao(ordem, aba.selecao, passo);
  if (alvo) selecionar([alvo]);
}

export function habilitado(cmd: Comando): boolean {
  if (cmd.emBreve) return false;
  const aba = abaAtiva();
  if (cmd.precisaAba && !aba) return false;
  if (cmd.precisaSelecao && !(aba && aba.selecao.length)) return false;
  return true;
}

export function executarComando(id: string) {
  const cmd = COMANDOS[id];
  if (!cmd || !habilitado(cmd)) return;
  setFerramenta(null);
  Promise.resolve(cmd.executar()).catch(erro(cmd.rotulo));
}


/** Setas / Ctrl+1..4: move 3px (1px com Ctrl); com Shift redimensiona. Ancoradas ficam. */
export function microajustarSelecao(tecla: 'left' | 'right' | 'up' | 'down', mods: { ctrl?: boolean; shift?: boolean }) {
  const aba = abaAtiva();
  if (!aba || !aba.selecao.length) return;
  const { dx, dy } = passoMicroajuste(tecla, !!mods.ctrl);
  mutar((d) => microajustar(d, aba.selecao, dx, dy, !!mods.shift));
}

/** Alterna `props.ancorado` nas formas e ligações selecionadas (Forma.setAncorado). */
export function alternarAncora() {
  const aba = abaAtiva();
  if (!aba) return;
  const sel = new Set(aba.selecao);
  const alvoAncorado = !aba.doc.formas.some((f) => sel.has(f.id) && f.props.ancorado);
  mutar((d) => ({
    ...d,
    formas: d.formas.map((f) => (sel.has(f.id) ? { ...f, props: { ...f.props, ancorado: alvoAncorado } } : f)),
    ligacoes: d.ligacoes.map((l) => (sel.has(l.id) ? { ...l, props: { ...l.props, ancorado: alvoAncorado } } : l)),
  }));
}

export { obterRecentes };
