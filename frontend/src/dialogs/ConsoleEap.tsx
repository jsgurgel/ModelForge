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

import { useEffect, useMemo, useRef, useState } from 'react';
import { ConsoleEap, MSG, scriptDoConstrutor } from '../editor/eapScript';
import { ORGANIZACOES_EAP, OrganizacaoEap } from '../editor/eapCli';
import { abaAtiva, mutar } from '../editor/store';
import { fecharDialogo } from '../ui/dialogos';
import { Modal } from './Modal';

/**
 * Console de scripts do EAP. Complementa o formulário simples "Construtor de EAP":
 * aqui vale a linguagem completa (NOVO EAP/PROCESSO, SET AMBIENT, LISTAR, CLEAR...), com histórico (setas), Tab para completar,
 * Ctrl+D (cancelar), Ctrl+Q (sair), colar várias linhas e o menu "Construtor" (wizard).
 */
export function ConsoleEapDialogo() {
  const [, redesenhar] = useState(0);
  const [wizard, setWizard] = useState(false);
  const [linha, setLinha] = useState('');
  const fim = useRef<HTMLDivElement>(null);
  const con = useMemo(
    () => new ConsoleEap({
      obterDoc: () => abaAtiva()!.doc,
      aplicarDoc: (d) => mutar(() => d),
      fechar: () => fecharDialogo(),
    }),
    [],
  );
  const atualizar = () => { setLinha(con.digitando); redesenhar((n) => n + 1); };
  useEffect(() => { fim.current?.scrollIntoView?.({ block: 'end' }); });

  const enviar = () => { con.entrar(linha); atualizar(); };
  const colarTexto = (t: string) => { con.digitando = linha; con.colar(t); atualizar(); };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'q') { e.preventDefault(); con.sair(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'd') { e.preventDefault(); con.cancelar(); atualizar(); return; }
    if (e.key === 'Enter') { e.preventDefault(); enviar(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setLinha(con.navegarHistorico(+1)); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setLinha(con.navegarHistorico(-1)); }
    else if (e.key === 'Tab') { e.preventDefault(); con.digitando = linha; setLinha(con.autoCompletar()); }
  };

  return (
    <Modal
      titulo="CLI - console de scripts do EAP"
      largura={760}
      onFechar={fecharDialogo}
      rodape={<>
        <button onClick={() => setWizard(true)}>{MSG.construtor}</button>
        <button onClick={async () => { try { colarTexto(await navigator.clipboard.readText()); } catch { /* sem permissão de área de transferência */ } }}>Colar</button>
        <button onClick={() => { con.cancelar(); atualizar(); }} title="Ctrl+D">Cancelar</button>
        <button onClick={() => con.sair()} title="Ctrl+Q">Sair</button>
      </>}
    >
      {wizard ? (
        <Construtor
          onOk={(o) => { setWizard(false); colarTexto(scriptDoConstrutor(con, o)); }}
          onCancelar={() => setWizard(false)}
        />
      ) : (
        <div className="console-eap">
          <pre style={{ background: '#fff', color: '#00c', minHeight: 260, maxHeight: 360, overflow: 'auto', margin: 0, padding: 6, fontFamily: 'monospace' }}>
            {con.transcrito}
            <div ref={fim} />
          </pre>
          <div style={{ display: 'flex', background: '#000', color: '#ff0', fontFamily: 'monospace', padding: '2px 6px' }}>
            <span>{con.prompt}</span>
            <input
              autoFocus
              aria-label="Comando"
              style={{ flex: 1, background: 'transparent', color: '#ff0', border: 0, outline: 0, fontFamily: 'monospace' }}
              value={linha}
              spellCheck={false}
              onChange={(e) => { con.digitando = e.target.value; setLinha(e.target.value); }}
              onKeyDown={onKey}
              onPaste={(e) => {
                const t = e.clipboardData.getData('text');
                if (t.includes('\n')) { e.preventDefault(); colarTexto(t); }
              }}
            />
          </div>
          <p className="dica" style={{ margin: '6px 0 0' }}>
            Digite LISTAR (ou ?) para ver os comandos. Tab completa, setas navegam no histórico. {MSG.dica.novoEap.replace(/\n/g, ' ')}
          </p>
        </div>
      )}
    </Modal>
  );
}

/** Menu "Construtor": monta o script NOVO EAP e o cola no console. */
function Construtor({ onOk, onCancelar }: {
  onOk: (o: { principal: string; processos: string; organizacao: OrganizacaoEap; x: string; y: string }) => void;
  onCancelar: () => void;
}) {
  const [principal, setPrincipal] = useState('');
  const [processos, setProcessos] = useState('');
  const [org, setOrg] = useState<OrganizacaoEap>('horizontal-centro');
  const [x, setX] = useState('200');
  const [y, setY] = useState('200');
  return (
    <div className="dd-grade">
      <label>Quadro principal</label>
      <input type="text" autoFocus value={principal} onChange={(e) => setPrincipal(e.target.value)} />
      <label>Posição (esquerda - LEFT)</label>
      <input type="text" value={x} onChange={(e) => setX(e.target.value)} />
      <label>Posição (acima - TOP)</label>
      <input type="text" value={y} onChange={(e) => setY(e.target.value)} />
      <label>Tipo de organização</label>
      <select value={org} onChange={(e) => setOrg(e.target.value as OrganizacaoEap)}>
        {ORGANIZACOES_EAP.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>
      <label>Processos (um por linha)</label>
      <textarea rows={8} value={processos} spellCheck={false} onChange={(e) => setProcessos(e.target.value)} />
      <div />
      <div>
        <button onClick={() => onOk({ principal, processos, organizacao: org, x, y })}>OK</button>{' '}
        <button onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}
