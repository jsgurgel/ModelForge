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

import { abrirDeArquivoLocal } from './abrirLocal';
import { COMANDOS, registrar } from './comandos';
import { fecharAbaComLista, fecharTodasComLista } from './fechar';
import { salvarAba } from './salvar';
import { obterEstado, setMensagem } from './store';
import { abrirDialogo } from '../ui/dialogos';

/** Comandos de arquivo do stream G2: Salvar de verdade, fechar com lista, abrir com recentes locais. */

registrar(
  { ...COMANDOS['arquivo.abrir'], executar: async () => { const n = await abrirDeArquivoLocal(); if (n) setMensagem(`${n} diagrama(s) aberto(s)`); } },
  { id: 'arquivo.fechar', rotulo: 'Fechar', atalho: 'Alt+F', icone: 'menu_fechar.png', precisaAba: true, executar: () => fecharAbaComLista(obterEstado().ativa) },
  { id: 'arquivo.fecharTodos', rotulo: 'Fechar todos', icone: 'menu_fechar.png', precisaAba: true, executar: () => fecharTodasComLista() },
  { id: 'arquivo.salvar', rotulo: 'Salvar', atalho: 'Ctrl+S', icone: 'menu_salvar.png', precisaAba: true, executar: async () => { await salvarAba(obterEstado().ativa); } },
  { id: 'arquivo.salvarComo', rotulo: 'Salvar como (arquivo)...', atalho: 'Alt+1', icone: 'menu_salvarc.png', precisaAba: true, executar: async () => { await salvarAba(obterEstado().ativa, { escolher: true }); } },
  { id: 'arquivo.salvarServidor', rotulo: 'Salvar no servidor', icone: 'menu_salvar.png', precisaAba: true, executar: async () => { await salvarAba(obterEstado().ativa, { servidor: true }); } },
  {
    id: 'arquivo.salvarTodos', rotulo: 'Salvar todos', atalho: 'Alt+2', icone: 'menu_salvart.png', precisaAba: true,
    executar: async () => { const e = obterEstado(); for (let i = 0; i < e.abas.length; i++) if (e.abas[i].alterado && !(await salvarAba(i))) return; },
  },
  { id: 'ferramentas.logs', rotulo: 'Logs e mensagens de erro...', executar: () => abrirDialogo({ tipo: 'g2', nome: 'logs' }) },
);
