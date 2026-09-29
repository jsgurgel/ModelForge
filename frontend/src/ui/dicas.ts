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

import dados from '../dicas.json';

/**
 * Dicas (tooltips) do Inspector, em dicas.json (chaves Inspector.dica.*).
 * `dicas` é indexado pela mesma chave (ex. "diagrama.gradiente.is"); `rotulos` liga o texto da
 * linha (Inspector.obj.*) às chaves que o usam; `captions` é o rótulo de cada chave.
 */
const D = dados as { dicas: Record<string, string>; rotulos: Record<string, string[]>; captions: Record<string, string>; outras: Record<string, string> };

export const todasAsDicas = (): Record<string, string> => D.dicas;

/** Dica pela chave (sem o prefixo "Inspector.dica."). Vazio se não existir. */
export const dicaPorChave = (chave: string): string => D.dicas[chave] ?? '';

/** Rótulo (Inspector.obj.<chave>) - mesmo texto usado nas linhas do Inspector. */
export const rotuloDaChave = (chave: string): string => D.captions[chave] ?? chave;

/** Aliases de rótulos da web que diferem mas equivalem a uma chave. */
const ALIAS: Record<string, string> = {
  'Nome fonte': 'fonte.nome',
  'Tamanho': 'fonte.tamanho',
  'Estilo': 'fonte.estilo',
  'Editar fonte': 'cmdfonte',
  'ID': 'unicid',
};

/**
 * Resolve a dica de uma linha pelo rótulo. Vários rótulos se repetem ("Nome", "Posição"...): `prefixos`
 * (ex. ["gatilho."]) desempata escolhendo a chave que começa com um deles; sem desempate vale a primeira do arquivo.
 */
export function dicaPorRotulo(rotulo: string, prefixos: string[] = []): string {
  const chaves = D.rotulos[rotulo] ?? (ALIAS[rotulo] ? [ALIAS[rotulo]] : []);
  if (!chaves.length) return '';
  const escolhida = chaves.find((k) => prefixos.some((p) => k.startsWith(p))) ?? chaves[0];
  return D.dicas[escolhida] ?? '';
}

/** Prefixos de desempate a partir do título do grupo do Inspector. */
export function prefixosDoGrupo(titulo: string): string[] {
  const t = titulo.toLowerCase();
  if (t.startsWith('gatilho')) return ['gatilho.', 'tabela.gatilho.'];
  if (t.startsWith('índice')) return ['indice.', 'tabela.indice.'];
  if (t.startsWith('ir ')) return ['constraint.', 'tabela.constraint.'];
  if (t.startsWith('campo')) return ['campo.', 'tabela.campos.'];
  if (t.startsWith('cardinalidade')) return ['cardinalidade.'];
  if (t.startsWith('texto')) return ['texto.'];
  if (t.startsWith('gradiente')) return ['diagrama.gradiente', 'texto.gradiente'];
  if (t.startsWith('régua') || t.startsWith('réguas')) return ['basedrawer.'];
  if (t.startsWith('item de desenho')) return ['basedraweritem.'];
  if (t.startsWith('desenho')) return ['desenhador.', 'basedraweritem.'];
  if (t.startsWith('diagrama') || t.startsWith('versão')) return ['diagrama.'];
  return [];
}
