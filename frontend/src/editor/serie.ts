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

/** "Adicionar em série": uma linha por item, campos separados por espaço. */

export interface ItemSerie { nome: string; tipo: string; complemento: string }

/** Atributos: `<atributo> <domínio>` ou só o nome (ex.: "RG INT"). O que vem depois do tipo é ignorado. */
export function lerSerieAtributos(texto: string): ItemSerie[] {
  return lerSerie(texto).map(({ nome, tipo }) => ({ nome, tipo, complemento: '' }));
}

/** Campos: `<campo> <tipo> <complemento...>`, `<campo> <tipo>` ou só o nome (ex.: "ID INT UNIQUE"). */
export function lerSerieCampos(texto: string): ItemSerie[] {
  return lerSerie(texto);
}

function lerSerie(texto: string): ItemSerie[] {
  const out: ItemSerie[] = [];
  for (const linha of texto.split(/\r?\n/)) {
    const partes = linha.trim().replace(/ +/g, ' ').split(' ').filter(Boolean);
    if (!partes.length) continue;
    out.push({ nome: partes[0], tipo: partes[1] ?? '', complemento: partes.slice(2).join(' ') });
  }
  return out;
}

export const DICA_SERIE_ATRIBUTOS = 'Editor rápido de atributos. Informar um atributo por linha no formato <atributo><espaço><domínio> ex. RG INT, ou apenas o nome do atributo.';
export const DICA_SERIE_CAMPOS = 'Editor rápido de campos. Informar um campo por linha no formato <campo><espaço><tipo><espaço><complemento> ex. ID INT UNIQUE, ou <campo><espaço><tipo>, ou apenas o nome do campo.';
