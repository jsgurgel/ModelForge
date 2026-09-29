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

import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { gerarDdl } from '../geradores/ddl';
import { DiagramasService } from './diagramas.service';

@Controller('diagramas')
export class DiagramasController {
  constructor(
    private readonly diagramas: DiagramasService,
  ) {}

  @Get()
  listar() {
    return this.diagramas.listar();
  }

  @Get(':id')
  obter(@Param('id') id: string) {
    return this.diagramas.obter(id);
  }

  @Post()
  criar(@Body() corpo: unknown) {
    return this.diagramas.salvar(corpo);
  }

  @Put(':id')
  atualizar(@Param('id') id: string, @Body() corpo: unknown) {
    return this.diagramas.salvar(corpo, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remover(@Param('id') id: string) {
    await this.diagramas.remover(id);
  }

  @Get(':id/ddl')
  async gerarDdl(@Param('id') id: string) {
    return { ddl: gerarDdl(await this.diagramas.obter(id)) };
  }
}
