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

import { describe, it, expect } from 'vitest';
import { sugerir } from './autocomplete';
import { CatalogoAutocomplete } from '../api';

const catalogo: CatalogoAutocomplete = {
  schemas: ['public'],
  objetos: [
    { tipo: 'schema', nome: 'public', schema: null },
    { tipo: 'tabela', nome: 'clientes', schema: 'public', inserir: 'public.clientes' },
    { tipo: 'tabela', nome: 'pedidos', schema: 'public', inserir: 'public.pedidos' },
    { tipo: 'tabela', nome: 'produtos', schema: 'public', inserir: 'public.produtos' },
    { tipo: 'view', nome: 'vw_ativos', schema: 'public', inserir: 'public.vw_ativos' },
    { tipo: 'coluna', nome: 'id', schema: 'public', tabela: 'clientes', tipoColuna: 'integer' },
    { tipo: 'coluna', nome: 'nome', schema: 'public', tabela: 'clientes', tipoColuna: 'varchar(100)' },
    { tipo: 'coluna', nome: 'email', schema: 'public', tabela: 'clientes', tipoColuna: 'varchar(255)' },
    { tipo: 'coluna', nome: 'telefone', schema: 'public', tabela: 'clientes', tipoColuna: 'varchar(20)' },
    { tipo: 'coluna', nome: 'id', schema: 'public', tabela: 'pedidos', tipoColuna: 'integer' },
    { tipo: 'coluna', nome: 'cliente_id', schema: 'public', tabela: 'pedidos', tipoColuna: 'integer' },
    { tipo: 'coluna', nome: 'valor', schema: 'public', tabela: 'pedidos', tipoColuna: 'decimal(10,2)' },
    { tipo: 'rotina', nome: 'fn_total', schema: 'public', inserir: 'public.fn_total' },
  ],
};

describe('autocomplete (sugerir)', () => {
  it('sem catálogo devolve apenas keywords', () => {
    const s = sugerir('SELECT * FROM ', 14, null);
    expect(s.every((x) => x.tipo === 'kw')).toBe(true);
    expect(s.some((x) => x.label === 'SELECT')).toBe(true);
  });

  it('após FROM sem prefixo: sugere tabelas, views e schemas', () => {
    const sql = 'SELECT * FROM ';
    const s = sugerir(sql, sql.length, catalogo);
    expect(s.some((x) => x.label === 'clientes' && x.tipo === 'tabela')).toBe(true);
    expect(s.some((x) => x.label === 'pedidos' && x.tipo === 'tabela')).toBe(true);
    expect(s.some((x) => x.label === 'vw_ativos' && x.tipo === 'view')).toBe(true);
  });

  it('tabelas com schema: sugestão carrega inserir qualificado', () => {
    const sql = 'SELECT * FROM ';
    const s = sugerir(sql, sql.length, catalogo);
    const clientes = s.find((x) => x.label === 'clientes');
    expect(clientes?.inserir).toBe('public.clientes');
  });

  it('após FROM com prefixo "cli": filtra tabelas por prefixo', () => {
    const sql = 'SELECT * FROM cli';
    const s = sugerir(sql, sql.length, catalogo);
    expect(s.some((x) => x.label === 'clientes')).toBe(true);
    expect(s.every((x) => !x.label.startsWith('ped'))).toBe(true);
  });

  it('após FROM com prefixo "p": sugere pedidos e produtos, não clientes', () => {
    const sql = 'SELECT * FROM p';
    const s = sugerir(sql, sql.length, catalogo);
    expect(s.some((x) => x.label === 'pedidos')).toBe(true);
    expect(s.some((x) => x.label === 'produtos')).toBe(true);
    expect(s.every((x) => !x.label.startsWith('c'))).toBe(true);
  });

  it('após "SELECT " (antes do FROM): sugere colunas das tabelas referenciadas', () => {
    const sql = 'SELECT * FROM clientes c\nWHERE c.';
    const pos = sql.length;
    const s = sugerir(sql, pos, catalogo);
    expect(s.some((x) => x.label === 'id')).toBe(true);
    expect(s.some((x) => x.label === 'nome')).toBe(true);
    expect(s.some((x) => x.label === 'email')).toBe(true);
  });

  it('entre SELECT e FROM: sugere colunas da tabela do FROM', () => {
    const sql = 'SELECT  FROM clientes';
    const pos = 7;
    const s = sugerir(sql, pos, catalogo);
    expect(s.some((x) => x.label === 'id' && x.tipo === 'coluna')).toBe(true);
    expect(s.some((x) => x.label === 'nome' && x.tipo === 'coluna')).toBe(true);
    expect(s.some((x) => x.label === 'email' && x.tipo === 'coluna')).toBe(true);
  });

  it('após WHERE com alias.coluna: sugere colunas da tabela do alias', () => {
    const sql = 'SELECT * FROM clientes c WHERE c.';
    const pos = sql.length;
    const s = sugerir(sql, pos, catalogo);
    expect(s.some((x) => x.label === 'id')).toBe(true);
    expect(s.some((x) => x.label === 'nome')).toBe(true);
    expect(s.some((x) => x.label === 'telefone')).toBe(true);
  });

  it('após JOIN: sugere tabelas', () => {
    const sql = 'SELECT * FROM clientes c JOIN ';
    const pos = sql.length;
    const s = sugerir(sql, pos, catalogo);
    expect(s.some((x) => x.label === 'pedidos' && x.tipo === 'tabela')).toBe(true);
    expect(s.some((x) => x.label === 'produtos' && x.tipo === 'tabela')).toBe(true);
  });

  it('após schema. sugere objetos do schema', () => {
    const sql = 'SELECT * FROM public.';
    const pos = sql.length;
    const s = sugerir(sql, pos, catalogo);
    expect(s.some((x) => x.label === 'clientes')).toBe(true);
    expect(s.some((x) => x.label === 'pedidos')).toBe(true);
  });

  it('cursor entre SELECT e FROM: reconhece a tabela que está DEPOIS do cursor', () => {
    const sql = 'SELECT  FROM clientes';
    const pos = 7;
    const s = sugerir(sql, pos, catalogo);
    const colunas = s.filter((x) => x.tipo === 'coluna');
    expect(colunas.some((x) => x.label === 'id')).toBe(true);
    expect(colunas.some((x) => x.label === 'nome')).toBe(true);
    expect(colunas.some((x) => x.label === 'email')).toBe(true);
    expect(colunas.some((x) => x.label === 'cliente_id')).toBe(false);
  });

  it('zona SELECT: com tabela conhecida, mostra só colunas (sem keywords no topo)', () => {
    const sql = 'SELECT  FROM clientes';
    const pos = 7;
    const s = sugerir(sql, pos, catalogo);
    expect(s.every((x) => x.tipo === 'coluna')).toBe(true);
  });

  it('alias. com FROM depois do cursor: sugere só colunas da tabela do alias', () => {
    const sql = 'SELECT c. FROM clientes c';
    const pos = sql.indexOf('c.') + 2;
    const s = sugerir(sql, pos, catalogo);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x.tipo === 'coluna')).toBe(true);
    expect(s.some((x) => x.label === 'id')).toBe(true);
    expect(s.some((x) => x.label === 'nome')).toBe(true);
    expect(s.some((x) => x.label === 'email')).toBe(true);
    expect(s.some((x) => x.label === 'cliente_id')).toBe(false);
  });

  it('alias. com FROM antes do cursor: sugere só colunas da tabela do alias', () => {
    const sql = 'SELECT * FROM clientes c WHERE c.';
    const pos = sql.length;
    const s = sugerir(sql, pos, catalogo);
    expect(s.every((x) => x.tipo === 'coluna')).toBe(true);
    expect(s.some((x) => x.label === 'telefone')).toBe(true);
    expect(s.some((x) => x.label === 'valor')).toBe(false);
  });

  it('alias com JOIN: cada alias resolve sua tabela', () => {
    const sql = 'SELECT * FROM clientes c JOIN pedidos p WHERE p.';
    const pos = sql.length;
    const s = sugerir(sql, pos, catalogo);
    expect(s.every((x) => x.tipo === 'coluna')).toBe(true);
    expect(s.some((x) => x.label === 'cliente_id')).toBe(true);
    expect(s.some((x) => x.label === 'valor')).toBe(true);
    expect(s.some((x) => x.label === 'nome')).toBe(false);
  });

  it('na zona SELECT com JOIN: sugere colunas de todas as tabelas do FROM/JOIN', () => {
    const sql = 'SELECT  FROM clientes c JOIN pedidos p ON c.id = p.cliente_id';
    const pos = 7;
    const s = sugerir(sql, pos, catalogo);
    expect(s.some((x) => x.label === 'nome' && x.tipo === 'coluna')).toBe(true);
    expect(s.some((x) => x.label === 'valor' && x.tipo === 'coluna')).toBe(true);
  });

  it('sem prefixo (vazio): devolve sugestões mistas', () => {
    const s = sugerir('', 0, catalogo);
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.some((x) => x.label === 'SELECT')).toBe(true);
    expect(s.some((x) => x.label === 'clientes')).toBe(true);
  });

  it('não duplica sugestões', () => {
    const sql = 'SELECT id FROM clientes c WHERE c.';
    const pos = sql.length;
    const s = sugerir(sql, pos, catalogo);
    const labels = s.map((x) => x.label);
    const unicos = new Set(labels);
    expect(labels.length).toBe(unicos.size);
  });

  it('detalhe mostra o schema da tabela', () => {
    const sql = 'SELECT * FROM ';
    const s = sugerir(sql, sql.length, catalogo);
    const clientes = s.find((x) => x.label === 'clientes');
    expect(clientes?.detalhe).toContain('public');
  });
});