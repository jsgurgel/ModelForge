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
import { AbaSidebar, setAbaSidebar, useEditor } from '../editor/store';
import { definirConfig, useConfig } from '../editor/config';
import { Navegacao } from './Navegacao';
import { Configuracao } from './Configuracao';
import './motor.css';
import { BancoPanel } from './BancoPanel';
import { Inspector, AcoesInspector } from './Inspector';

const ABAS: [AbaSidebar, string][] = [['inspector', 'Inspector'], ['navegacao', 'Navegação'], ['configuracao', 'Configuração'], ['banco', 'Banco']];

export function Sidebar({ acoes }: { acoes: AcoesInspector }) {
  const e = useEditor();
  const cfg = useConfig();
  const [arrastando, setArrastando] = useState(false);
  //# Divisor: arrastar muda a largura do painel (persistida na configuração).
  const iniciarDivisor = (ev: React.PointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    setArrastando(true);
  };
  const moverDivisor = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (!arrastando) return;
    const aside = ev.currentTarget.previousElementSibling as HTMLElement | null;
    const esquerda = aside?.getBoundingClientRect().left ?? 0;
    definirConfig({ larguraSidebar: ev.clientX - esquerda });
  };
  return (
    <>
    <aside className="sidebar" style={{ width: cfg.larguraSidebar }}>
      <div className="sidebar-abas" role="tablist">
        {ABAS.map(([id, nome]) => (
          <button key={id} role="tab" aria-selected={e.abaSidebar === id} className={`sidebar-aba${e.abaSidebar === id ? ' ativa' : ''}`} onClick={() => setAbaSidebar(id)}>{nome}</button>
        ))}
      </div>
      <div className="sidebar-corpo">
        {e.abaSidebar === 'inspector' && <Inspector acoes={acoes} />}
        {e.abaSidebar === 'navegacao' && <Navegacao />}
        {e.abaSidebar === 'configuracao' && <Configuracao />}
        {e.abaSidebar === 'banco' && <BancoPanel />}
      </div>
    </aside>
    <div
      className={`divisor-sidebar${arrastando ? ' arrastando' : ''}`} role="separator" aria-orientation="vertical" title="Arraste para redimensionar o painel"
      onPointerDown={iniciarDivisor} onPointerMove={moverDivisor} onPointerUp={() => setArrastando(false)}
      onDoubleClick={() => definirConfig({ larguraSidebar: 268 })}
    />
    </>
  );
}
