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

/**
 * Conversão Conceitual -> Lógico com perguntas ao usuário, em duas fases sobre HTTP
 * sem estado no servidor:
 *
 *  1. o cliente envia o diagrama e as respostas dadas até agora (na ordem em que as perguntas são feitas);
 *  2. o servidor roda a conversão (determinística) com essas respostas; ao chegar numa pergunta ainda sem resposta, aborta e
 *     devolve `{ pendente }` com o conteúdo do diálogo; sem mais perguntas, devolve `{ concluido }`.
 *
 * O cliente mostra o diálogo, acrescenta a resposta e chama de novo. Cada resposta é `{ opcao }` (botão "OK") ou
 * `{ todos: true }` ("OK para todos": esta e todas as próximas perguntas assumem a resposta padrão, e o servidor deixa de
 * perguntar). "Cancelar" é decisão do cliente: basta não chamar de novo.
 */
import type { Diagrama } from '../modelo/tipos';
import { conceitualParaLogico, Pergunta, ResultadoConversao } from './conversor';

export type Resposta = { opcao: number } | { todos: true };

export interface PerguntaPendente extends Pergunta {
  /** Posição da pergunta na sequência (0 = a primeira); é também `respostas.length` da chamada que a gerou. */
  indice: number;
}

export type ResultadoInterativo = { pendente: PerguntaPendente } | { concluido: ResultadoConversao };

class PerguntaPendenteErro extends Error {
  constructor(readonly pergunta: PerguntaPendente) {
    super('pergunta pendente');
  }
}

export class RespostaInvalidaErro extends Error {}

/** Valida o formato das respostas vindas do cliente (JSON). */
export function lerRespostas(bruto: unknown): Resposta[] {
  if (bruto === undefined || bruto === null) return [];
  if (!Array.isArray(bruto)) throw new RespostaInvalidaErro('respostas deve ser uma lista');
  return bruto.map((r, i) => {
    if (r && typeof r === 'object' && (r as { todos?: unknown }).todos === true) return { todos: true } as Resposta;
    const o = (r as { opcao?: unknown } | null)?.opcao;
    if (typeof o !== 'number' || !Number.isInteger(o) || o < 0) throw new RespostaInvalidaErro(`resposta ${i + 1} inválida: informe { "opcao": n } ou { "todos": true }`);
    return { opcao: o };
  });
}

export function conversaoInterativa(d: Diagrama, respostas: Resposta[]): ResultadoInterativo {
  let i = 0;
  let todos = false;
  try {
    const concluido = conceitualParaLogico(d, {
      escolher: (p) => {
        if (todos) return p.padrao;
        if (i >= respostas.length) throw new PerguntaPendenteErro({ ...p, indice: i });
        const r = respostas[i++];
        if ('todos' in r) {
          todos = true;
          return p.padrao;
        }
        if (r.opcao >= p.opcoes.length) throw new RespostaInvalidaErro(`resposta ${i}: a opção ${r.opcao} não existe (a pergunta tem ${p.opcoes.length})`);
        if (p.desabilitadas.includes(r.opcao)) throw new RespostaInvalidaErro(`resposta ${i}: a opção ${r.opcao} está desabilitada nesta pergunta`);
        return r.opcao;
      },
    });
    return { concluido };
  } catch (e) {
    if (e instanceof PerguntaPendenteErro) return { pendente: e.pergunta };
    throw e;
  }
}
