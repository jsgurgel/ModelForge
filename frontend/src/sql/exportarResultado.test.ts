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
import { exportarResultado } from './exportarResultado';
import { ResultadoComandoSql } from '../api';

const r: ResultadoComandoSql = {
  sql: 'SELECT * FROM clientes',
  colunas: ['id', 'nome', 'email'],
  linhas: [[1, 'João', 'joao@test.com'], [2, 'Maria', null]],
  afetadas: null,
  truncado: false,
  ms: 10,
};

describe('exportarResultado', () => {
  it('CSV com BOM e aspas', () => {
    const csv = exportarResultado(r, 'csv');
    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv).toContain('id,nome,email');
    expect(csv).toContain('1,João,joao@test.com');
    expect(csv).toContain('2,Maria,');
  });

  it('JSON como array de objetos', () => {
    const json = exportarResultado(r, 'json');
    const arr = JSON.parse(json);
    expect(arr.length).toBe(2);
    expect(arr[0].id).toBe(1);
    expect(arr[0].nome).toBe('João');
    expect(arr[1].email).toBe(null);
  });

  it('SQL INSERT', () => {
    const sql = exportarResultado(r, 'sql', 'clientes');
    expect(sql).toContain('INSERT INTO clientes (id, nome, email) VALUES (1, \'João\', \'joao@test.com\');');
    expect(sql).toContain('VALUES (2, \'Maria\', NULL);');
  });

  it('Markdown com header e separador', () => {
    const md = exportarResultado(r, 'markdown');
    expect(md).toContain('| id | nome | email |');
    expect(md).toContain('| --- | --- | --- |');
    expect(md).toContain('| 1 | João | joao@test.com |');
  });

  it('HTML com tabela', () => {
    const html = exportarResultado(r, 'html');
    expect(html).toContain('<table');
    expect(html).toContain('<th>id</th>');
    expect(html).toContain('<td>João</td>');
    expect(html).toContain('<i>null</i>');
  });

  it('escapa HTML', () => {
    const r2: ResultadoComandoSql = { ...r, linhas: [[1, '<script>alert(1)</script>', 'x']] };
    const html = exportarResultado(r2, 'html');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
  });
});