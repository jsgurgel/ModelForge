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

import { useCallback, useEffect, useRef, useState } from 'react';
import { abaAtiva, useEditor } from '../editor/store';
import { Forma } from '../editor/types';
import { abrirDialogo } from './dialogos';
import { Canvas } from './Canvas';
import { MiniMapa } from './MiniMapa';
import { FORMAS } from '../shapes/registry';

/** Área central: canvas rolável + MiniMapa fixo no canto. */
export function AreaDiagrama() {
  const e = useEditor();
  const aba = abaAtiva(e);
  const area = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState({ x: 0, y: 0, w: 800, h: 600 });
  const z = aba?.doc.zoom ?? 1;

  const medir = useCallback(() => {
    const el = area.current;
    if (el) setVisivel({ x: el.scrollLeft / z, y: el.scrollTop / z, w: el.clientWidth / z, h: el.clientHeight / z });
  }, [z]);

  const rolarPara = useCallback((x: number, y: number) => {
    const el = area.current;
    if (el) el.scrollTo({ left: Math.max(0, x * z), top: Math.max(0, y * z) });
  }, [z]);

  useEffect(() => {
    medir();
    window.addEventListener('resize', medir);
    const centralizar = (ev: Event) => {
      const { x, y } = (ev as CustomEvent<{ x: number; y: number }>).detail;
      const el = area.current;
      if (el) rolarPara(x - el.clientWidth / z / 2, y - el.clientHeight / z / 2);
    };
    window.addEventListener('modelforge:rolar', centralizar);
    return () => { window.removeEventListener('resize', medir); window.removeEventListener('modelforge:rolar', centralizar); };
  }, [medir, rolarPara, z]);

  const editar = (f: Forma) => {
    const geo = FORMAS[f.kind]?.geo;
    if (geo === 'table') abrirDialogo({ tipo: 'campos', id: f.id });
    else if (geo === 'colecao') abrirDialogo({ tipo: 'dsl', id: f.id });
  };

  if (!aba) {
    return (
      <div className="sem-diagrama">
        <img src="/icons/ModelForge.png" alt="" width={72} height={72} />
        <p>Nenhum diagrama aberto. Use <b>Arquivo → Novo</b> ou os ícones da barra de ferramentas.</p>
      </div>
    );
  }
  return (
    <div className="centro">
      <Canvas onEditar={editar} areaRef={area} onScroll={medir} />
      <MiniMapa visivel={visivel} rolarPara={rolarPara} />
    </div>
  );
}
