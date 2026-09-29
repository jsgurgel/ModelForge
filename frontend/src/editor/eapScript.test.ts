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

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { ConsoleEap, Sintaxe, ehInteiro32, isComandoGet, splitSemVaziosFinais, scriptDoConstrutor } from './eapScript';
import { Diagrama, diagramaVazio } from './types';

const DIR = join(__dirname, '..', '..', 'test', 'fixtures-cli');
const arquivos = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')).sort() : [];

function novoConsole() {
  let doc: Diagrama = diagramaVazio('eap', 'EAP');
  let fechou = false;
  const con = new ConsoleEap({ obterDoc: () => doc, aplicarDoc: (d) => { doc = d; }, fechar: () => { fechou = true; } });
  return { con, doc: () => doc, fechou: () => fechou };
}

function resumo(d: Diagrama) {
  return {
    processos: d.formas.filter((f) => f.kind === 'eapProcesso').map((f) => f.texto).sort(),
    barras: d.formas.filter((f) => f.kind === 'eapBarraLigacao').length,
    ligacoes: d.ligacoes.length,
  };
}

/** Ordena as cadeias por unidade UTF-16 (o sort padrão do JS). */
describe('console EAP (fixtures de referência em frontend/test/fixtures-cli)', () => {
  it('há fixtures', () => expect(arquivos.length).toBeGreaterThanOrEqual(8));

  for (const arq of arquivos) {
    const fx = JSON.parse(readFileSync(join(DIR, arq), 'utf8'));
    for (const modo of ['digitado', 'colado'] as const) {
      it(`${arq} (${modo}): transcrito, histórico e diagrama`, () => {
        const { con, doc } = novoConsole();
        const esperado = fx[modo];
        if (modo === 'colado') con.colar(fx.script);
        else for (const l of fx.script.split('\n')) { con.entrar(l); if (con.saiu) break; }
        expect(con.transcrito).toBe(esperado.transcrito);
        expect(con.saiu).toBe(esperado.saiu);
        expect(con.prompt).toBe(esperado.prompt);
        if (!esperado.saiu) expect(con.historico).toEqual(esperado.historico);
        expect(resumo(doc())).toEqual(esperado.diagrama);
      });
    }
  }
});

describe('interpretador do console EAP', () => {
  it('NOVO EAP vertical cria processos, uma barra e as ligações', () => {
    const { con, doc } = novoConsole();
    con.colar('NOVO EAP VERTICAL {\nRaiz\nA\nB\n}');
    expect(resumo(doc())).toEqual({ processos: ['A', 'B', 'Raiz'], barras: 1, ligacoes: 3 });
  });

  it('SET AMBIENT altera onde e com que tamanho o processo nasce', () => {
    const { con, doc } = novoConsole();
    con.entrar('SET AMBIENT SCREEN.X (33)');
    con.entrar('SET AMBIENT OBJECT.W (90)');
    con.entrar('NOVO PROCESSO (5,6) {Um}');
    const p = doc().formas[0];
    expect([p.x, p.y, p.w, p.h, p.texto]).toEqual([5, 6, 90, 58, 'Um']);
    expect(con.ambiente['amb.scr.x']).toBe('33');
  });

  it('GET(n) reaproveita o processo existente; inexistente vira "Não encontrado!"', () => {
    const { con, doc } = novoConsole();
    con.entrar('NOVO PROCESSO (1,1) {A}');
    con.entrar('NOVO PROCESSO (2,2) {GET(2)}');
    expect(doc().formas).toHaveLength(1);
    con.entrar('NOVO PROCESSO (2,2) {GET(9)}');
    expect(doc().formas.map((f) => f.texto)).toEqual(['A', 'Não encontrado!']);
  });

  it('bloco aberto continua na linha seguinte com o prompt ".>"', () => {
    const { con } = novoConsole();
    con.entrar('NOVO EAP VERTICAL {');
    expect(con.prompt).toBe('.>');
    expect(con.emEntradaTexto).toBe(true);
    con.cancelar();
    expect(con.prompt).toBe('# ');
    expect(con.transcrito.endsWith('^D\n')).toBe(true);
  });

  it('SAIR fecha o console; CLEAR limpa o transcrito', () => {
    const { con, fechou } = novoConsole();
    con.entrar('LISTAR');
    con.entrar('CLEAR');
    expect(con.transcrito).toBe('# ');
    con.entrar('sair');
    expect(con.saiu).toBe(true);
    expect(fechou()).toBe(true);
  });

  it('Tab completa comandos e Up/Down navegam no histórico', () => {
    const { con } = novoConsole();
    con.digitando = 'no e ve';
    expect(con.autoCompletar()).toBe('NOVO EAP VERTICAL ');
    con.entrar('LISTAR');
    con.entrar('CLS');
    expect(con.navegarHistorico(+1)).toBe('CLS');
    expect(con.navegarHistorico(+1)).toBe('LISTAR');
  });

  it('script do Construtor', () => {
    const { con } = novoConsole();
    const s = scriptDoConstrutor(con, { principal: 'P', processos: 'A\nB', organizacao: 'horizontal-direita', x: '10', y: 'zz' });
    expect(s).toBe('NOVO EAP HORIZONTAL DIREITA {\nP\nA\nB\n}');
    expect(con.ambiente['amb.scr.x']).toBe('10');
    expect(con.ambiente['amb.scr.y']).toBe('200');
  });

  it('utilidades de texto e número', () => {
    expect(splitSemVaziosFinais('a,b,,', ',')).toEqual(['a', 'b']);
    expect(splitSemVaziosFinais(' ', ' ')).toEqual([]);
    expect(ehInteiro32('+5')).toBe(true);
    expect(ehInteiro32('2147483648')).toBe(false);
    expect(ehInteiro32('')).toBe(false);
    expect(isComandoGet('GET((5)')).toBe(true);
    expect(isComandoGet('GET(12)')).toBe(false);
    expect(new Sintaxe('novo').getSintaxeCMD()).toBe('NOVO');
  });
});
