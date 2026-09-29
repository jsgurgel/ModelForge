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

import { organizarAtributos } from './conceitual';
import { executarComando } from './comandos';
import { apagar, atualizarProps } from './ops';
import { mutar, selecionar } from './store';
import { ItemSel, excluirItemSelecionado, selecionarItem, moverAtributo, moverItemSelecionado, podeMoverAtributo, podeMoverItem } from './itemSel';
import { Diagrama, Forma } from './types';
import { FORMAS } from '../shapes/registry';

export interface Ancora {
  id: string;
  dica: string;
  icone: string;
  executar: () => void;
  /** Sem efeito agora (ex.: nada selecionado, ou já é o primeiro): desenhado com o ícone esmaecido. */
  desabilitado?: boolean;
}

/** Botões que ficam ao lado do objeto selecionado: base + os da classe do objeto, nessa ordem. */
export function ancorasDe(f: Forma, doc: Diagrama, item: ItemSel | null): Ancora[] {
  const geo = FORMAS[f.kind]?.geo;
  const lista: Ancora[] = [
    {
      id: 'ancorar', dica: f.props.ancorado ? 'Desancorar' : 'Ancorar', icone: f.props.ancorado ? 'ancorar.png' : 'ancorar2.png',
      executar: () => mutar((d) => atualizarProps(d, f.id, { ancorado: !f.props.ancorado })),
    },
    {
      id: 'excluir', dica: 'Excluir', icone: 'ancorabor.png',
      executar: () => { mutar((d) => apagar(d, [f.id])); selecionar([]); },
    },
  ];
  const orgAt: Ancora = { id: 'orgat', dica: 'Organizar atributos', icone: 'orgat.png', executar: () => mutar((d) => organizarAtributos(d, f.id)) };
  const editAt: Ancora = { id: 'editatr', dica: 'Editar atributos', icone: 'editar.png', executar: () => executarComando('conceitual.editarAtributos') };
  if (f.kind === 'entidade' || f.kind === 'entidadeAssociativa') lista.push(orgAt, editAt);
  else if (f.kind === 'relacionamento' || f.kind === 'autorelacionamento') lista.push(orgAt);
  else if (f.kind === 'atributo' || f.kind === 'atributoMulti') {
    lista.push(
      orgAt,
      { id: 'sobe', dica: 'Subir atributo', icone: 'upA.png', desabilitado: !podeMoverAtributo(doc, f.id, -1), executar: () => mutar((d) => moverAtributo(d, f.id, -1)) },
      { id: 'desce', dica: 'Descer atributo', icone: 'downA.png', desabilitado: !podeMoverAtributo(doc, f.id, 1), executar: () => mutar((d) => moverAtributo(d, f.id, 1)) },
    );
  }
  else if (geo === 'table' && f.kind === 'tabela') {
    lista.push(
      { id: 'editcmp', dica: 'Editar campos', icone: 'editar.png', executar: () => executarComando('logico.editarCampos') },
      { id: 'edittp', dica: 'Editar tipos', icone: 'editarT.png', executar: () => executarComando('logico.editarTipos') },
      { id: 'ddl', dica: 'DDL da tabela', icone: 'ddl.png', executar: () => executarComando('logico.imprimirDDL') },
      { id: 'sobe', dica: 'Subir campo/constraint selecionado', icone: 'upA.png', desabilitado: !podeMoverItem(f, item, -1), executar: () => item && mutar((d) => moverItemSelecionado(d, item, -1)) },
      { id: 'desce', dica: 'Descer campo/constraint selecionado', icone: 'downA.png', desabilitado: !podeMoverItem(f, item, 1), executar: () => item && mutar((d) => moverItemSelecionado(d, item, 1)) },
      {
        id: 'delitem', dica: 'Excluir campo/constraint selecionado', icone: 'excluirA.png', desabilitado: !item || item.formaId !== f.id,
        executar: () => { if (item) { mutar((d) => excluirItemSelecionado(d, item)); selecionarItem(null); } },
      },
    );
  }
  return lista;
}
