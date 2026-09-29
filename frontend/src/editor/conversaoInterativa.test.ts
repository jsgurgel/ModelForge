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
import { conduzirConversao } from './conversaoInterativa';
import type { PerguntaConversao, RespostaConversao, ResultadoConversaoInterativa } from '../api';

const pergunta = (indice: number): PerguntaConversao => ({ indice, tipo: 'atributo', padrao: 1, desabilitadas: [], textos: ['t'], opcoes: ['a', 'b'], observacoes: [] });
const final = { concluido: { diagrama: { nome: 'x' } as never, avisos: [], erros: [] } } as ResultadoConversaoInterativa;

/** Servidor falso: pergunta até ter `n` respostas ou um "todos". */
const servidor = (n: number) => async (r: RespostaConversao[]): Promise<ResultadoConversaoInterativa> =>
  r.length >= n || r.some((x) => 'todos' in x) ? final : { pendente: pergunta(r.length) };

describe('conduzirConversao', () => {
  it('reenvia as respostas acumuladas até o resultado', async () => {
    const chamadas: RespostaConversao[][] = [];
    const r = await conduzirConversao(async (rs) => { chamadas.push([...rs]); return servidor(3)(rs); }, async (p) => ({ acao: 'ok', opcao: p.indice }));
    expect(r).toBe((final as { concluido: unknown }).concluido);
    expect(chamadas).toEqual([[], [{ opcao: 0 }], [{ opcao: 0 }, { opcao: 1 }], [{ opcao: 0 }, { opcao: 1 }, { opcao: 2 }]]);
  });

  it('"OK para todos" encerra as perguntas', async () => {
    let n = 0;
    const r = await conduzirConversao(servidor(9), async () => { n++; return { acao: 'todos' }; });
    expect(r).not.toBeNull();
    expect(n).toBe(1);
  });

  it('cancelar devolve null sem nova chamada', async () => {
    let chamadas = 0;
    const r = await conduzirConversao(async (rs) => { chamadas++; return servidor(3)(rs); }, async () => ({ acao: 'cancelar' }));
    expect(r).toBeNull();
    expect(chamadas).toBe(1);
  });

  it('índice fora de ordem é erro', async () => {
    await expect(conduzirConversao(async () => ({ pendente: pergunta(5) }), async () => ({ acao: 'ok', opcao: 0 }))).rejects.toThrow(/sincronia/);
  });
});
