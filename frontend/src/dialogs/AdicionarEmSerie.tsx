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
import { DICA_SERIE_CAMPOS, ItemSerie, lerSerieCampos } from '../editor/serie';
import { Modal } from './Modal';

/** Caixa "Adicionar em série": um item por linha. Componente novo, usado pelos editores de atributos e de campos. */
export function AdicionarEmSerie({ titulo, dica, aoConfirmar, aoFechar }: { titulo: string; dica: string; aoConfirmar: (texto: string) => void; aoFechar: () => void }) {
  const [texto, setTexto] = useState('');
  const ok = () => { if (texto.trim()) { aoConfirmar(texto); aoFechar(); } };
  return (
    <Modal titulo={titulo} onFechar={aoFechar} largura={480} sujo={!!texto.trim()}
      rodape={<><button onClick={ok} disabled={!texto.trim()}>OK</button><button onClick={aoFechar}>Cancelar</button></>}>
      <p className="dica">{dica}</p>
      <textarea autoFocus rows={10} style={{ width: '100%' }} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Itens, um por linha" />
    </Modal>
  );
}

/** Botão + caixa para o editor de campos: devolve os campos lidos (nome, tipo, complemento). */
export function BotaoSerieCampos({ aoAdicionar }: { aoAdicionar: (itens: ItemSerie[]) => void }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button title={DICA_SERIE_CAMPOS} onClick={() => setAberto(true)}>Adicionar em série</button>
      {aberto && <AdicionarEmSerie titulo="Adicionar em série" dica={DICA_SERIE_CAMPOS} aoFechar={() => setAberto(false)} aoConfirmar={(t) => aoAdicionar(lerSerieCampos(t))} />}
    </>
  );
}
