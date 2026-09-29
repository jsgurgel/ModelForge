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
import { linguagemDoArquivo, tokenizar } from './realce';

const tipos = (t: string, l: Parameters<typeof tokenizar>[1]) => tokenizar(t, l).filter((x) => x.tipo !== 'tx' && x.tipo !== 'op').map((x) => `${x.tipo}:${x.texto}`);

describe('realce de sintaxe', () => {
  it('não perde nem altera texto', () => {
    const s = "CREATE TABLE \"a b\" (id INT, n VARCHAR(10) DEFAULT 'x''y'); -- fim\n/* c */ SELECT 1.5;\n$$ corpo $$";
    for (const l of ['sql', 'java', 'python', 'prisma', 'js', 'texto'] as const) expect(tokenizar(s, l).map((t) => t.texto).join('')).toBe(s);
  });
  it('SQL: palavras-chave, tipos, strings, números e comentários', () => {
    expect(tipos("CREATE TABLE t (id integer NOT NULL, n varchar(20) DEFAULT 'a''b'); -- x", 'sql')).toEqual([
      'kw:CREATE', 'kw:TABLE', 'tp:integer', 'kw:NOT', 'kw:NULL', 'tp:varchar', 'nu:20', 'kw:DEFAULT', "st:'a''b'", 'cm:-- x',
    ]);
  });
  it('SQL: identificador entre aspas e dollar quoting', () => {
    expect(tipos('SELECT "Col" FROM x $$ a; b $$', 'sql')).toEqual(['kw:SELECT', 'id:"Col"', 'kw:FROM', 'st:$$ a; b $$']);
  });
  it('Java, Python, Prisma e mongosh', () => {
    expect(tipos('@Entity public class A { private Long id; }', 'java')).toEqual(['an:@Entity', 'kw:public', 'kw:class', 'kw:private', 'tp:Long']);
    expect(tipos('class A(Base):  # c\n  id = Column(Integer)', 'python')).toEqual(['kw:class', 'cm:# c', 'tp:Column', 'tp:Integer']);
    expect(tipos('model A { id Int @id }', 'prisma')).toEqual(['kw:model', 'tp:Int', 'an:@id']);
    expect(tipos('db.createCollection("a")', 'js')).toEqual(['kw:db', 'st:"a"']);
  });
  it('linguagem pelo nome do arquivo', () => {
    expect(linguagemDoArquivo('x.sql')).toBe('sql');
    expect(linguagemDoArquivo('X.java')).toBe('java');
    expect(linguagemDoArquivo('x.py')).toBe('python');
    expect(linguagemDoArquivo('x.txt')).toBe('texto');
  });
});
