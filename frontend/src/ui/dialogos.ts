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

import type { Linguagem } from '../editor/realce';
import { useSyncExternalStore } from 'react';

export type Dialogo =
  | { tipo: 'atributos'; id?: string }
  | { tipo: 'campos'; id: string; aba?: 'campos' | 'constraints' | 'indices' | 'gatilhos' }
  | { tipo: 'dsl'; id: string }
  | { tipo: 'texto'; titulo: string; texto: string; nomeArquivo?: string; linguagem?: Linguagem }
  | { tipo: 'entrada'; titulo: string; rotulo: string; valor: string; aoConfirmar: (v: string) => void }
  | { tipo: 'confirmar'; titulo: string; mensagem: string; aoConfirmar: () => void; /** Chamado em Não/Esc/✕ (permite esperar a resposta como Promise). */ aoRecusar?: () => void }
  | { tipo: 'aviso'; titulo: string; mensagem: string }
  | { tipo: 'escolha'; titulo: string; rotulo: string; opcoes: string[]; aoEscolher: (v: string) => void }
  | { tipo: 'html'; titulo: string; html: string; nomeArquivo: string }
  | { tipo: 'dicionario' }
  | { tipo: 'importarTexto'; titulo: string; dica: string; linguagem?: Linguagem; aoConfirmar: (texto: string) => void }
  | { tipo: 'servidor' }
  | { tipo: 'busca' }
  | { tipo: 'sobre' }
  //# Diálogos do stream D (legenda, desenhador, tipos, IR, construtor de EAP, exportar imagem, prévia de impressão).
  | { tipo: 'd'; nome: 'legenda' | 'desenhador' | 'drawer' | 'tipos' | 'ir' | 'eap' | 'imagem' | 'previa'; id?: string; modo?: 'PK' | 'UNIQUE' | 'FK' | 'CHECK'; indice?: number; /** Editor de tipos: resolve com true (Continuar) ou false (fechou). */ aoResolver?: (ok: boolean) => void }
  //# Diálogos do stream G2 (fechar com lista de alterados, log de mensagens, editor de SQL do código, aviso de versão).
  | { tipo: 'g2'; nome: 'fechar'; indices: number[]; depois: () => void }
  | { tipo: 'g2'; nome: 'logs' }
  | { tipo: 'g2'; nome: 'versao'; itens: { nome: string; versao: string }[]; aoConfirmar: () => void; aoRecusar?: () => void }
  | { tipo: 'ajuda'; topico?: number; busca?: string }
  | { tipo: 'bancoImportar' }
  | { tipo: 'bancoNosql' }
  | { tipo: 'bancoMigracao' }
  //# Diálogos do stream H (perguntas da conversão, login por token, console de scripts do EAP).
  | { tipo: 'h'; nome: 'perguntaConversao' | 'login' | 'consoleEap'; dados?: unknown }
  | { tipo: 'bancoExecutar'; sql?: string }
  | { tipo: 'sqlStudio'; sql?: string }
  | { tipo: 'dataGrid'; schema: string; tabela: string; titulo?: string };

let atual: Dialogo | null = null;
const ouvintes = new Set<() => void>();

export function abrirDialogo(d: Dialogo) {
  atual = d;
  ouvintes.forEach((o) => o());
}

export function fecharDialogo() {
  atual = null;
  ouvintes.forEach((o) => o());
}

export function useDialogo(): Dialogo | null {
  return useSyncExternalStore((cb) => {
    ouvintes.add(cb);
    return () => ouvintes.delete(cb);
  }, () => atual);
}

export const aviso = (titulo: string, mensagem: string) => abrirDialogo({ tipo: 'aviso', titulo, mensagem });
