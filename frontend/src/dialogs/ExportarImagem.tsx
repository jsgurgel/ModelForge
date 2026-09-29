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
import { FORMATOS_IMAGEM, FormatoImagem, baixar, exportarImagem } from '../editor/exportar';
import { abaAtiva, setMensagem } from '../editor/store';
import { Modal } from './Modal';

/** Exportar imagem: PNG, JPG, BMP (canvas) ou SVG, com escolha de escala. */
export function ExportarImagem({ onFechar }: { onFechar: () => void }) {
  const [formato, setFormato] = useState<FormatoImagem>('png');
  const [escala, setEscala] = useState(2);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const aba = abaAtiva();
  if (!aba) return null;
  const exportar = async () => {
    setOcupado(true);
    setErro('');
    try {
      const { nome, blob } = await exportarImagem(aba.doc, formato, escala);
      baixar(nome, blob, blob.type);
      setMensagem(`Imagem exportada: ${nome}`);
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Modal titulo="Exportar imagem" onFechar={onFechar} largura={420} rodape={<><button onClick={exportar} disabled={ocupado}>{ocupado ? 'Gerando...' : 'Exportar'}</button><button onClick={onFechar}>Cancelar</button></>}>
      <div className="dd-grade">
        <label>Formato</label>
        <select value={formato} onChange={(e) => setFormato(e.target.value as FormatoImagem)}>
          {FORMATOS_IMAGEM.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
        </select>
        <label>Escala</label>
        <select value={escala} disabled={formato === 'svg'} onChange={(e) => setEscala(Number(e.target.value))}>
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}x</option>)}
        </select>
      </div>
      {formato === 'bmp' && <p className="dica">BMP não tem compressão: diagramas grandes geram arquivos grandes (prefira escala 1x).</p>}
      {erro && <p className="dd-erro">{erro}</p>}
    </Modal>
  );
}
