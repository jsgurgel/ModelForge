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
import { gerarDsl, parseDsl } from '../editor/nosqlDsl';
import { atualizarProps } from '../editor/ops';
import { abaAtiva, mutar } from '../editor/store';
import { CampoNoSql } from '../editor/types';
import { Modal } from './Modal';

/** Editor de campos da Coleção NoSQL como texto (DSL). */
export function EditorDsl({ id, onFechar }: { id: string; onFechar: () => void }) {
  const f = abaAtiva()!.doc.formas.find((x) => x.id === id);
  const [texto, setTexto] = useState(() => gerarDsl((f?.props.campos as CampoNoSql[]) ?? []));
  const [erros, setErros] = useState<string[]>([]);
  if (!f) return null;
  const aplicar = () => {
    const r = parseDsl(texto);
    if (r.erros.length) { setErros(r.erros); return; }
    mutar((d) => atualizarProps(d, id, { campos: r.campos }));
    onFechar();
  };
  return (
    <Modal titulo={`Campos da coleção - ${f.texto}`} onFechar={onFechar} rodape={<><button onClick={aplicar}>OK</button><button onClick={onFechar}>Cancelar</button></>}>
      <p className="dica">Uma declaração por linha. Tipos: string, number, boolean, date, objectid, array, <code>embedded {'{ ... }'}</code>, <code>array_embedded {'{ ... }'}</code>, <code>reference Colecao</code>.</p>
      <textarea className="dsl" value={texto} spellCheck={false} onChange={(e) => setTexto(e.target.value)} rows={16} />
      {erros.length > 0 && <pre className="erros">{erros.join('\n')}</pre>}
    </Modal>
  );
}
