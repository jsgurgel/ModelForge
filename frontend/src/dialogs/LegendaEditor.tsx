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
import { ItemLegenda, TIPOS_LEGENDA, TipoLegenda, artefatosDoDiagrama, capturarCores, itensDaLegenda, legendaComItens, tipoDaLegenda, trocarTipoLegenda } from '../editor/legenda';
import { moverItem } from '../editor/logico';
import { atualizarForma } from '../editor/ops';
import { abaAtiva, mutar } from '../editor/store';
import { Forma } from '../editor/types';
import { Modal } from './Modal';

/** Editor da Legenda: itens com descrição e cor, adicionar/remover, capturar cores. */
export function LegendaEditor({ id, onFechar }: { id: string; onFechar: () => void }) {
  const doc = abaAtiva()!.doc;
  const original = doc.formas.find((f) => f.id === id);
  const [f, setF] = useState<Forma | undefined>(() => (original ? structuredClone(original) : undefined));
  if (!f || !original) return null;
  const tam = f.fonte?.tamanho ?? doc.fonte.tamanho;
  const tipo = tipoDaLegenda(f);
  const itens = itensDaLegenda(f);
  const artefatos = artefatosDoDiagrama(doc);
  const set = (novos: ItemLegenda[]) => setF(legendaComItens(f, novos, tam));
  const edit = (i: number, patch: Partial<ItemLegenda>) => set(itens.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const aplicar = () => {
    mutar((d) => atualizarForma(d, id, { h: f.h, props: f.props }));
    onFechar();
  };
  return (
    <Modal titulo="Editor de legenda" onFechar={onFechar} largura={700} rodape={<><button onClick={aplicar}>OK</button><button onClick={onFechar}>Cancelar</button></>}>
      <div className="dd-barra">
        <label>Tipo de legenda
          <select value={tipo} onChange={(e) => setF(trocarTipoLegenda(f, e.target.value as TipoLegenda, tam))}>
            {TIPOS_LEGENDA.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
          </select>
        </label>
        <button onClick={() => set([...itens, { texto: '?', cor: '#000000', tag: 0 }])}>+ Adicionar item</button>
        {tipo === 'cores' && <button onClick={() => setF(capturarCores(doc, f))} title="Captura as cores de todos os objetos do diagrama">Capturar cores</button>}
      </div>
      {!itens.length && <p className="dica">Nenhum item. Adicione itens ou, no tipo Cores, capture as cores do diagrama.</p>}
      <table className="dd-tabela">
        <thead><tr><th>Cor</th><th>Descrição</th>{tipo === 'objetos' && <th>Artefato</th>}<th /></tr></thead>
        <tbody>
          {itens.map((it, i) => (
            <tr key={i}>
              <td><input type="color" value={/^#[0-9a-f]{6}$/i.test(it.cor) ? it.cor : '#000000'} onChange={(e) => edit(i, { cor: e.target.value })} /></td>
              <td><input type="text" value={it.texto} onChange={(e) => edit(i, { texto: e.target.value })} /></td>
              {tipo === 'objetos' && (
                <td>
                  <select value={it.tag} onChange={(e) => edit(i, { tag: Number(e.target.value) })}>
                    {artefatos.map((a, k) => <option key={a.kind} value={k}>{a.rotulo}</option>)}
                  </select>
                </td>
              )}
              <td style={{ whiteSpace: 'nowrap' }}>
                <button title="Para cima" disabled={i === 0} onClick={() => set(moverItem(itens, i, -1))}>↑</button>
                <button title="Para baixo" disabled={i === itens.length - 1} onClick={() => set(moverItem(itens, i, 1))}>↓</button>
                <button title="Excluir" onClick={() => set(itens.filter((_, k) => k !== i))}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
