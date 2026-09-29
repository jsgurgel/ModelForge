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

import { registrar } from './comandos';
import { baixar, exportarImagem, gerarPdfDoDiagrama } from './exportar';
import { CONFIG_PADRAO } from './pdf';
import { ddlDaTabela } from './logico';
import { abaAtiva, setMensagem } from './store';
import { FORMAS } from '../shapes/registry';
import { abrirDialogo, aviso } from '../ui/dialogos';

/**
 * Comandos do stream D: exportação (imagem PNG/JPG/BMP/SVG, PDF real, prévia de impressão), construtor de EAP e
 * comandos do Lógico (editar tipos, editores de IR, imprimir DDL). Registrados por cima dos antigos com o mesmo id.
 */

const tabelaSelecionada = () => {
  const a = abaAtiva();
  return a?.doc.formas.find((f) => a.selecao.includes(f.id) && FORMAS[f.kind]?.geo === 'table');
};

const erro = (titulo: string) => (e: unknown) => aviso(titulo, e instanceof Error ? e.message : String(e));

registrar(
  { id: 'arquivo.imprimir', rotulo: 'Imprimir...', atalho: 'Ctrl+P', icone: 'menu_imprimir.png', precisaAba: true, executar: () => abrirDialogo({ tipo: 'd', nome: 'previa' }) },
  { id: 'arquivo.previaImpressao', rotulo: 'Pré-visualização de impressão...', icone: 'menu_imprimir.png', precisaAba: true, executar: () => abrirDialogo({ tipo: 'd', nome: 'previa' }) },
  { id: 'exportar.png', rotulo: 'Exportar imagem (PNG, JPG, BMP)...', icone: 'menu_exportar.png', precisaAba: true, executar: () => abrirDialogo({ tipo: 'd', nome: 'imagem' }) },
  {
    id: 'exportar.jpg', rotulo: 'Exportar JPG...', icone: 'menu_exportar.png', precisaAba: true,
    executar: async () => { const a = abaAtiva(); if (a) { const r = await exportarImagem(a.doc, 'jpg'); baixar(r.nome, r.blob, r.blob.type); } },
  },
  {
    id: 'exportar.bmp', rotulo: 'Exportar BMP...', icone: 'menu_exportar.png', precisaAba: true,
    executar: async () => { const a = abaAtiva(); if (a) { const r = await exportarImagem(a.doc, 'bmp', 1); baixar(r.nome, r.blob, r.blob.type); } },
  },
  {
    id: 'exportar.pdf', rotulo: 'Exportar PDF...', icone: 'menu_exportar.png', precisaAba: true,
    executar: async () => {
      const a = abaAtiva();
      if (!a) return;
      try {
        baixar(`${a.doc.nome}.pdf`, await gerarPdfDoDiagrama(a.doc, CONFIG_PADRAO), 'application/pdf');
        setMensagem(`PDF gerado: ${a.doc.nome}.pdf`);
      } catch (e) { erro('Exportar PDF')(e); }
    },
  },
  { id: 'eap.cli', rotulo: 'CLI: construir EAP a partir de texto...', precisaAba: true, icone: 'eap.png', executar: () => abrirDialogo({ tipo: 'd', nome: 'eap' }) },
  { id: 'logico.editarTipos', rotulo: 'Editar tipos...', precisaAba: true, icone: 'editarT.png', executar: () => abrirDialogo({ tipo: 'd', nome: 'tipos' }) },
  ...(['PK', 'UNIQUE', 'FK', 'CHECK'] as const).map((modo) => ({
    id: `logico.ir.${modo.toLowerCase()}`,
    rotulo: { PK: 'IR chave primária...', UNIQUE: 'IR único...', FK: 'IR chave estrangeira...', CHECK: 'Adicionar CHECK...' }[modo],
    precisaSelecao: true,
    executar: () => { const t = tabelaSelecionada(); if (t) abrirDialogo({ tipo: 'd', nome: 'ir', id: t.id, modo }); },
  })),
  {
    id: 'logico.imprimirDDL', rotulo: 'DDL da tabela...', precisaSelecao: true, icone: 'ddl.png',
    executar: () => {
      const a = abaAtiva();
      const t = tabelaSelecionada();
      if (!a || !t) return;
      abrirDialogo({ tipo: 'texto', titulo: `DDL - ${t.texto}`, texto: ddlDaTabela(t, a.doc, a.doc.prefixo).join('\n'), nomeArquivo: `${t.texto}.sql` });
    },
  },
);
