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

import { COMANDOS, executarComando, habilitado } from './comandos';
import { adicionarAtributo, associativaParaRelacionamento, relacionamentoParaAssociativa, relacionar } from './conceitual';
import { atualizarLigacao, atualizarForma, Doc } from './ops';
import { atalhoDe } from './atalhos';
import { abaAtiva, mutar } from './store';
import { abrirDialogo } from '../ui/dialogos';
import { FORMAS } from '../shapes/registry';

/** Item do menu de contexto (botão direito). */
export type ItemContexto =
  | { sep: true }
  | { rotulo: string; icone?: string; atalho?: string; desabilitado?: boolean; executar: () => void };

const SEP: ItemContexto = { sep: true };

const doComando = (id: string): ItemContexto | null => {
  const c = COMANDOS[id];
  if (!c) return null;
  const tipo = abaAtiva()?.doc.tipo ?? null;
  return { rotulo: c.rotulo, icone: c.icone, atalho: atalhoDe(id, tipo), desabilitado: !habilitado(c), executar: () => executarComando(id) };
};

const cmds = (...ids: string[]): ItemContexto[] => ids.map(doComando).filter((x): x is ItemContexto => !!x);

const ehAssoc = (k: string) => k === 'entidadeAssociativa';
const ehDonoDeAtributo = (k: string) => k === 'entidade' || k === 'relacionamento' || k === 'autorelacionamento' || k === 'entidadeAssociativa' || k === 'atributo' || k === 'atributoMulti';

/**
 * Itens do menu de contexto conforme o alvo: fundo do diagrama, formas ou linha (comandos por objeto:
 * comandos de linha, organizar/editar atributos, conversões, captura de raia, campos do Lógico + edição comum).
 */
export function itensContexto(doc: Doc, selecao: string[]): ItemContexto[] {
  const formas = doc.formas.filter((f) => selecao.includes(f.id));
  const ligs = doc.ligacoes.filter((l) => selecao.includes(l.id));
  const res: ItemContexto[] = [];
  const junta = (grupo: ItemContexto[]) => {
    if (!grupo.length) return;
    if (res.length) res.push(SEP);
    res.push(...grupo);
  };

  if (!formas.length && !ligs.length) {
    junta(cmds('editar.desfazer', 'editar.refazer'));
    junta(cmds('editar.colar', 'editar.selecionarTudo'));
    junta(cmds('editar.colarFormato', 'editar.realcar'));
    junta(cmds('diagrama.organizar', 'zoom.mais', 'zoom.menos', 'zoom.reset'));
    return res;
  }

  const unica = formas.length === 1 && !ligs.length ? formas[0] : undefined;
  const linha = ligs.length === 1 && !formas.length ? ligs[0] : undefined;

  if (unica) junta(cmds('editar.editarTexto'));
  if (linha) {
    junta([{
      rotulo: 'Editar texto da linha...', icone: undefined,
      executar: () => abrirDialogo({ tipo: 'entrada', titulo: 'Texto da linha', rotulo: 'Texto', valor: linha.texto, aoConfirmar: (v) => mutar((d) => atualizarLigacao(d, linha.id, { texto: v })) }),
    }, ...cmds('linha.centralizar', 'linha.inteligente', 'forma.ancorar')]);
  }

  if (unica) {
    const extra: ItemContexto[] = [];
    if (ehDonoDeAtributo(unica.kind)) {
      extra.push(
        { rotulo: 'Adicionar atributo', icone: 'Atributo.png', executar: () => mutar((d) => adicionarAtributo(d, unica.id).doc) },
        ...cmds('conceitual.organizarAtributos'),
        { rotulo: 'Editar atributos...', executar: () => abrirDialogo({ tipo: 'atributos', id: unica.id }) },
      );
    }
    if (unica.kind === 'entidade') {
      extra.push({ rotulo: 'Criar auto-relacionamento', icone: 'AutoRelacionamento.png', executar: () => mutar((d) => relacionar(d, unica.id, unica.id)) });
    }
    if (unica.kind === 'relacionamento') {
      extra.push({ rotulo: 'Converter em entidade associativa', icone: 'Entidade_Associativa.png', executar: () => mutar((d) => relacionamentoParaAssociativa(d, unica.id)) });
    }
    if (ehAssoc(unica.kind)) {
      extra.push({ rotulo: 'Converter em relacionamento', icone: 'Relacionamento.png', executar: () => mutar((d) => associativaParaRelacionamento(d, unica.id)) });
    }
    const geo = FORMAS[unica.kind]?.geo;
    if (geo === 'table') {
      extra.push({ rotulo: 'Editar campos...', executar: () => abrirDialogo({ tipo: 'campos', id: unica.id }) }, ...cmds('logico.add.campo', 'logico.add.key', 'logico.add.fkey', 'logico.add.keyfkey'));
    }
    if (geo === 'colecao') extra.push({ rotulo: 'Editar campos (DSL)...', executar: () => abrirDialogo({ tipo: 'dsl', id: unica.id }) });
    if (geo === 'lane') extra.push(...cmds('raia.capturar', 'raia.soltar'));
    if (unica.kind === 'fluxDecisao' || unica.kind === 'decisaoAtividade') {
      extra.push({ rotulo: 'Trocar texto...', executar: () => abrirDialogo({ tipo: 'entrada', titulo: 'Texto', rotulo: 'Texto', valor: unica.texto, aoConfirmar: (v) => mutar((d) => atualizarForma(d, unica.id, { texto: v })) }) });
    }
    junta(extra);
  }

  junta(cmds('editar.recortar', 'editar.copiar', 'editar.colar', 'editar.apagar'));
  junta(cmds('editar.copiarFormato', 'editar.colarFormato', 'editar.realcar'));
  if (formas.length) {
    junta(cmds('editar.frente', 'editar.tras', 'editar.ajustarTexto', 'forma.ancorar'));
  }
  if (formas.length > 1) {
    junta(cmds('alinhar.esquerda', 'alinhar.topo', 'alinhar.direita', 'alinhar.base', 'alinhar.largura', 'alinhar.altura', 'alinhar.horizontal', 'alinhar.vertical'));
  }
  junta(cmds('editar.selecionarTipo'));
  return res;
}
