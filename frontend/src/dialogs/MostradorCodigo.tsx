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
import { Linguagem, linguagemDoArquivo } from '../editor/realce';
import { salvarTexto } from '../editor/salvar';
import { ZOOM_CODIGO_INICIAL, ajustarZoomCodigo, limparCaracteresEspeciais } from '../editor/textoCodigo';
import { Codigo } from '../ui/Codigo';
import { abrirDialogo, fecharDialogo } from '../ui/dialogos';
import { Modal } from './Modal';

/** Estado e controles do visor de código: zoom, copiar, editar (SQL executável), salvar e limpar caracteres especiais. */
export function useVisorCodigo(original: string, nomeArquivo?: string, linguagem?: Linguagem) {
  const [texto, setTexto] = useState(original);
  const [zoom, setZoom] = useState(ZOOM_CODIGO_INICIAL);
  const ling = linguagem ?? linguagemDoArquivo(nomeArquivo);
  const ehSql = ling === 'sql';
  const salvar = async () => {
    if (!nomeArquivo) return;
    await salvarTexto(nomeArquivo, texto);
  };
  const botoes = (
    <>
      <button onClick={() => setZoom(ajustarZoomCodigo(zoom, -1))} title="Diminuir a fonte" aria-label="Diminuir a fonte">A-</button>
      <input aria-label="Tamanho da fonte" style={{ width: 44, textAlign: 'center' }} value={zoom} readOnly />
      <button onClick={() => setZoom(ajustarZoomCodigo(zoom, 1))} title="Aumentar a fonte" aria-label="Aumentar a fonte">A+</button>
      <span style={{ flex: 1 }} />
      <button onClick={() => navigator.clipboard.writeText(texto)}>Copiar</button>
      {ehSql && <button onClick={() => abrirDialogo({ tipo: 'bancoExecutar', sql: texto })} title="Abre o editor de SQL, que também executa no banco conectado">Editar</button>}
      {nomeArquivo && <button onClick={salvar}>Salvar arquivo</button>}
      <button onClick={() => setTexto(limparCaracteresEspeciais(texto))} title="Limpar caracteres especiais">Limpar caracteres especiais</button>
    </>
  );
  const codigo = <div style={{ fontSize: zoom }}><Codigo texto={texto} linguagem={ling} /></div>;
  return { botoes, codigo };
}

/** Visor de código gerado. */
export function MostradorCodigo({ titulo, texto: original, nomeArquivo, linguagem }: { titulo: string; texto: string; nomeArquivo?: string; linguagem?: Linguagem }) {
  const { botoes, codigo } = useVisorCodigo(original, nomeArquivo, linguagem);
  return (
    <Modal titulo={titulo} onFechar={fecharDialogo} largura={900} fundoFecha
      rodape={<>{botoes}<button onClick={fecharDialogo}>Fechar</button></>}>
      {codigo}
    </Modal>
  );
}
