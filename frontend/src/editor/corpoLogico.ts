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

import { Forma } from './types';

/**
 * Texto desenhado no corpo dos objetos lógicos (view, sequence, rotina, tipo customizado): um rótulo entre parênteses, linhas de resumo e, para view/rotina,
 * o corpo SQL (texto livre, alinhado à esquerda).
 */
export interface CorpoLogico {
  rotulo: string;
  linhas: string[];
  /** Texto corrido (SQL) desenhado abaixo das linhas, quebrado na largura. */
  corpo: string;
}

const s = (f: Forma, k: string) => String(f.props[k] ?? '').trim();

export function corpoDoObjetoLogico(f: Forma): CorpoLogico | null {
  switch (f.kind) {
    case 'visao':
    case 'visaoMaterializada':
      return { rotulo: f.kind === 'visaoMaterializada' ? '(view materializada)' : '(view)', linhas: [], corpo: String(f.props.corpo ?? '') };
    case 'sequencia': {
      const linhas: string[] = [];
      if (s(f, 'inicio')) linhas.push(`início: ${s(f, 'inicio')}`);
      if (s(f, 'incremento')) linhas.push(`incremento: ${s(f, 'incremento')}`);
      if (s(f, 'minimo')) linhas.push(`mínimo: ${s(f, 'minimo')}`);
      if (s(f, 'maximo')) linhas.push(`máximo: ${s(f, 'maximo')}`);
      if (f.props.ciclo) linhas.push('cíclica');
      return { rotulo: '(sequence)', linhas, corpo: '' };
    }
    case 'funcao':
    case 'procedure': {
      const proc = f.kind === 'procedure';
      let rotulo = proc ? '(procedure)' : '(function)';
      if (!proc && s(f, 'retorno')) rotulo += ` → ${s(f, 'retorno')}`;
      const linhas = s(f, 'parametros') ? [`(${s(f, 'parametros')})`] : [];
      return { rotulo, linhas, corpo: String(f.props.corpo ?? '') };
    }
    case 'enum':
      return { rotulo: '(enum)', linhas: String(f.props.rotulos ?? '').split(/\r?\n/).map((v) => v.trim()).filter(Boolean), corpo: '' };
    case 'dominio': {
      const linhas: string[] = [];
      if (s(f, 'tipoBase')) linhas.push(s(f, 'tipoBase'));
      if (s(f, 'padrao')) linhas.push(`default ${s(f, 'padrao')}`);
      if (f.props.naoNulo) linhas.push('not null');
      if (s(f, 'restricao')) linhas.push(`check ${s(f, 'restricao')}`);
      return { rotulo: '(domain)', linhas, corpo: '' };
    }
    default:
      return null;
  }
}

/** Cor de borda padrão da view materializada (0x7B1FA2). */
export const COR_BORDA_MATERIALIZADA = '#7b1fa2';
