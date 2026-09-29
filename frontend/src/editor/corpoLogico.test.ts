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
import { corpoDoObjetoLogico } from './corpoLogico';
import { alternarVariante, nomeieCampo, temCampoSemTipo } from './logico';
import { Doc, adicionarCampoVariante, adicionarForma, novaForma } from './ops';
import { propsTabela } from './logico';
import { campoVazio, diagramaVazio, Forma } from './types';

const forma = (kind: string, props: Record<string, unknown>): Forma => ({ id: 'x', kind, x: 0, y: 0, w: 100, h: 100, texto: 'X', props });

describe('corpo dos objetos lógicos', () => {
  it('view', () => {
    expect(corpoDoObjetoLogico(forma('visao', { corpo: 'select 1' }))).toEqual({ rotulo: '(view)', linhas: [], corpo: 'select 1' });
    expect(corpoDoObjetoLogico(forma('visaoMaterializada', {}))!.rotulo).toBe('(view materializada)');
  });
  it('sequence só mostra o preenchido', () => {
    expect(corpoDoObjetoLogico(forma('sequencia', { inicio: '1', maximo: '99', ciclo: true }))!.linhas).toEqual(['início: 1', 'máximo: 99', 'cíclica']);
    expect(corpoDoObjetoLogico(forma('sequencia', { inicio: ' ' }))!.linhas).toEqual([]);
  });
  it('rotina: retorno só na function; parâmetros entre parênteses', () => {
    expect(corpoDoObjetoLogico(forma('funcao', { retorno: 'integer', parametros: 'a int' }))).toMatchObject({ rotulo: '(function) → integer', linhas: ['(a int)'] });
    expect(corpoDoObjetoLogico(forma('procedure', { retorno: 'integer' }))!.rotulo).toBe('(procedure)');
  });
  it('enum e domain', () => {
    expect(corpoDoObjetoLogico(forma('enum', { rotulos: 'a\n\n b \r\nc' }))).toMatchObject({ rotulo: '(enum)', linhas: ['a', 'b', 'c'] });
    expect(corpoDoObjetoLogico(forma('dominio', { tipoBase: 'INT', padrao: '0', naoNulo: true, restricao: 'VALUE>0' }))!.linhas).toEqual(['INT', 'default 0', 'not null', 'check VALUE>0']);
  });
});

describe('defaults do Lógico', () => {
  it('nomes e tamanhos', () => {
    let d: Doc = diagramaVazio('logico', 'L');
    const v = novaForma(d, 'visao', 200, 200);
    d = adicionarForma(d, v);
    const s = novaForma(d, 'sequencia', 400, 200);
    expect(v.texto).toBe('Visao_1');
    expect([v.w, v.h]).toEqual([180, 120]);
    expect(s.texto).toBe('Sequencia_1');
    expect([s.w, s.h]).toEqual([170, 110]);
    const vm = novaForma(d, 'visaoMaterializada', 200, 500);
    expect(vm.texto).toBe('Visao_2');
    expect(vm.corBorda).toBe('#7b1fa2');
    expect(novaForma(d, 'funcao', 0, 0).texto).toBe('Funcao_1');
    expect(novaForma(d, 'tabela', 0, 0).w).toBe(150);
  });
  it('nomeieCampo: Campo, Campo_1, Campo_2', () => {
    expect(nomeieCampo([], 'Campo')).toBe('Campo');
    expect(nomeieCampo([{ nome: 'Campo' }], 'Campo')).toBe('Campo_1');
    expect(nomeieCampo([{ nome: 'Campo' }, { nome: 'Campo_1' }], 'Campo')).toBe('Campo_2');
  });
  it('variantes de campo usam NomeieCampo', () => {
    let d: Doc = diagramaVazio('logico', 'L');
    const t = novaForma(d, 'tabela', 200, 200);
    d = adicionarForma(d, t);
    for (const v of ['campo', 'key', 'fkey'] as const) d = adicionarCampoVariante(d, t.id, v);
    expect(propsTabela(d.formas[0]).campos.map((c) => c.nome)).toEqual(['Campo', 'Campo_1', 'Campo_2']);
  });
  it('alternar view: borda roxa na materializada e volta ao padrão', () => {
    const v = forma('visao', {});
    const m = alternarVariante(v);
    expect(m).toMatchObject({ kind: 'visaoMaterializada', corBorda: '#7b1fa2' });
    expect(alternarVariante(m).corBorda).toBeUndefined();
  });
  it('temCampoSemTipo', () => {
    const t = forma('tabela', { campos: [campoVazio('a', 'INT'), campoVazio('b', '')], constraints: [] });
    expect(temCampoSemTipo([t])).toBe(true);
    expect(temCampoSemTipo([{ ...t, props: { campos: [campoVazio('a', 'INT')], constraints: [] } }])).toBe(false);
  });
});
