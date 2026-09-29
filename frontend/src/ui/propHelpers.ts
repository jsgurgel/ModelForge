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

import { Linguagem } from '../editor/realce';
import { Prop } from './PropertyGrid';
import { dicaPorChave } from './dicas';
import type { FonteSel } from './fontesCores';

/** Fábricas de linhas do Inspector (rótulo | editor), compartilhadas por Inspector e InspectorExtra. */
export const txt = (rotulo: string, valor: string, aoMudar: (v: string) => void): Prop => ({
  rotulo, valor, editor: { tipo: 'texto' }, aoMudar: (v) => aoMudar(String(v)),
});
export const area = (rotulo: string, valor: string, aoMudar: (v: string) => void): Prop => ({
  rotulo, valor, editor: { tipo: 'textarea' }, aoMudar: (v) => aoMudar(String(v)),
});
export const codigo = (rotulo: string, valor: string, linguagem: Linguagem, aoMudar: (v: string) => void): Prop => ({
  rotulo, valor, editor: { tipo: 'codigo', linguagem }, aoMudar: (v) => aoMudar(String(v)),
});
export const num = (rotulo: string, valor: number, aoMudar: (v: number) => void, min?: number, max?: number): Prop => ({
  rotulo, valor, editor: { tipo: 'numero', min, max }, aoMudar: (v) => aoMudar(Number(v)),
});
export const bool = (rotulo: string, valor: boolean, aoMudar: (v: boolean) => void): Prop => ({
  rotulo, valor, editor: { tipo: 'bool' }, aoMudar: (v) => aoMudar(Boolean(v)),
});
export const cor = (rotulo: string, valor: string | undefined, aoMudar: (v: string) => void): Prop => ({
  rotulo, valor: valor ?? '', editor: { tipo: 'cor' }, aoMudar: (v) => aoMudar(String(v)),
});
export const botao = (rotulo: string, texto: string, aoClicar: () => void): Prop => ({
  rotulo, editor: { tipo: 'botao', rotulo: texto }, aoClicar,
});
export const sel = (rotulo: string, valor: string, opcoes: string[], aoMudar: (v: string) => void): Prop => ({
  rotulo, valor, editor: { tipo: 'select', opcoes }, aoMudar: (v) => aoMudar(String(v)),
});
export const leitura = (rotulo: string, valor: string | number | boolean): Prop => ({ rotulo, valor, editor: { tipo: 'leitura' } });

/** Marca a linha com um id (para as condições) e/ou força habilitar/desabilitar. */
export const comId = (p: Prop, id: string): Prop => ({ ...p, id });
export const forcarDesabilitado = (p: Prop, desabilitar: boolean): Prop => ({ ...p, forcar: desabilitar ? 'desabilitar' : undefined, desabilitado: desabilitar || p.desabilitado });
/** Anexa a dica pela chave (ex. "basedrawer.margem"). */
export const comDica = (p: Prop, chave: string): Prop => ({ ...p, dica: dicaPorChave(chave) || p.dica });
/** Linha do tipo "fonte" (botão + seletor). */
export const fonte = (rotulo: string, valor: FonteSel, aoMudar: (f: FonteSel) => void, padrao?: FonteSel): Prop => ({
  rotulo, editor: { tipo: 'fonte', fonte: valor, padrao, aoMudarFonte: aoMudar },
});
