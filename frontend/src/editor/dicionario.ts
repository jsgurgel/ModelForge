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

import { propsTabela } from './logico';
import { Diagrama, Forma } from './types';

export interface LinhaDicionarioCampo {
  tabela: string; campo: string; tipo: string; posicao: number; pk: boolean; unico: boolean;
  complemento: string; dicionario: string; observacao: string; fk: boolean; tabelaOrigem: string; campoOrigem: string;
  /** Ids para a edição no próprio diálogo. */
  tabelaId?: string; campoId?: string;
}

export interface LinhaDicionarioTabela { tabela: string; descricao: string; observacao: string; tabelaId?: string }

export const tabelasDo = (d: Diagrama): Forma[] => d.formas.filter((f) => f.kind === 'tabela');

/** Nome do campo sem o sufixo ":tipo". */
const semTipo = (n: string) => (n.includes(':') ? n.slice(0, n.indexOf(':')) : n);

/** Dicionário de dados: uma linha por campo, com a origem da FK resolvida. */
export function linhasDeCampos(d: Diagrama, tabelas: Forma[]): LinhaDicionarioCampo[] {
  const todas = tabelasDo(d);
  const out: LinhaDicionarioCampo[] = [];
  for (const t of tabelas) {
    const p = propsTabela(t);
    p.campos.forEach((c, i) => {
      let tabelaOrigem = '';
      let campoOrigem = '';
      if (c.fk) {
        const fk = p.constraints.find((k) => k.tipo === 'FK' && k.camposDestino.includes(c.id));
        if (fk) {
          const idx = fk.camposDestino.indexOf(c.id);
          const oriId = fk.camposOrigem[idx];
          const ori = fk.constraintOrigem ? todas.find((x) => x.id === fk.constraintOrigem!.tabelaId) : undefined;
          const campo = ori ? propsTabela(ori).campos.find((x) => x.id === oriId) : undefined;
          if (ori && campo) { tabelaOrigem = ori.texto; campoOrigem = semTipo(campo.nome); }
        }
      }
      //# O DEFAULT mora num campo próprio; o dicionário mostra a definição completa (complemento + DEFAULT).
      const complemento = c.padrao ? `${c.complemento ? `${c.complemento} ` : ''}DEFAULT ${c.padrao}` : c.complemento;
      out.push({
        tabela: t.texto, campo: semTipo(c.nome), tipo: c.tipo, posicao: i, pk: c.pk, unico: c.unique, complemento,
        dicionario: c.dicionario, observacao: c.observacao, fk: c.fk, tabelaOrigem, campoOrigem, tabelaId: t.id, campoId: c.id,
      });
    });
  }
  return out;
}

export function linhasDeTabelas(tabelas: Forma[]): LinhaDicionarioTabela[] {
  return tabelas.map((t) => ({ tabelaId: t.id, tabela: t.texto, descricao: propsTabela(t).descricao, observacao: propsTabela(t).observacao }));
}

const celula = (v: string | number | boolean) => String(v).replace(/;/g, ',').replace(/\r?\n/g, ' ');

/** CSV (separador ";", bloco de tabelas, 3 linhas em branco, bloco de colunas). */
export function dicionarioCsv(tabelas: LinhaDicionarioTabela[], campos: LinhaDicionarioCampo[], comFk: boolean, comOrigem: boolean): string {
  const cab = ['Nome da tabela', 'Nome da coluna', 'Tipo da coluna', 'Posição da coluna', 'Chave primária', 'Único', 'Complemento', 'Dicionário', 'Observação'];
  if (comFk) cab.push('Chave estrangeira');
  if (comOrigem) cab.push('Tabela origem FK', 'Campo Origem FK');
  const l1 = ['Tabela;Descrição;Observação', ...tabelas.map((t) => [t.tabela, t.descricao, t.observacao].map(celula).join(';'))];
  const l2 = [cab.join(';'), ...campos.map((c) => {
    const v: (string | number | boolean)[] = [c.tabela, c.campo, c.tipo, c.posicao, c.pk, c.unico, c.complemento, c.dicionario, c.observacao];
    if (comFk) v.push(c.fk);
    if (comOrigem) v.push(c.tabelaOrigem, c.campoOrigem);
    return v.map(celula).join(';');
  })];
  return `${l1.join('\n')}\n\n\n\n${l2.join('\n')}\n`;
}

/** Edita Dicionário/Observação de um campo. */
export function editarCampoDicionario(d: Diagrama, tabelaId: string, campoId: string, mud: { dicionario?: string; observacao?: string }): Diagrama {
  return {
    ...d,
    formas: d.formas.map((f) => (f.id !== tabelaId ? f : {
      ...f, props: { ...f.props, campos: propsTabela(f).campos.map((c) => (c.id === campoId ? { ...c, ...mud } : c)) },
    })),
  };
}

/** Edita a Descrição (dicionário) e a Observação da tabela. */
export function editarTabelaDicionario(d: Diagrama, tabelaId: string, mud: { descricao?: string; observacao?: string }): Diagrama {
  return { ...d, formas: d.formas.map((f) => (f.id === tabelaId ? { ...f, props: { ...f.props, ...mud } } : f)) };
}
