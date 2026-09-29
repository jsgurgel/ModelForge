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

import * as fs from 'fs';
import * as path from 'path';
import { importarDdlLogico } from './importador';

const CORPUS = path.join(__dirname, '../../test/corpus');
const FIXTURES = path.resolve(__dirname, '../../test/fixtures');
const FIXTURES_IMPORT = path.resolve(__dirname, '../../test/fixtures-import');

/** Renomeia os ids pela ordem de aparição (formas > campos > constraints > índices > gatilhos) e ajusta as referências. */
function normalizar(m: any): any {
  const mapa = new Map<string, string>();
  const novo = (v: string, p: string) => {
    if (!mapa.has(v)) mapa.set(v, p + mapa.size);
    return mapa.get(v)!;
  };
  for (const f of m.formas) {
    novo(f.id, 'f');
    for (const c of f.props.campos ?? []) novo(c.id, 'c');
    for (const c of f.props.constraints ?? []) novo(c.id, 'k');
    for (const i of f.props.indices ?? []) novo(i.id, 'i');
    for (const g of f.props.gatilhos ?? []) novo(g.id, 'g');
  }
  const ref = (v: string | null) => (v === null ? null : mapa.get(v));
  return {
    tipo: m.tipo, nome: m.nome, prefixo: m.prefixo,
    formas: m.formas.map((f: any) => {
      const p = { ...f.props };
      if (f.kind === 'tabela') {
        p.campos = p.campos.map((c: any) => ({ ...c, id: mapa.get(c.id) }));
        p.constraints = p.constraints.map((c: any) => ({
          ...c, id: mapa.get(c.id),
          camposOrigem: c.camposOrigem.map(ref), camposDestino: c.camposDestino.map(ref),
          constraintOrigem: c.constraintOrigem ? { tabelaId: mapa.get(c.constraintOrigem.tabelaId), indice: c.constraintOrigem.indice } : null,
        }));
        p.indices = p.indices.map((i: any) => ({ ...i, id: mapa.get(i.id), campos: i.campos.map(ref) }));
        p.gatilhos = p.gatilhos.map((g: any) => ({ ...g, id: mapa.get(g.id) }));
      }
      return { ...f, id: mapa.get(f.id), props: p };
    }),
  };
}

const nomes = fs.readdirSync(CORPUS).filter((n) => n.endsWith('.sql')).map((n) => n.replace(/\.sql$/, ''));

describe('importarDdlLogico contra as fixtures de referência', () => {
  for (const nome of nomes) {
    const fx = path.join(FIXTURES, nome + '.json');
    if (!fs.existsSync(fx)) continue;
    it(`${nome}: modelo`, () => {
      const script = fs.readFileSync(path.join(CORPUS, nome + '.sql'), 'utf8');
      const esperado = JSON.parse(fs.readFileSync(fx, 'utf8')).modelo;
      const { diagrama } = importarDdlLogico(script, nome);
      expect(normalizar(diagrama)).toEqual(normalizar(esperado));
    });
    const fi = path.join(FIXTURES_IMPORT, nome + '.json');
    if (fs.existsSync(fi)) {
      it(`${nome}: avisos e erros`, () => {
        const script = fs.readFileSync(path.join(CORPUS, nome + '.sql'), 'utf8');
        const esperado = JSON.parse(fs.readFileSync(fi, 'utf8'));
        const { avisos, erros } = importarDdlLogico(script, nome);
        expect({ avisos, erros }).toEqual({ avisos: esperado.avisos, erros: esperado.erros });
      });
    }
  }
});

describe('importarDdlLogico (casos pontuais)', () => {
  it('script sem DDL reconhecível gera erro e diagrama vazio', () => {
    const r = importarDdlLogico('SELECT 1;', 'x');
    expect(r.erros).toHaveLength(1);
    expect(r.diagrama.formas).toHaveLength(0);
  });

  it('cria a FK ligando à PK de origem e uma ligação logicoLinha', () => {
    const r = importarDdlLogico('CREATE TABLE a (id int PRIMARY KEY); CREATE TABLE b (id int PRIMARY KEY, a_id int REFERENCES a(id));');
    expect(r.diagrama.ligacoes).toHaveLength(1);
    const b = r.diagrama.formas[1].props;
    const fk = b.constraints.find((c: any) => c.tipo === 'FK');
    expect(fk.constraintOrigem).toEqual({ tabelaId: r.diagrama.formas[0].id, indice: 0 });
    expect(b.campos[1].fk).toBe(true);
  });

  it('não interpreta ponto e vírgula dentro de $$ como fim de comando', () => {
    const r = importarDdlLogico('CREATE FUNCTION f() RETURNS int AS $$ BEGIN ALTER TABLE t ADD PRIMARY KEY (x); RETURN 1; END; $$ LANGUAGE plpgsql;');
    expect(r.diagrama.formas).toHaveLength(1);
    expect(r.diagrama.formas[0].kind).toBe('funcao');
  });
});
