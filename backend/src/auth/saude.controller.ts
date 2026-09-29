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

import { Controller, Get } from '@nestjs/common';
import { Publico, tokenConfigurado } from './auth.guard';

/** Health check (público) e indicação de que a API exige token - o front usa para pedir o token antes de qualquer chamada. */
@Controller('saude')
export class SaudeController {
  @Publico()
  @Get()
  saude() {
    return { ok: true, autenticacao: tokenConfigurado() !== '' };
  }
}
