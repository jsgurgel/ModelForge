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
import { lerTabelaDoBanco, TIPO_DND_TABELA, tabelaDoBancoParaForma } from './bancoDrop';
import { propsTabela } from './logico';

const col = (nome: string, tipo: string, nullable: boolean, pk = false, padrao: string | null = null) => ({ nome, tipo, nullable, chavePrimaria: pk, padrao });

describe('tabelaDoBancoParaForma', () => {
  it('cria a tabela com campos, PK e NOT NULL', () => {
    const f = tabelaDoBancoParaForma({ nome: 'cliente', tipo: 'TABELA', schema: 'app', colunas: [col('id', 'integer', false, true), col('nome', 'varchar(50)', true, false, "'x'")] }, 10, 20);
    expect(f).toMatchObject({ kind: 'tabela', x: 10, y: 20, texto: 'cliente' });
    const p = propsTabela(f);
    expect(p.schema).toBe('app');
    expect(p.campos.map((c) => [c.nome, c.tipo, c.pk, c.complemento, c.padrao])).toEqual([['id', 'integer', true, 'NOT NULL', ''], ['nome', 'varchar(50)', false, '', "'x'"]]);
    expect(p.constraints).toHaveLength(1);
    expect(p.constraints[0]).toMatchObject({ tipo: 'PK', camposOrigem: [p.campos[0].id] });
  });
  it('view vira visão; view materializada, visão materializada', () => {
    expect(tabelaDoBancoParaForma({ nome: 'v', tipo: 'VIEW', schema: '', colunas: [] }, 0, 0).kind).toBe('visao');
    expect(tabelaDoBancoParaForma({ nome: 'v', tipo: 'VIEW_MATERIALIZADA', schema: '', colunas: [] }, 0, 0).kind).toBe('visaoMaterializada');
  });
  it('lê e rejeita o payload do dnd', () => {
    const ok = JSON.stringify({ nome: 't', tipo: 'TABELA', schema: '', colunas: [] });
    expect(lerTabelaDoBanco({ getData: (t) => (t === TIPO_DND_TABELA ? ok : '') })?.nome).toBe('t');
    expect(lerTabelaDoBanco({ getData: () => 'lixo' })).toBeNull();
    expect(lerTabelaDoBanco({ getData: () => '' })).toBeNull();
  });
});
