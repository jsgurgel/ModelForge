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

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { importarDdlConceitual } from './importador-conceitual';
import type { Diagrama } from '../modelo/tipos';

/** Ids renomeados pela ordem de aparição. */
function normalizar(d: Diagrama): unknown {
  const mapa = new Map<string, string>();
  let n = 0;
  for (const f of d.formas) mapa.set(f.id, 'F' + n++);
  for (const l of d.ligacoes) mapa.set(l.id, 'L' + n++);
  return {
    ...d,
    formas: d.formas.map((f) => ({ ...f, id: mapa.get(f.id) })),
    ligacoes: d.ligacoes.map((l) => ({ ...l, id: mapa.get(l.id), de: mapa.get(l.de), para: mapa.get(l.para) })),
  };
}

const DIR = join(__dirname, '..', '..', 'test', 'fixtures-conceitual');
const CORPUS = join(__dirname, '..', '..', 'test', 'corpus');
const arquivos = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')).sort() : [];

describe('importarDdlConceitual (fixtures de referência)', () => {
  it.each(arquivos)('%s', (arq) => {
    const fx = JSON.parse(readFileSync(join(DIR, arq), 'utf8'));
    const script = readFileSync(join(CORPUS, fx.entrada + '.sql'), 'utf8');
    const res = importarDdlConceitual(script, fx.entrada);
    expect(normalizar(res.diagrama)).toEqual(normalizar(fx.importacao.modelo));
    expect(res.avisos).toEqual(fx.importacao.avisos);
    expect(res.erros).toEqual(fx.importacao.erros);
  });
});
