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

import { describe, expect, it } from 'vitest';
import { lerSerieAtributos, lerSerieCampos } from './serie';

describe('adicionar em série', () => {
  it('atributos: nome e domínio, linhas vazias ignoradas', () => {
    expect(lerSerieAtributos('RG INT\n\n  nome  \r\ncpf   VARCHAR(11) extra')).toEqual([
      { nome: 'RG', tipo: 'INT', complemento: '' }, { nome: 'nome', tipo: '', complemento: '' }, { nome: 'cpf', tipo: 'VARCHAR(11)', complemento: '' },
    ]);
  });
  it('campos: nome, tipo e complemento', () => {
    expect(lerSerieCampos('ID INT UNIQUE NOT NULL\nnome VARCHAR(50)\nobs')).toEqual([
      { nome: 'ID', tipo: 'INT', complemento: 'UNIQUE NOT NULL' }, { nome: 'nome', tipo: 'VARCHAR(50)', complemento: '' }, { nome: 'obs', tipo: '', complemento: '' },
    ]);
  });
});
