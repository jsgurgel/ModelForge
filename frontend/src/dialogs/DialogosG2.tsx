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
import { podeDesmarcarTodos, podeMarcarTodos, itensParaFechar, marcadosIniciais, rotuloItem, salvarMarcadosEContinuar } from '../editor/fechar';
import { limparHistorico, obterEstado, useEditor } from '../editor/store';
import { fecharDialogo } from '../ui/dialogos';
import type { Dialogo } from '../ui/dialogos';
import { Modal } from './Modal';

type G2 = Extract<Dialogo, { tipo: 'g2' }>;

/** Diálogo "Selecione os diagramas a salvar". */
function Fechar({ d }: { d: Extract<G2, { nome: 'fechar' }> }) {
  const itens = useMemo(() => itensParaFechar(obterEstado().abas, d.indices), [d.indices]);
  const [marcados, setMarcados] = useState(() => marcadosIniciais(itens));
  const alternar = (i: number) => setMarcados((m) => { const n = new Set(m); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const continuar = (salvar: boolean) => {
    const sel = salvar ? itens.filter((x) => x.alterado && marcados.has(x.indice)).map((x) => x.indice) : [];
    fecharDialogo();
    void salvarMarcadosEContinuar(sel, d.depois);
  };
  return (
    <Modal
      titulo="Selecione os diagramas a salvar" onFechar={fecharDialogo} largura={520} aoConfirmar={() => continuar(true)}
      rodape={<>
        <button onClick={() => setMarcados(new Set(itens.filter((x) => x.alterado).map((x) => x.indice)))} disabled={!podeMarcarTodos(itens, marcados)}>Marcar todos</button>
        <button onClick={() => setMarcados(new Set())} disabled={!podeDesmarcarTodos(itens, marcados)}>Desmarcar todos</button>
        <span style={{ flex: 1 }} />
        <button onClick={() => continuar(true)} autoFocus>Salvar selecionados e continuar</button>
        <button onClick={() => continuar(false)}>Continuar sem salvar</button>
        <button onClick={fecharDialogo}>Cancelar</button>
      </>}
    >
      <ul className="lista-fechar" role="group" aria-label="Diagramas">
        {itens.map((x, k) => (
          <li key={x.indice}>
            <label title={rotuloItem(itens, k)} style={{ opacity: x.alterado ? 1 : 0.55 }}>
              <input type="checkbox" checked={marcados.has(x.indice)} disabled={!x.alterado} onChange={() => alternar(x.indice)} /> {rotuloItem(itens, k)}
              {!x.alterado && <em> (sem alterações)</em>}
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** Janela "Logs e mensagens de erro": o histórico de mensagens da barra de status, com Limpar. */
function Logs() {
  const e = useEditor();
  return (
    <Modal titulo="Logs e mensagens de erro" onFechar={fecharDialogo} largura={720} fundoFecha
      rodape={<><button onClick={limparHistorico} disabled={!e.historicoMensagens.length}>Limpar</button><button onClick={fecharDialogo}>Fechar</button></>}>
      <div className="log-lista" role="log" aria-label="Logs e mensagens de erro" style={{ maxHeight: '60vh', overflow: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
        {!e.historicoMensagens.length && <div className="vazio">Nenhuma mensagem.</div>}
        {e.historicoMensagens.map((m, i) => <div key={i}>{m}</div>)}
      </div>
    </Modal>
  );
}

export function DialogosG2({ d }: { d: G2 }) {
  switch (d.nome) {
    case 'fechar': return <Fechar d={d} />;
    case 'logs': return <Logs />;
    case 'versao': return <AvisoVersao d={d} />;
  }
}

function AvisoVersao({ d }: { d: Extract<G2, { nome: 'versao' }> }) {
  return (
    <Modal titulo="Arquivo de versão mais nova" onFechar={() => { fecharDialogo(); d.aoRecusar?.(); }} largura={520} aoConfirmar={() => { fecharDialogo(); d.aoConfirmar(); }}
      rodape={<><button autoFocus onClick={() => { fecharDialogo(); d.aoConfirmar(); }}>Abrir mesmo assim</button><button onClick={() => { fecharDialogo(); d.aoRecusar?.(); }}>Cancelar</button></>}>
      <p>O arquivo foi gravado por uma versão mais nova do ModelForge do que esta ({VERSAO_ATUAL}). Ao abrir, algo pode ser ignorado e, ao salvar, o arquivo passa a ser desta versão.</p>
      <ul>{d.itens.map((x, i) => <li key={i}>{x.nome}: versão {x.versao}</li>)}</ul>
    </Modal>
  );
}
import { VERSAO_DIAGRAMA as VERSAO_ATUAL } from '../editor/types';
