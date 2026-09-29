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

import { useMemo, useState } from 'react';
import { propsTabela } from '../editor/logico';
import { atualizarProps } from '../editor/ops';
import { abaAtiva, mutar } from '../editor/store';
import { CampoTabela } from '../editor/types';
import { Modal } from './Modal';

const PADRAO = ['INTEGER', 'BIGINT', 'SMALLINT', 'SERIAL', 'BIGSERIAL', 'VARCHAR(80)', 'VARCHAR(255)', 'TEXT', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'TIME', 'NUMERIC(10,2)', 'REAL', 'DOUBLE PRECISION', 'UUID', 'JSONB', 'BYTEA', 'GEOMETRY', 'GEOGRAPHY'];

/** Editor de tipos: os tipos de todos os campos de todas as tabelas, editáveis de uma vez. */
export function EditorDeTipos({ onFechar, aoResolver }: { onFechar: () => void; aoResolver?: (ok: boolean) => void }) {
  const doc = abaAtiva()!.doc;
  const tabelas = useMemo(() => doc.formas.filter((f) => f.kind === 'tabela'), [doc]);
  const [tipos, setTipos] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const t of tabelas) for (const c of propsTabela(t).campos) m[c.id] = c.tipo;
    return m;
  });
  const [sel, setSel] = useState<string>('*');
  const [de, setDe] = useState('');
  const [para, setPara] = useState('');
  const usados = useMemo(() => [...new Set([...Object.values(tipos).filter(Boolean), ...PADRAO])], [tipos]);
  const mostradas = tabelas.filter((t) => sel === '*' || t.id === sel);
  const substituir = () => {
    if (!de.trim()) return;
    setTipos((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v === de ? para : v])));
  };
  const aplicar = () => {
    mutar((d) => tabelas.reduce((acc, t) => {
      const campos = propsTabela(t).campos.map((c: CampoTabela) => (tipos[c.id] !== undefined && tipos[c.id] !== c.tipo ? { ...c, tipo: tipos[c.id] } : c));
      return atualizarProps(acc, t.id, { campos });
    }, d));
    onFechar();
    aoResolver?.(true);
  };
  const fechar = () => { onFechar(); aoResolver?.(false); };
  return (
    <Modal titulo="Editor de tipos" onFechar={fechar} largura={820} rodape={<><button onClick={aplicar}>Continuar</button><button onClick={fechar}>Fechar</button></>}>
      <p className="dica">Altere o tipo de dados dos campos de qualquer tabela. As chaves estrangeiras seguem o tipo da chave de origem ao revalidar as IR.</p>
      <div className="dd-barra">
        <label>Tabela
          <select value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="*">Todas as tabelas</option>
            {tabelas.map((t) => <option key={t.id} value={t.id}>{t.texto}</option>)}
          </select>
        </label>
        <label>Trocar tipo <input list="dd-tipos" value={de} placeholder="de" style={{ width: 130 }} onChange={(e) => setDe(e.target.value)} /></label>
        <label>por <input list="dd-tipos" value={para} placeholder="para" style={{ width: 130 }} onChange={(e) => setPara(e.target.value)} /></label>
        <button onClick={substituir} disabled={!de.trim()}>Aplicar a todos</button>
      </div>
      <datalist id="dd-tipos">{usados.map((t) => <option key={t} value={t} />)}</datalist>
      {!tabelas.length && <p className="vazio">Este diagrama não tem tabelas.</p>}
      <div className="ed-campos-scroll" style={{ maxHeight: 380, overflow: 'auto' }}>
        <table className="dd-tabela">
          <thead><tr><th>Tabela</th><th>Campo</th><th>Tipo</th></tr></thead>
          <tbody>
            {mostradas.flatMap((t) => propsTabela(t).campos.filter((c) => !c.separador).map((c) => (
              <tr key={c.id}>
                <td>{t.texto}</td>
                <td>{c.nome}</td>
                <td><input list="dd-tipos" type="text" value={tipos[c.id] ?? c.tipo} onChange={(e) => setTipos((m) => ({ ...m, [c.id]: e.target.value }))} /></td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
