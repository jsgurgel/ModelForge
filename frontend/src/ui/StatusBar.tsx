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

import { useEffect, useRef, useState } from 'react';
import { abaAtiva, limparHistorico, useEditor } from '../editor/store';
import { abrirDialogo } from './dialogos';
import './motor.css';

export function StatusBar() {
  const e = useEditor();
  const aba = abaAtiva(e);
  const [historico, setHistorico] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sel = aba?.selecao.length ?? 0;

  useEffect(() => {
    if (!historico) return;
    const fora = (ev: MouseEvent) => { if (!ref.current?.contains(ev.target as Node)) setHistorico(false); };
    window.addEventListener('mousedown', fora);
    return () => window.removeEventListener('mousedown', fora);
  }, [historico]);

  return (
    <div className="statusbar" ref={ref} style={{ position: 'relative' }}>
      <span className="status-msg">
        <button
          className="status-msg-botao" onClick={() => setHistorico(!historico)}
          title="Histórico de mensagens" aria-expanded={historico}
        >
          {e.mensagem || (e.historicoMensagens.length ? 'Pronto' : 'Pronto')}
        </button>
      </span>
      {historico && (
        <div className="status-historico" role="log" aria-label="Histórico de mensagens">
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <button onClick={limparHistorico} disabled={!e.historicoMensagens.length}>Limpar</button>
            <button onClick={() => { setHistorico(false); abrirDialogo({ tipo: 'g2', nome: 'logs' }); }}>Logs e mensagens de erro...</button>
          </div>
          {!e.historicoMensagens.length && <div>Nenhuma mensagem ainda.</div>}
          {[...e.historicoMensagens].reverse().map((m, i) => <div key={i}>{m}</div>)}
        </div>
      )}
      {e.autosaveFalhou && <span role="alert" style={{ color: '#c62828', fontWeight: 600 }} title="O navegador não conseguiu guardar o auto-salvamento">Auto-salvamento falhou</span>}
      <span className="status-info">
        {e.realce ? 'Destaque ativo · ' : ''}
        <span title="Versão (data/hora) do build carregado neste navegador" style={{ opacity: 0.55, marginRight: 10 }}>build {__BUILD__}</span>
        {aba ? `${aba.doc.formas.length} forma(s) · ${aba.doc.ligacoes.length} ligação(ões)${sel ? ` · ${sel} selecionada(s)` : ''}` : ''}
      </span>
    </div>
  );
}
