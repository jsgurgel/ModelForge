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

import { abrirDialogo, aviso } from '../ui/dialogos';
import { registrar } from './comandos';
import { abaAtiva } from './store';
import { verificarAcesso } from '../dialogs/Login';

/** Comandos do stream H: console de scripts do EAP (Diagrama > CLI). */
registrar({
  id: 'eap.console',
  rotulo: 'Console de scripts do EAP (CLI)...',
  precisaAba: true,
  icone: 'eap.png',
  executar: () => {
    if (abaAtiva()?.doc.tipo !== 'eap') {
      aviso('CLI', 'O console de scripts só existe para o diagrama EAP.');
      return;
    }
    abrirDialogo({ tipo: 'h', nome: 'consoleEap' });
  },
});

//# Se o servidor exigir token de acesso, pede já na abertura (uma vez por sessão do navegador).
void verificarAcesso().catch(() => undefined);
