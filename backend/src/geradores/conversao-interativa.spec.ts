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
import { conversaoInterativa, lerRespostas, PerguntaPendente, RespostaInvalidaErro, Resposta } from './conversao-interativa';
import { normalizar } from './conversor.spec';

const DIR = join(__dirname, '..', '..', 'test', 'fixtures-conceitual');
const arquivos = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')).sort() : [];

interface PerguntaReferencia {
  padrao: number; desabilitadas: number[]; textos: string[]; opcoes: string[]; observacoes: string[]; resposta: number; pulada: boolean;
}

/** Simula o cliente: responde cada pergunta pendente com o roteiro (-1 = "OK para todos"; sem entrada = padrão). */
function conduzir(d: any, roteiro: number[]) {
  const respostas: Resposta[] = [];
  const vistas: PerguntaPendente[] = [];
  for (let guarda = 0; guarda < 200; guarda++) {
    const r = conversaoInterativa(d, respostas);
    if ('concluido' in r) return { resultado: r.concluido, vistas };
    vistas.push(r.pendente);
    const k = respostas.length;
    const v = k < roteiro.length ? roteiro[k] : r.pendente.padrao;
    respostas.push(v < 0 ? { todos: true } : { opcao: v });
  }
  throw new Error('conversão interativa não terminou');
}

describe('conversão interativa (respostas do diálogo, comparada à referência)', () => {
  const comVariantes = arquivos.filter((a) => JSON.parse(readFileSync(join(DIR, a), 'utf8')).conceitualParaLogico?.variantes?.length);
  it('o corpus tem variantes com respostas não padrão', () => {
    expect(comVariantes.length).toBeGreaterThanOrEqual(6);
  });

  it.each(comVariantes)('%s: perguntas, textos e modelo iguais aos da referência', (arq) => {
    const fx = JSON.parse(readFileSync(join(DIR, arq), 'utf8'));
    for (const v of fx.conceitualParaLogico.variantes as any[]) {
      const { resultado, vistas } = conduzir(fx.conceitual, v.respostas);
      const orac = (v.perguntas as PerguntaReferencia[]).filter((p) => !p.pulada);
      expect(vistas.map((p) => ({ padrao: p.padrao, desabilitadas: p.desabilitadas, textos: p.textos, opcoes: p.opcoes, observacoes: p.observacoes }))).toEqual(
        orac.map((p) => ({ padrao: p.padrao, desabilitadas: p.desabilitadas, textos: p.textos, opcoes: p.opcoes, observacoes: p.observacoes })),
      );
      expect(normalizar(resultado.diagrama)).toEqual(normalizar(v.modelo));
      expect(resultado.avisos).toEqual(v.avisos);
      expect(resultado.erros).toEqual(v.erros);
    }
  });
});

describe('conversaoInterativa', () => {
  const fx = () => JSON.parse(readFileSync(join(DIR, 'conc_especializacao.json'), 'utf8')).conceitual;

  it('sem respostas devolve a primeira pergunta (caracteres) com índice 0', () => {
    const r = conversaoInterativa(fx(), []);
    expect('pendente' in r && r.pendente.indice).toBe(0);
    expect('pendente' in r && r.pendente.tipo).toBe('caracteres');
  });

  it('"OK para todos" conclui sem mais perguntas e equivale às respostas padrão', () => {
    const r = conversaoInterativa(fx(), [{ todos: true }]);
    expect('concluido' in r).toBe(true);
  });

  it('rejeita opção inexistente e opção desabilitada', () => {
    expect(() => conversaoInterativa(fx(), [{ opcao: 9 }])).toThrow(RespostaInvalidaErro);
    const atr = JSON.parse(readFileSync(join(DIR, 'conc_atributos_especiais.json'), 'utf8')).conceitual;
    expect(() => conversaoInterativa(atr, [{ opcao: 0 }, { opcao: 1 }])).toThrow(/desabilitada/);
  });

  it('lerRespostas valida o formato', () => {
    expect(lerRespostas(undefined)).toEqual([]);
    expect(lerRespostas([{ opcao: 1 }, { todos: true }])).toEqual([{ opcao: 1 }, { todos: true }]);
    expect(() => lerRespostas('x')).toThrow(RespostaInvalidaErro);
    expect(() => lerRespostas([{ opcao: -1 }])).toThrow(RespostaInvalidaErro);
    expect(() => lerRespostas([{}])).toThrow(RespostaInvalidaErro);
  });
});
