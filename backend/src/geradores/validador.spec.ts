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

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { formatarRelatorio, hashString, jtrim, ordemTabelaHash, validarLogico } from './validador';

const DIR = join(__dirname, '../../test/fixtures');

const fixtures = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ f, j: JSON.parse(readFileSync(join(DIR, f), 'utf8')) }))
  .filter(({ j }) => j.modelo && typeof j.validacao === 'string');

describe('validarLogico + formatarRelatorio (fixtures de referência)', () => {
  it('há fixtures', () => expect(fixtures.length).toBeGreaterThan(0));

  it.each(fixtures.map(({ f, j }) => [f, j]))('%s reproduz o relatório de referência', (_f, j: any) => {
    const nome = j.modelo.nome || '<<Lógico>>';
    expect(formatarRelatorio(validarLogico(j.modelo), `"${nome}" (lógico)`)).toBe(j.validacao);
  });

  it('cobre todas as regras: alguma fixture reporta cada tipo de problema', () => {
    const todos = fixtures.map(({ j }) => j.validacao as string).join('\n');
    for (const trecho of [
      'sem chave primária',
      'sem nenhum campo',
      'sem SRID',
      'duplicado',
      'Nome de tabela duplicado',
      'Dependência circular',
      'acima do limite',
      'sem chave de partição',
      'estratégia de partição desconhecida',
      'não inclui a coluna de partição',
      'subparticionamento',
    ]) {
      expect(todos).toContain(trecho);
    }
  });
});

describe('regras que o importador de DDL não consegue produzir', () => {
  const forma = (texto: string, props: any, id = 't1') => ({ id, kind: 'tabela', x: 0, y: 0, w: 1, h: 1, texto, props });
  const campo = (nome: string, tipo: string) => ({ id: 'c_' + nome, nome, tipo, complemento: '', padrao: '', dicionario: '', observacao: '', srid: '', subtipoGeometria: '', pk: false, fk: false, unique: false, separador: false });
  const modelo = (...formas: any[]) => ({ nome: 'm', tipo: 'logico' as const, formas, ligacoes: [] });

  it('tabela sem nome e campo sem tipo', () => {
    const r = validarLogico(modelo(forma('  ', { campos: [campo('a', ' ')] }, 't9')));
    expect(r).toEqual([
      'Tabela (sem nome, id t9): sem nome definido.',
      'Tabela "(sem nome, id t9)": sem chave primária (PK).',
      'Tabela "(sem nome, id t9)", campo "a": sem tipo definido.',
    ]);
  });

  it('auto-referência não é ciclo; ciclo entre duas tabelas é reportado uma vez', () => {
    const fk = (para: string) => ({ id: 'k', tipo: 'FK', nomeada: false, nome: '', expressao: '', camposOrigem: [], camposDestino: [], constraintOrigem: { tabelaId: para, indice: 0 }, onDelete: '', onUpdate: '' });
    const pk = { id: 'p', tipo: 'PK', nomeada: false, nome: '', expressao: '', camposOrigem: ['c_id'], camposDestino: [], constraintOrigem: null, onDelete: '', onUpdate: '' };
    const a = forma('a', { campos: [campo('id', 'int')], constraints: [pk, fk('t1'), fk('t2')] }, 't1');
    const b = forma('b', { campos: [campo('id', 'int')], constraints: [pk, fk('t1')] }, 't2');
    expect(validarLogico(modelo(a, b))).toEqual(['Dependência circular de FK: a → b → a.']);
  });
});

describe('helpers', () => {
  it('formatarRelatorio sem problemas', () => {
    expect(formatarRelatorio([], '"m" (lógico)')).toBe('Nenhum problema encontrado em "m" (lógico).');
  });
  it('jtrim remove tudo <= espaço e nada além', () => {
    expect(jtrim('\u0001 a b\n')).toBe('a b');
    expect(jtrim(' a')).toBe(' a');
  });
  it('hashString bate com String.hashCode', () => {
    expect(hashString('hello')).toBe(99162322);
    expect(hashString('')).toBe(0);
  });
  it('ordemTabelaHash segue os buckets da tabela hash', () => {
    // "A"=65 -> bucket 1, "B"=66 -> 2, "Q"=81 -> 1 (cap 16); no mesmo bin o último inserido vem primeiro
    expect(ordemTabelaHash(['B', 'Q', 'A'])).toEqual(['A', 'Q', 'B']);
  });
});
