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
import { definirCardinalidade, definirSetaAutomatica, normalizarCard, setasDaLogicoLinha, setasPelaCardinalidade } from './logicoLinha';
import { Ligacao } from './types';

const lig = (cardDe = '(0,1)', cardPara = '(0,n)', props = {}): Ligacao => ({ id: 'l', kind: 'logicoLinha', de: 'a', para: 'b', texto: '', cardDe, cardPara, props });

describe('cardinalidade da LogicoLinha', () => {
  it('normaliza formatos antigos e desconhecidos', () => {
    expect(normalizarCard('1', '(0,n)')).toBe('(1,1)');
    expect(normalizarCard('n', '(0,1)')).toBe('(0,n)');
    expect(normalizarCard('(1,n)', '(0,1)')).toBe('(1,n)');
    expect(normalizarCard('', '(0,1)')).toBe('(0,1)');
    expect(normalizarCard('xyz', '(0,n)')).toBe('(0,n)');
  });
  it('padrão A=(0,1) B=(0,n) aponta a seta para B', () => {
    expect(setasDaLogicoLinha(lig())).toEqual({ setaA: false, setaB: true });
    expect(setasDaLogicoLinha(lig('1', 'n'))).toEqual({ setaA: false, setaB: true });
  });
  it('ordinais: A maior => seta em A; iguais => as duas', () => {
    expect(setasPelaCardinalidade('(0,n)', '(1,1)')).toEqual({ setaA: true, setaB: false });
    expect(setasPelaCardinalidade('(1,n)', '(1,n)')).toEqual({ setaA: true, setaB: true });
  });
  it('cardinalidade: n de um lado tira o n do outro (0N->01, 1N->11)', () => {
    const l = definirCardinalidade(lig('(0,1)', '(0,n)'), 'A', '(0,n)');
    expect(l.cardDe).toBe('(0,n)');
    expect(l.cardPara).toBe('(0,1)');
    const m = definirCardinalidade(lig('(1,1)', '(1,n)'), 'A', '(1,n)');
    expect(m.cardPara).toBe('(1,1)');
    expect(m.props).toMatchObject({ setaA: true, setaB: false });
  });
  it('lado 1 não mexe no outro', () => {
    const l = definirCardinalidade(lig('(0,1)', '(0,n)'), 'A', '(1,1)');
    expect(l.cardPara).toBe('(0,n)');
  });
  it('seta manual não é sobrescrita pela cardinalidade', () => {
    const l = definirCardinalidade(lig('(0,1)', '(0,n)', { setaAutomatica: false, setaA: true, setaB: true }), 'B', '(1,1)');
    expect(l.props).toMatchObject({ setaA: true, setaB: true });
    expect(setasDaLogicoLinha(l)).toEqual({ setaA: true, setaB: true });
    const auto = definirSetaAutomatica(l, true);
    expect(auto.props.setaAutomatica).toBe(true);
    expect(auto.props).toMatchObject({ setaA: true, setaB: false });
  });
});
