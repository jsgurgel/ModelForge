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
import { gerarDsl, parseDsl } from './nosqlDsl';

const EXEMPLO = `nome: string
idade: number
endereco: embedded {
    rua: string
    complemento: embedded {
        bloco: string
    }
}
autor: reference Usuario
`;

describe('nosqlDsl', () => {
  it('lê campos simples, aninhados e referência', () => {
    const r = parseDsl(EXEMPLO);
    expect(r.erros).toEqual([]);
    expect(r.campos).toHaveLength(4);
    expect(r.campos[2].subCampos![1].subCampos![0].nome).toBe('bloco');
    expect(r.campos[3]).toMatchObject({ tipo: 'reference', colecaoReferenciada: 'Usuario' });
  });

  it('ida e volta preserva a estrutura', () => {
    expect(parseDsl(gerarDsl(parseDsl(EXEMPLO).campos)).campos).toEqual(parseDsl(EXEMPLO).campos);
  });

  it('rejeita tipo desconhecido, bloco vazio e bloco não fechado', () => {
    expect(parseDsl('a: xyz').erros.length).toBeGreaterThan(0);
    expect(parseDsl('a: embedded {\n}\n').erros.length).toBeGreaterThan(0);
    expect(parseDsl('a: embedded {\nb: string\n').erros.length).toBeGreaterThan(0);
    expect(parseDsl('}\n').erros.length).toBeGreaterThan(0);
  });
});
