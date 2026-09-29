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
import { ORGANIZACOES_EAP, OrganizacaoEap, construirEap } from '../editor/eapCli';
import { abaAtiva, mutar, selecionar, setMensagem } from '../editor/store';
import { Modal } from './Modal';

/** Construtor de EAP (CLI): monta processos, barra de ligação e ligações a partir de texto. */
export function ConstrutorEap({ onFechar }: { onFechar: () => void }) {
  const [principal, setPrincipal] = useState('');
  const [processos, setProcessos] = useState('');
  const [org, setOrg] = useState<OrganizacaoEap>('horizontal-centro');
  const [x, setX] = useState(200);
  const [y, setY] = useState(200);
  const [erro, setErro] = useState('');
  const ok = () => {
    const aba = abaAtiva();
    if (!aba) return;
    const r = construirEap(aba.doc, { principal, processos, organizacao: org, x, y });
    if (r.erro) { setErro(r.erro); return; }
    mutar(() => r.doc);
    selecionar(r.idsCriados);
    setMensagem(`EAP criada: ${r.idsCriados.length} objeto(s)`);
    onFechar();
  };
  return (
    <Modal titulo="Construtor de EAP (CLI)" onFechar={onFechar} largura={560} rodape={<><button onClick={ok}>OK</button><button onClick={onFechar}>Cancelar</button></>}>
      <div className="dd-grade">
        <label>Quadro principal</label>
        <input type="text" autoFocus value={principal} onChange={(e) => setPrincipal(e.target.value)} />
        <label>Posição (esquerda - LEFT)</label>
        <input type="number" value={x} min={0} onChange={(e) => setX(Number(e.target.value) || 0)} />
        <label>Posição (acima - TOP)</label>
        <input type="number" value={y} min={0} onChange={(e) => setY(Number(e.target.value) || 0)} />
        <label>Tipo de organização</label>
        <select value={org} onChange={(e) => setOrg(e.target.value as OrganizacaoEap)}>
          {ORGANIZACOES_EAP.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </select>
        <label>Processos (um por linha)</label>
        <textarea rows={9} value={processos} spellCheck={false} onChange={(e) => setProcessos(e.target.value)} placeholder={'Fase 1\nFase 2\n  Tarefa 2.1 (recuo = sub-processo)\nFase 3'} />
      </div>
      <p className="dica">Linhas recuadas (tab ou dois espaços) viram sub-processos do item anterior, cada um com a sua barra de ligação.</p>
      {erro && <p className="dd-erro">{erro}</p>}
    </Modal>
  );
}
