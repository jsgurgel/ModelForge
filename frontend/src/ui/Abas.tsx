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
import { ativar, renomearAba, useEditor } from '../editor/store';
import { ICONE_TIPO } from '../editor/types';
import { executarComando } from '../editor/comandos';
import { fecharAbaComLista } from '../editor/fechar';
import { obterEstado } from '../editor/store';
import { abrirDialogo } from './dialogos';

export function Abas() {
  const e = useEditor();
  const [editando, setEditando] = useState<number | null>(null);
  const [valor, setValor] = useState('');

  const fechar = (i: number) => fecharAbaComLista(i);

  return (
    <div className="abas" role="tablist">
      {e.abas.map((a, i) => (
        <div
          key={i} role="tab" aria-selected={i === e.ativa}
          className={`aba${i === e.ativa ? ' ativa' : ''}`}
          onClick={() => ativar(i)}
          onDoubleClick={() => { setEditando(i); setValor(a.doc.nome); }}
          title="Duplo clique para renomear"
        >
          <img src={`/icons/${ICONE_TIPO[a.doc.tipo]}`} alt="" width={16} height={16} />
          {editando === i ? (
            <input
              className="aba-edicao" autoFocus value={valor} onChange={(ev) => setValor(ev.target.value)}
              onBlur={() => { renomearAba(i, valor); setEditando(null); }}
              onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); if (ev.key === 'Escape') setEditando(null); }}
            />
          ) : (
            <span>{a.doc.nome}{a.alterado ? ' *' : ''}</span>
          )}
          <button className="aba-fechar" onClick={(ev) => { ev.stopPropagation(); fechar(i); }} aria-label="Fechar aba">×</button>
        </div>
      ))}
      <button className="aba-nova" title="Novo diagrama" onClick={() => executarComando('novo.conceitual')}>+</button>
    </div>
  );
}
