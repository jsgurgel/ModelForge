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

import { pontosTriangulo } from '../shapes/caminhos';
import { Diagrama, Forma } from './types';

/**
 * Os três vértices da Especialização/União: `ocupados[0..2]`. A ligação principal
 * (a entidade geral/resultante) fica no vértice 0 (o ápice); as demais tomam o vértice livre mais próximo do outro extremo
 * e, com os três ocupados, caem no ponto médio da base (`pMeio`).
 */

interface Pt { x: number; y: number }

export const ehEspUniao = (k: string): boolean => k.startsWith('especializacao') || k.startsWith('uniao');

/** Ponto médio do lado oposto ao ápice, por direção. */
function meioDaBase(f: Forma, dir: string): Pt {
  switch (dir) {
    case 'Right': return { x: f.x, y: f.y + f.h / 2 };
    case 'Down': return { x: f.x + f.w / 2, y: f.y };
    case 'Left': return { x: f.x + f.w, y: f.y + f.h / 2 };
    default: return { x: f.x + f.w / 2, y: f.y + f.h };
  }
}

export function verticesDaEspecializacao(f: Forma): { vertices: Pt[]; meio: Pt } {
  const dir = String(f.props.direcao ?? 'Up');
  const vertices = pontosTriangulo(f.w, f.h, dir).map((p) => ({ x: f.x + p.x, y: f.y + p.y }));
  return { vertices, meio: meioDaBase(f, dir) };
}

/** Ponto de cada ligação da especialização/união (id da ligação -> ponto na forma). */
export function slotsDaEspecializacao(doc: Diagrama, esp: Forma): Map<string, Pt> {
  const { vertices, meio } = verticesDaEspecializacao(esp);
  const ocupado = [false, false, false];
  const res = new Map<string, Pt>();
  const minhas = doc.ligacoes.filter((l) => l.kind === 'linha' && (l.de === esp.id || l.para === esp.id));
  for (const l of minhas) {
    if (l.props.principal && !ocupado[0]) {
      ocupado[0] = true;
      res.set(l.id, vertices[0]);
    }
  }
  for (const l of minhas) {
    if (res.has(l.id)) continue;
    const outra = doc.formas.find((f) => f.id === (l.de === esp.id ? l.para : l.de));
    const alvo = outra ? { x: outra.x + outra.w / 2, y: outra.y + outra.h / 2 } : { x: esp.x, y: esp.y };
    let melhor = -1;
    let menor = Infinity;
    for (let i = 0; i < 3; i++) {
      if (ocupado[i]) continue;
      const d = Math.hypot(alvo.x - vertices[i].x, alvo.y - vertices[i].y);
      if (d < menor) { menor = d; melhor = i; }
    }
    if (melhor < 0) res.set(l.id, meio);
    else {
      ocupado[melhor] = true;
      res.set(l.id, vertices[melhor]);
    }
  }
  return res;
}
