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

import { DialetoFalso } from './dialeto-falso';
import { lerCatalogo } from './catalogo';
import { CatalogoJson } from './dialeto-falso';

const cat: CatalogoJson = {
  objetos: [
    { nome: 'clientes', tipo: 'TABELA' },
    { nome: 'pedidos', tipo: 'TABELA' },
    { nome: 'vw_ativos', tipo: 'VIEW' },
    { nome: 'seq_id', tipo: 'SEQUENCIA' },
  ],
  colunas: {
    clientes: [
      { nome: 'id', tipo: 'integer', nullable: false, padrao: null },
      { nome: 'nome', tipo: 'varchar(100)', nullable: false, padrao: null },
      { nome: 'email', tipo: 'varchar(255)', nullable: true, padrao: null },
    ],
    pedidos: [
      { nome: 'id', tipo: 'integer', nullable: false, padrao: null },
      { nome: 'cliente_id', tipo: 'integer', nullable: false, padrao: null },
    ],
  },
  pk: { clientes: ['id'], pedidos: ['id'] },
  fks: { pedidos: [{ nome: 'fk_pedido_cliente', tabelaLocal: 'pedidos', schemaLocal: null, colunaLocal: 'cliente_id', tabelaRef: 'clientes', schemaRef: null, colunaRef: 'id' }] },
  indices: {},
};

describe('catalogo (lerCatalogo)', () => {
  it('devolve schemas + objetos + colunas para autocomplete', async () => {
    const d = new DialetoFalso(cat, 'sqlite', false);
    const r = await lerCatalogo(d, '');
    expect(r.schemas).toEqual([]);
    const tabelas = r.objetos.filter((e) => e.tipo === 'tabela');
    expect(tabelas.map((e) => e.nome)).toEqual(['clientes', 'pedidos']);
    const views = r.objetos.filter((e) => e.tipo === 'view');
    expect(views.map((e) => e.nome)).toEqual(['vw_ativos']);
    const colunas = r.objetos.filter((e) => e.tipo === 'coluna' && e.tabela === 'clientes');
    expect(colunas.map((e) => e.nome)).toEqual(['id', 'nome', 'email']);
    expect(colunas[1].tipoColuna).toBe('varchar(100)');
  });

  it('sem schema no banco: inserir é o nome puro', async () => {
    const d = new DialetoFalso(cat, 'sqlite', false);
    const r = await lerCatalogo(d, '');
    const tabela = r.objetos.find((e) => e.tipo === 'tabela' && e.nome === 'clientes');
    expect(tabela?.inserir).toBe('clientes');
  });

  it('com schemas: lista cada schema como entrada', async () => {
    const dPg = new DialetoFalso(cat, 'postgresql', true, {
      schemas: async () => ['public', 'auditoria'],
    });
    const r = await lerCatalogo(dPg, 'public');
    const schemas = r.objetos.filter((e) => e.tipo === 'schema');
    expect(schemas.map((e) => e.nome)).toEqual(['public', 'auditoria']);
    expect(r.schemas).toEqual(['public', 'auditoria']);
  });

  it('sem schema escolhido: cada objeto sai com o schema real e inserir qualificado', async () => {
    const dPg = new DialetoFalso(cat, 'postgresql', true, {
      schemas: async () => ['public', 'auditoria'],
    });
    const r = await lerCatalogo(dPg, '');
    const emAuditoria = r.objetos.filter((e) => e.tipo === 'tabela' && e.schema === 'auditoria');
    expect(emAuditoria.length).toBeGreaterThan(0);
    expect(emAuditoria[0].inserir).toBe('auditoria.clientes');
    const emPublic = r.objetos.filter((e) => e.tipo === 'tabela' && e.schema === 'public');
    expect(emPublic[0].inserir).toBe('public.clientes');
  });

  it('inclui sequences e rotinas', async () => {
    const d = new DialetoFalso(cat, 'sqlite', false, {
      sequencias: async () => [{ nome: 'seq_id', tipo: 'SEQUENCIA' }],
      rotinasNomes: async () => [{ nome: 'fn_total', tipo: 'ROTINA' }],
    });
    const r = await lerCatalogo(d, '');
    const seqs = r.objetos.filter((e) => e.tipo === 'sequencia');
    expect(seqs.map((e) => e.nome)).toContain('seq_id');
    const rotinas = r.objetos.filter((e) => e.tipo === 'rotina');
    expect(rotinas.map((e) => e.nome)).toContain('fn_total');
  });

  it('não duplica entradas de sequencia já listadas como objeto', async () => {
    const d = new DialetoFalso(cat, 'sqlite', false, {
      sequencias: async () => [{ nome: 'seq_id', tipo: 'SEQUENCIA' }],
    });
    const r = await lerCatalogo(d, '');
    const seqs = r.objetos.filter((e) => e.tipo === 'sequencia' && e.nome === 'seq_id');
    expect(seqs.length).toBe(1);
  });

  it('falhas em rotinas/sequences não derrubam o catálogo', async () => {
    const d = new DialetoFalso(cat, 'sqlite', false, {
      sequencias: async () => { throw new Error('boom'); },
      rotinasNomes: async () => { throw new Error('boom'); },
    });
    const r = await lerCatalogo(d, '');
    expect(r.objetos.filter((e) => e.tipo === 'tabela').length).toBe(2);
  });
});