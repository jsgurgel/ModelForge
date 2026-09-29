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
import type { PerguntaConversao } from '../api';
import type { RespostaDialogo } from '../editor/conversaoInterativa';
import { abrirDialogo, fecharDialogo } from '../ui/dialogos';
import { Modal } from './Modal';

/** Abre o diálogo de uma pergunta da conversão e resolve com a escolha do usuário. */
export function perguntarConversao(pergunta: PerguntaConversao): Promise<RespostaDialogo> {
  return new Promise((resolver) => {
    abrirDialogo({ tipo: 'h', nome: 'perguntaConversao', dados: { pergunta, resolver } });
  });
}

/** Diálogo de uma pergunta: textos em negrito, opções (rádio; as desabilitadas ficam inativas), observações e os 3 botões. */
export function PerguntaConversaoDialogo({ pergunta, resolver }: { pergunta: PerguntaConversao; resolver: (r: RespostaDialogo) => void }) {
  const [opcao, setOpcao] = useState(pergunta.padrao);
  const responder = (r: RespostaDialogo) => { fecharDialogo(); resolver(r); };
  return (
    <Modal
      titulo="Conversão para o modelo lógico"
      largura={720}
      onFechar={() => responder({ acao: 'cancelar' })}
      rodape={<>
        <button onClick={() => responder({ acao: 'ok', opcao })} autoFocus>OK</button>
        <button onClick={() => responder({ acao: 'todos' })} title="Usa a resposta padrão desta e de todas as próximas perguntas">OK para todos</button>
        <button onClick={() => responder({ acao: 'cancelar' })}>Cancelar</button>
      </>}
    >
      <div className="pergunta-conversao">
        {pergunta.textos.map((t, i) => <div key={i}><strong>{t}</strong></div>)}
        <div>&nbsp;</div>
        {pergunta.opcoes.map((o, i) => {
          const desab = pergunta.desabilitadas.includes(i);
          return (
            <label key={i} style={{ display: 'block', opacity: desab ? 0.5 : 1, margin: '4px 0' }}>
              <input type="radio" name="opcao" checked={opcao === i} disabled={desab} onChange={() => setOpcao(i)} /> {o}
            </label>
          );
        })}
        {pergunta.observacoes.length > 0 && <div style={{ marginTop: 8 }}>Observação:</div>}
        {pergunta.observacoes.map((o, i) => <div key={i}>{o}</div>)}
      </div>
    </Modal>
  );
}
