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

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { SaudeController } from './auth/saude.controller';
import { BancosModule } from './bancos/bancos.module';
import { DiagramasController } from './diagramas/diagramas.controller';
import { DiagramasService } from './diagramas/diagramas.service';
import { GeradoresController } from './geradores/geradores.controller';

@Module({
  imports: [BancosModule],
  controllers: [DiagramasController, GeradoresController, SaudeController],
  providers: [DiagramasService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
