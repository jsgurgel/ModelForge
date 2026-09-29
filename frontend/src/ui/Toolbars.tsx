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

import { COMANDOS, executarComando, habilitado, zoom } from '../editor/comandos';
import { ZOOMS, rotuloZoom } from '../editor/interacao';
import { atalhoDe } from '../editor/atalhos';
import { abaAtiva, useEditor } from '../editor/store';
import { ICONE_TIPO, NOME_TIPO, TIPOS } from '../editor/types';

function Botao({ id, icone, titulo }: { id: string; icone?: string; titulo?: string }) {
  const cmd = COMANDOS[id];
  if (!cmd) return null;
  const ok = habilitado(cmd);
  return (
    <button
      className="tb-botao" disabled={!ok} onClick={() => executarComando(id)}
      title={`${titulo ?? cmd.rotulo}${atalhoDe(id, tipoAtual()) ? ` (${atalhoDe(id, tipoAtual())})` : ''}`} aria-label={cmd.rotulo}
    >
      <img src={`/icons/${icone ?? cmd.icone}`} alt="" width={20} height={20} />
    </button>
  );
}

const Sep = () => <span className="tb-sep" />;
const tipoAtual = () => abaAtiva()?.doc.tipo ?? null;

export function Toolbars() {
  const e = useEditor();
  const aba = abaAtiva(e);
  return (
    <div className="toolbars">
      <div className="toolbar linha1">
        {TIPOS.map((t) => (
          <button key={t} className="tb-botao" onClick={() => executarComando(`novo.${t}`)} title={`Novo diagrama ${NOME_TIPO[t]}`}>
            <img src={`/icons/${ICONE_TIPO[t]}`} alt="" width={20} height={20} />
          </button>
        ))}
      </div>
      <div className="toolbar linha2">
        <Botao id="arquivo.abrir" /><Botao id="arquivo.salvar" /><Botao id="arquivo.salvarTodos" /><Botao id="arquivo.imprimir" /><Sep />
        <Botao id="editar.desfazer" /><Botao id="editar.refazer" /><Sep />
        <Botao id="editar.selecionarTudo" /><Botao id="editar.selecionarTipo" /><Sep />
        <Botao id="editar.frente" /><Botao id="editar.tras" /><Sep />
        <Botao id="editar.anterior" /><Botao id="editar.proximo" /><Sep />
        <Botao id="zoom.menos" />
        <select
          className="tb-zoom" title="Zoom (Ctrl + roda do mouse)" aria-label="Zoom" disabled={!aba}
          value={aba ? String(aba.doc.zoom) : '1'} onChange={(ev) => zoom(Number(ev.target.value))}
        >
          {/* O zoom de um arquivo pode não ser um dos passos: aparece como opção extra. */}
          {aba && !ZOOMS.includes(aba.doc.zoom) && <option value={String(aba.doc.zoom)}>{rotuloZoom(aba.doc.zoom)}</option>}
          {ZOOMS.map((z) => <option key={z} value={String(z)}>{rotuloZoom(z)}</option>)}
        </select>
        <Botao id="zoom.mais" /><Sep />
        <Botao id="editar.copiar" /><Botao id="editar.colar" /><Sep />
        <Botao id="editar.copiarFormato" /><Botao id="editar.colarFormato" /><Botao id="editar.realcar" /><Sep />
        <Botao id="editar.microEsq" /><Botao id="editar.microCima" /><Botao id="editar.microBaixo" /><Botao id="editar.microDir" /><Sep />
        <Botao id="alinhar.esquerda" /><Botao id="alinhar.topo" /><Botao id="alinhar.direita" /><Botao id="alinhar.base" />
        <Botao id="alinhar.largura" /><Botao id="alinhar.altura" /><Botao id="alinhar.horizontal" /><Botao id="alinhar.vertical" />
        {aba?.doc.tipo === 'logico' && (
          <>
            <Sep /><Botao id="logico.add.campo" /><Botao id="logico.add.key" /><Botao id="logico.add.fkey" /><Botao id="logico.add.keyfkey" />
          </>
        )}
      </div>
    </div>
  );
}
