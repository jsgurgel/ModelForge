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

import type { PerguntaConversao, RespostaConversao, ResultadoConversaoInterativa } from '../api';

/** O que o usuário fez no diálogo de uma pergunta (botões "OK", "OK para todos" e "Cancelar"). */
export type RespostaDialogo = { acao: 'ok'; opcao: number } | { acao: 'todos' } | { acao: 'cancelar' };

export type Concluido = Extract<ResultadoConversaoInterativa, { concluido: unknown }>['concluido'];

/**
 * Protocolo em duas fases: chama o servidor com as respostas acumuladas; a cada `pendente` mostra o diálogo e repete até
 * chegar o resultado. Devolve `null` se o usuário cancelar.
 */
export async function conduzirConversao(
  chamar: (respostas: RespostaConversao[]) => Promise<ResultadoConversaoInterativa>,
  perguntar: (p: PerguntaConversao) => Promise<RespostaDialogo>,
  limite = 500,
): Promise<Concluido | null> {
  const respostas: RespostaConversao[] = [];
  for (let i = 0; i < limite; i++) {
    const r = await chamar(respostas);
    if ('concluido' in r) return r.concluido;
    const p = r.pendente;
    //# O servidor pergunta sempre a próxima da fila; um índice diferente do esperado indica dessincronia.
    if (p.indice !== respostas.length) throw new Error('A conversão perdeu a sincronia com o servidor; tente novamente.');
    const d = await perguntar(p);
    if (d.acao === 'cancelar') return null;
    respostas.push(d.acao === 'todos' ? { todos: true } : { opcao: d.opcao });
  }
  throw new Error('Perguntas demais na conversão.');
}
