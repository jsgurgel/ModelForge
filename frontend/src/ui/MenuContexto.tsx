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

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ItemContexto } from '../editor/menuContexto';

interface Props {
  x: number;
  y: number;
  itens: ItemContexto[];
  fechar: () => void;
}

/** Menu de contexto (botão direito) posicionado em coordenadas de tela, mantido dentro da janela. */
export function MenuContexto({ x, y, itens, fechar }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) });
  }, [x, y, itens]);

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) fechar(); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    window.addEventListener('mousedown', fora);
    window.addEventListener('keydown', tecla);
    window.addEventListener('blur', fechar);
    return () => {
      window.removeEventListener('mousedown', fora);
      window.removeEventListener('keydown', tecla);
      window.removeEventListener('blur', fechar);
    };
  }, [fechar]);

  return (
    <div ref={ref} className="menu-lista menu-contexto" role="menu" style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 80 }} onContextMenu={(e) => e.preventDefault()}>
      {itens.map((it, i) => {
        if ('sep' in it) return <div key={i} className="menu-sep" />;
        return (
          <div
            key={i} role="menuitem" aria-disabled={!!it.desabilitado}
            className={`menu-item${it.desabilitado ? ' desabilitado' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { if (!it.desabilitado) { fechar(); it.executar(); } }}
          >
            <span className="menu-icone">{it.icone && <img src={`/icons/${it.icone}`} alt="" width={16} height={16} />}</span>
            <span className="menu-rotulo">{it.rotulo}</span>
            {it.atalho && <span className="menu-atalho">{it.atalho}</span>}
          </div>
        );
      })}
    </div>
  );
}
