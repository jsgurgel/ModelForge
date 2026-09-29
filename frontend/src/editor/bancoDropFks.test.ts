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
import { ligarFksDaTabelaSolta, tabelaDoBancoParaForma } from './bancoDrop';
import { propsTabela } from './logico';
import { adicionarForma } from './ops';
import { diagramaVazio } from './types';

const col = (nome: string, pk = false) => ({ nome, tipo: 'integer', nullable: !pk, padrao: null, chavePrimaria: pk });
const tab = (nome: string, colunas: ReturnType<typeof col>[], x = 0, y = 0) => tabelaDoBancoParaForma({ nome, tipo: 'TABELA', schema: 's', colunas }, x, y);
const fk = (nome: string, tabelaLocal: string, colunaLocal: string, tabelaRef: string, colunaRef: string) => ({ nome, tabelaLocal, colunaLocal, tabelaRef, colunaRef });

describe('drop de tabela do banco: ligações', () => {
  it('duas FKs para a mesma tabela geram duas linhas', () => {
    let d = diagramaVazio('logico', 't');
    d = adicionarForma(d, tab('unidade', [col('codigo', true)]));
    const f = tab('conversao', [col('id', true), col('origem'), col('destino')], 200, 200);
    const r = ligarFksDaTabelaSolta(adicionarForma(d, f), f.id, [fk('a', 'conversao', 'origem', 'unidade', 'codigo'), fk('b', 'conversao', 'destino', 'unidade', 'codigo')], []);
    expect(r.criadas).toBe(2);
    expect(r.doc.ligacoes).toHaveLength(2);
    expect(propsTabela(r.doc.formas.find((x) => x.id === f.id)!).constraints.filter((c) => c.tipo === 'FK')).toHaveLength(2);
  });

  it('FK composta vira uma linha e uma constraint com as duas colunas', () => {
    let d = diagramaVazio('logico', 't');
    d = adicionarForma(d, tab('pai', [col('a', true), col('b', true)]));
    const f = tab('filho', [col('id', true), col('pa'), col('pb')], 200, 200);
    const r = ligarFksDaTabelaSolta(adicionarForma(d, f), f.id, [fk('fk1', 'filho', 'pa', 'pai', 'a'), fk('fk1', 'filho', 'pb', 'pai', 'b')], []);
    expect(r.doc.ligacoes).toHaveLength(1);
    const fks = propsTabela(r.doc.formas.find((x) => x.id === f.id)!).constraints.filter((c) => c.tipo === 'FK');
    expect(fks).toHaveLength(1);
    expect(fks[0].camposDestino).toHaveLength(2);
  });

  it('FK exportada: a tabela solta é a referenciada', () => {
    let d = diagramaVazio('logico', 't');
    d = adicionarForma(d, tab('filho', [col('id', true), col('pai_id')]));
    const p = tab('pai', [col('id', true)], 200, 0);
    const r = ligarFksDaTabelaSolta(adicionarForma(d, p), p.id, [], [fk('x', 'filho', 'pai_id', 'pai', 'id')]);
    expect(r.criadas).toBe(1);
    expect(r.doc.ligacoes[0].de).toBe(p.id);
  });

  it('coluna referenciada não-PK vira única; tabela ausente é informada', () => {
    let d = diagramaVazio('logico', 't');
    d = adicionarForma(d, tab('pai', [col('id', true), col('codigo')]));
    const f = tab('filho', [col('id', true), col('pai_codigo'), col('outro_id')], 200, 200);
    const r = ligarFksDaTabelaSolta(adicionarForma(d, f), f.id, [fk('a', 'filho', 'pai_codigo', 'pai', 'codigo'), fk('b', 'filho', 'outro_id', 'ausente', 'id')], []);
    expect(r.criadas).toBe(1);
    expect(r.ausentes).toEqual(['ausente']);
    expect(propsTabela(r.doc.formas.find((x) => x.nome === undefined && x.texto === 'pai')!).campos.find((c) => c.nome === 'codigo')!.unique).toBe(true);
  });
});
