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
import { adicionarAtributo, atributosDe, removerAtributo } from '../editor/conceitual';
import { atualizarForma, atualizarProps } from '../editor/ops';
import { abaAtiva, mutar, useEditor } from '../editor/store';
import { Modal } from './Modal';
import { AdicionarEmSerie } from './AdicionarEmSerie';
import { DICA_SERIE_ATRIBUTOS, lerSerieAtributos } from '../editor/serie';

const DONOS = ['entidade', 'relacionamento', 'autorelacionamento', 'entidadeAssociativa'];

/** Editor de atributos do Conceitual: escolhe o dono (entidade/relacionamento) e edita todos os atributos numa grade. */
export function EditorAtributos({ id, onFechar }: { id?: string; onFechar: () => void }) {
  useEditor();
  const aba = abaAtiva();
  const [donoId, setDonoId] = useState(() => {
    const d = aba?.doc;
    if (!d) return '';
    const sel = d.formas.find((f) => f.id === id);
    if (sel && DONOS.includes(sel.kind)) return sel.id;
    return d.formas.find((f) => DONOS.includes(f.kind))?.id ?? '';
  });
  const [serie, setSerie] = useState(false);
  if (!aba) return null;
  const doc = aba.doc;
  const donos = doc.formas.filter((f) => DONOS.includes(f.kind));
  const attrs = donoId ? atributosDe(doc, donoId) : [];
  const ap = (aid: string, p: Record<string, unknown>) => mutar((d) => atualizarProps(d, aid, p));

  return (
    <Modal titulo="Editar atributos" onFechar={onFechar} largura={860} rodape={<button onClick={onFechar}>Fechar</button>}>
      <div className="ed-campos-barra">
        <label>Dono&nbsp;
          <select value={donoId} onChange={(e) => setDonoId(e.target.value)}>
            {donos.map((f) => <option key={f.id} value={f.id}>{f.texto} ({f.kind === 'entidade' ? 'entidade' : 'relacionamento'})</option>)}
          </select>
        </label>
        <button disabled={!donoId} onClick={() => mutar((d) => adicionarAtributo(d, donoId).doc)}>Adicionar atributo</button>
        <button disabled={!donoId} title={DICA_SERIE_ATRIBUTOS} onClick={() => setSerie(true)}>Adicionar em série</button>
      </div>
      <div className="ed-campos-scroll"><table className="ed-campos">
        <thead><tr><th>Nome</th><th>Tipo</th><th>Ident.</th><th>Opc.</th><th>Multi</th><th>Mín.</th><th>Máx.</th><th /></tr></thead>
        <tbody>
          {attrs.map((a) => {
            const max = Number(a.props.cardMax ?? 1);
            return (
              <tr key={a.id}>
                <td><input value={a.texto} onChange={(e) => mutar((d) => atualizarForma(d, a.id, { texto: e.target.value }))} /></td>
                <td><input value={String(a.props.tipo ?? '')} onChange={(e) => ap(a.id, { tipo: e.target.value })} /></td>
                <td><input type="checkbox" checked={!!a.props.identificador} onChange={(e) => ap(a.id, { identificador: e.target.checked })} /></td>
                <td><input type="checkbox" checked={!!a.props.opcional} onChange={(e) => ap(a.id, { opcional: e.target.checked })} /></td>
                <td><input type="checkbox" checked={a.kind === 'atributoMulti'} onChange={(e) => mutar((d) => atualizarForma(d, a.id, { kind: e.target.checked ? 'atributoMulti' : 'atributo', w: e.target.checked ? 18 : 14, h: e.target.checked ? 18 : 14 }))} /></td>
                <td><input style={{ width: 44 }} value={String(a.props.cardMin ?? 1)} onChange={(e) => ap(a.id, { cardMin: parseInt(e.target.value, 10) || 0 })} /></td>
                <td><input style={{ width: 44 }} value={max < 0 ? 'n' : String(max)} onChange={(e) => ap(a.id, { cardMax: /^n$/i.test(e.target.value.trim()) ? -1 : parseInt(e.target.value, 10) || 1 })} /></td>
                <td><button title="Remover" onClick={() => mutar((d) => removerAtributo(d, a.id))}>×</button></td>
              </tr>
            );
          })}
          {!attrs.length && <tr><td colSpan={8} className="vazio">Nenhum atributo.</td></tr>}
        </tbody>
      </table></div>
      {serie && (
        <AdicionarEmSerie titulo="Adicionar em série" dica={DICA_SERIE_ATRIBUTOS} aoFechar={() => setSerie(false)} aoConfirmar={(t) => mutar((d) => {
          let cur = d;
          for (const it of lerSerieAtributos(t)) {
            const r = adicionarAtributo(cur, donoId, it.nome);
            cur = it.tipo ? atualizarProps(r.doc, r.id, { tipo: it.tipo }) : r.doc;
          }
          return cur;
        })} />
      )}
    </Modal>
  );
}
