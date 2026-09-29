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

import { useState } from 'react';
import { ancorasDe } from '../editor/ancoras';
import { useItemSel } from '../editor/itemSel';
import { Diagrama, Forma } from '../editor/types';

const LARG = 20;
const ESPACO = 8;

/** Botões laterais do objeto selecionado (Ancorador): à esquerda do objeto, ou à direita se não couber. */
export function Ancorador({ f, doc }: { f: Forma; doc: Diagrama }) {
  const [sobre, setSobre] = useState<string | null>(null);
  const item = useItemSel();
  const botoes = ancorasDe(f, doc, item);
  const altura = botoes.length * (LARG + 2);
  const x = f.x - LARG - ESPACO >= 0 ? f.x - LARG - ESPACO : f.x + f.w + ESPACO;
  const y = Math.max(0, Math.min(f.y, doc.altura - altura - ESPACO));
  return (
    <g className="ancorador" transform={`translate(${x} ${y})`} onPointerDown={(ev) => ev.stopPropagation()} onDoubleClick={(ev) => ev.stopPropagation()} onContextMenu={(ev) => ev.stopPropagation()}>
      {botoes.map((b, i) => (
        <g
          key={b.id} transform={`translate(0 ${i * (LARG + 2)})`} style={{ cursor: b.desabilitado ? 'default' : 'pointer' }}
          onPointerEnter={() => setSobre(b.id)} onPointerLeave={() => setSobre(null)}
          onClick={(ev) => { ev.stopPropagation(); if (!b.desabilitado) b.executar(); }}
        >
          <title>{b.dica}</title>
          <rect width={LARG - 1} height={LARG} fill="#fff" stroke={sobre === b.id && !b.desabilitado ? '#a9a9a9' : 'none'} />
          <image href={`/icons/${b.desabilitado ? b.icone.replace('.png', '0.png') : b.icone}`} x={2} y={2} width={16} height={16} />
        </g>
      ))}
    </g>
  );
}
