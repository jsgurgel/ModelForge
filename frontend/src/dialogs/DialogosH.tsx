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

import type { Dialogo } from '../ui/dialogos';
import type { PerguntaConversao } from '../api';
import type { RespostaDialogo } from '../editor/conversaoInterativa';
import { ConsoleEapDialogo } from './ConsoleEap';
import { LoginDialogo } from './Login';
import { PerguntaConversaoDialogo } from './PerguntasConversao';

/** Despacho dos diálogos do stream H (mesmo padrão de DialogosD). */
export function DialogosH({ d }: { d: Extract<Dialogo, { tipo: 'h' }> }) {
  switch (d.nome) {
    case 'perguntaConversao': {
      const x = d.dados as { pergunta: PerguntaConversao; resolver: (r: RespostaDialogo) => void };
      return <PerguntaConversaoDialogo key={x.pergunta.indice} pergunta={x.pergunta} resolver={x.resolver} />;
    }
    case 'login':
      return <LoginDialogo resolver={(d.dados as { resolver: (ok: boolean) => void }).resolver} />;
    case 'consoleEap':
      return <ConsoleEapDialogo />;
  }
}
