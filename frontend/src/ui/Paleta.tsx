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

import { setFerramenta, useEditor, abaAtiva } from '../editor/store';
import { PALETA, iconePaleta, rotuloPaleta } from '../shapes/registry';

export function Paleta() {
  const e = useEditor();
  const aba = abaAtiva(e);
  if (!aba) return <div className="paleta" />;
  const itens = PALETA[aba.doc.tipo];
  return (
    <div className="paleta" role="toolbar" aria-label="Formas">
      <button className={`paleta-botao${!e.ferramenta ? ' ativo' : ''}`} onClick={() => setFerramenta(null)} title="Selecionar">
        <img src="/icons/Mouse.png" alt="Selecionar" width={24} height={24} />
      </button>
      {itens.map((i) => {
        const ativo = e.ferramenta?.kind === i.kind && e.ferramenta.tipo === i.tipo;
        return (
          <button
            key={`${i.tipo}${i.kind}`} className={`paleta-botao${ativo ? ' ativo' : ''}`}
            onClick={() => setFerramenta(ativo ? null : i)}
            onDoubleClick={() => setFerramenta(i, true)}
            title={`${rotuloPaleta(i)} (duplo clique mantém a ferramenta)`}
          >
            <img src={`/icons/${iconePaleta(i)}`} alt={rotuloPaleta(i)} width={24} height={24} />
          </button>
        );
      })}
    </div>
  );
}
