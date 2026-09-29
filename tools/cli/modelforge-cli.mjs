#!/usr/bin/env node
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

// ModelForge - modo linha de comando (--validar/--ddl/--doc).
// Funciona offline, com o backend compilado:  (cd backend && npm run build)  e depois
//   node tools/cli/modelforge-cli.mjs --validar modelo.mfd.json
// Códigos de saída: 0 sucesso, 1 erro de uso/leitura, 2 problemas de validação.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const alvo = join(aqui, '..', '..', 'backend', 'dist', 'cli', 'linha-de-comando.js');
if (!existsSync(alvo)) {
  console.error('Erro: backend não compilado. Rode: (cd backend && npm install && npm run build)');
  process.exit(1);
}
const { executar, pedeModoTexto, AJUDA } = createRequire(import.meta.url)(alvo);
const args = process.argv.slice(2);
if (!pedeModoTexto(args)) {
  process.stdout.write(AJUDA);
  process.exit(args.length === 0 ? 0 : 1);
}
process.exit(executar(args));
