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

import { BadRequestException } from '@nestjs/common';
import { Conexao, ParamsConexao } from '../tipos';

/** Abre a conexão do driver certo; os drivers só são carregados quando usados (SQLite exige Node 22.5+). */
export async function abrirConexao(p: ParamsConexao): Promise<Conexao> {
  switch (p.tipo) {
    case 'postgresql': return (await import('./postgres')).ConexaoPostgres.abrir(p);
    case 'mysql': return (await import('./mysql')).ConexaoMysql.abrir(p);
    case 'sqlserver': return (await import('./sqlserver')).ConexaoSqlServer.abrir(p);
    case 'sqlite': return (await import('./sqlite')).ConexaoSqlite.abrir(p);
    default: throw new BadRequestException('tipo de banco inválido');
  }
}
