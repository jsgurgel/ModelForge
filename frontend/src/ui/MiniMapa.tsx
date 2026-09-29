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

import { useRef } from 'react';
import { abaAtiva, useEditor } from '../editor/store';
import { FORMAS } from '../shapes/registry';

const COR: Record<string, string> = {
  table: '#4a7bb7', rect: '#7a7a7a', diamond: '#c9822a', attr: '#5b9a5b', colecao: '#2f9e83',
};

/** Painel de navegação no canto do diagrama: formas coloridas por tipo + retângulo da área visível. */
export function MiniMapa({ visivel, rolarPara }: { visivel: { x: number; y: number; w: number; h: number }; rolarPara: (x: number, y: number) => void }) {
  const e = useEditor();
  const aba = abaAtiva(e);
  const ref = useRef<SVGSVGElement>(null);
  if (!aba || !e.miniMapa) return null;
  const { doc } = aba;
  const L = 180;
  const escala = L / doc.largura;
  const H = doc.altura * escala;
  const ir = (ev: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    rolarPara(((ev.clientX - r.left) / escala) - visivel.w / 2, ((ev.clientY - r.top) / escala) - visivel.h / 2);
  };
  return (
    <svg
      ref={ref} className="minimapa" width={L} height={H}
      onPointerDown={(ev) => { ev.currentTarget.setPointerCapture(ev.pointerId); ir(ev); }}
      onPointerMove={(ev) => ev.buttons === 1 && ir(ev)}
    >
      <rect width={L} height={H} className="minimapa-fundo" />
      {doc.formas.map((f) => (
        <rect key={f.id} x={f.x * escala} y={f.y * escala} width={Math.max(2, f.w * escala)} height={Math.max(2, f.h * escala)} fill={COR[FORMAS[f.kind]?.geo] ?? '#888'} opacity={0.8} />
      ))}
      <rect className="minimapa-visivel" x={visivel.x * escala} y={visivel.y * escala} width={visivel.w * escala} height={visivel.h * escala} />
    </svg>
  );
}
