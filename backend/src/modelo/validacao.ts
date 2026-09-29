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

import { Diagrama } from './tipos';

const TIPOS = ['conceitual', 'logico', 'eap', 'fluxo', 'atividade', 'livre', 'nosql'];
const MAX_FORMAS = 5000;
const MAX_LIGACOES = 20000;

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const numero = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** Valida a FORMA do JSON recebido (não o conteúdo semântico - isso é o "Validar modelo"). Devolve os erros; vazio = ok. */
export function validarDiagrama(d: unknown): string[] {
  const erros: string[] = [];
  if (!ehObjeto(d)) return ['corpo inválido'];
  if (typeof d.nome !== 'string' || !d.nome.trim() || d.nome.length > 200) erros.push('nome obrigatório (até 200 caracteres)');
  if (typeof d.tipo !== 'string' || !TIPOS.includes(d.tipo)) erros.push(`tipo inválido (use ${TIPOS.join(', ')})`);
  if (!Array.isArray(d.formas)) return [...erros, 'formas deve ser uma lista'];
  if (!Array.isArray(d.ligacoes)) return [...erros, 'ligacoes deve ser uma lista'];
  if (d.formas.length > MAX_FORMAS) return [...erros, `formas demais (máximo ${MAX_FORMAS})`];
  if (d.ligacoes.length > MAX_LIGACOES) return [...erros, `ligações demais (máximo ${MAX_LIGACOES})`];

  const ids = new Set<string>();
  for (const f of d.formas) {
    if (!ehObjeto(f) || typeof f.id !== 'string' || !f.id || f.id.length > 100) { erros.push('forma sem id válido'); continue; }
    if (ids.has(f.id)) erros.push(`id de forma repetido: ${f.id}`);
    ids.add(f.id);
    if (typeof f.kind !== 'string' || !f.kind) erros.push(`forma ${f.id} sem kind`);
    if (![f.x, f.y, f.w, f.h].every(numero)) erros.push(`forma ${f.id} com posição/tamanho inválidos`);
    if (typeof f.texto !== 'string') erros.push(`forma ${f.id} sem texto`);
    if (!ehObjeto(f.props)) erros.push(`forma ${f.id} sem props`);
  }
  const ligIds = new Set<string>();
  for (const l of d.ligacoes) {
    if (!ehObjeto(l) || typeof l.id !== 'string' || !l.id) { erros.push('ligação sem id válido'); continue; }
    if (typeof l.de !== 'string' || typeof l.para !== 'string') { erros.push(`ligação ${l.id} aponta para forma inexistente`); continue; }
    ligIds.add(l.id);
  }
  //# Pontas soltas (Fluxo/Atividade/Livre): `de`/`para` pode ser vazio (ponto livre em props.pontaA/pontaB) ou o id de
  //# outra ligação (ponta grudada na linha). Fora isso, deve ser uma forma existente.
  const pontoLivre = (v: unknown) => ehObjeto(v) && numero(v.x) && numero(v.y);
  for (const l of d.ligacoes) {
    if (!ehObjeto(l) || typeof l.id !== 'string' || typeof l.de !== 'string' || typeof l.para !== 'string') continue;
    const props = ehObjeto(l.props) ? l.props : {};
    for (const [ponta, id, livre] of [['A', l.de, props.pontaA], ['B', l.para, props.pontaB]] as const) {
      if (ids.has(id)) continue;
      const solta = id === '' || (ligIds.has(id) && id !== l.id);
      if (!solta) erros.push(`ligação ${l.id} aponta para forma inexistente`);
      else if (!pontoLivre(livre)) erros.push(`ligação ${l.id} com ponta ${ponta} solta sem ponto (props.ponta${ponta})`);
    }
  }
  return erros;
}

export const comoDiagrama = (d: unknown): Diagrama => d as Diagrama;
