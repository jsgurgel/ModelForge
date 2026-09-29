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

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { Diagrama } from '../modelo/tipos';
import { validarDiagrama } from '../modelo/validacao';

/**
 * Persistência em arquivo JSON - suficiente pra prova de conceito, single-user.
 * Trocar por banco (Postgres/Prisma) quando entrar multiusuário/autenticação.
 */
@Injectable()
export class DiagramasService {
  private readonly arquivo = process.env.DIAGRAMAS_FILE ?? join(process.cwd(), 'data', 'diagramas.json');
  private fila: Promise<unknown> = Promise.resolve();

  async listar(): Promise<{ id: string; nome: string; tipo: string }[]> {
    return (await this.ler()).map(({ id, nome, tipo }) => ({ id: id as string, nome, tipo }));
  }

  async obter(id: string): Promise<Diagrama> {
    const d = (await this.ler()).find((x) => x.id === id);
    if (!d) throw new NotFoundException('diagrama não encontrado');
    return d;
  }

  async salvar(corpo: unknown, id?: string): Promise<Diagrama> {
    const erros = validarDiagrama(corpo);
    if (erros.length) throw new BadRequestException(erros);
    const dados = corpo as Diagrama;
    //# O id vem da URL (ou é gerado): nunca confia no id do corpo.
    const novo: Diagrama = { ...dados, id: id ?? randomUUID() };
    return this.serializar(async () => {
      const todos = await this.ler();
      const i = todos.findIndex((x) => x.id === novo.id);
      if (i < 0 && id) throw new NotFoundException('diagrama não encontrado');
      if (i < 0) todos.push(novo);
      else todos[i] = novo;
      await this.gravar(todos);
      return novo;
    });
  }

  async remover(id: string): Promise<void> {
    await this.serializar(async () => {
      const todos = await this.ler();
      const resto = todos.filter((x) => x.id !== id);
      if (resto.length === todos.length) throw new NotFoundException('diagrama não encontrado');
      await this.gravar(resto);
    });
  }

  /** Escritas em fila: duas requisições simultâneas não se sobrescrevem. */
  private serializar<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.fila.then(fn, fn);
    this.fila = p.catch(() => undefined);
    return p;
  }

  private async ler(): Promise<Diagrama[]> {
    try {
      return JSON.parse(await fs.readFile(this.arquivo, 'utf8')) as Diagrama[];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  private async gravar(todos: Diagrama[]): Promise<void> {
    await fs.mkdir(dirname(this.arquivo), { recursive: true });
    await fs.writeFile(this.arquivo, JSON.stringify(todos, null, 2), 'utf8');
  }
}
