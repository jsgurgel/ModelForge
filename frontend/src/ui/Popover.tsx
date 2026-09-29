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

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Caixa flutuante ancorada num botão (usada pelos seletores de cor e fonte); fecha com Esc ou clique fora. */
export function Popover({ ancora, aoFechar, children, largura = 260 }: { ancora: HTMLElement | null; aoFechar: () => void; children: ReactNode; largura?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    if (!ancora) return;
    const r = ancora.getBoundingClientRect();
    const h = ref.current?.offsetHeight ?? 260;
    let x = r.left;
    if (x + largura > window.innerWidth - 8) x = Math.max(8, window.innerWidth - largura - 8);
    let y = r.bottom + 2;
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 2);
    setPos({ x, y });
  }, [ancora, largura]);
  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !ancora?.contains(e.target as Node)) aoFechar();
    };
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [ancora, aoFechar]);
  return createPortal(
    <div ref={ref} className="popover-insp" style={{ left: pos.x, top: pos.y, width: largura }} role="dialog">{children}</div>,
    document.body,
  );
}
