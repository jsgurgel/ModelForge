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

import { useMemo, useRef, useState } from 'react';
import { abaAtiva, useEditor } from '../editor/store';
import { PALETA_CORES, coresDeLegendas, normalizarCor } from './fontesCores';
import { Popover } from './Popover';

/**
 * Seletor de cor do Inspector: paleta, cores das legendas do
 * diagrama, cor personalizada e a opção "Nenhuma/transparente" (valor vazio = cor padrão do objeto).
 */
export function CorPicker({ valor, aoMudar, desabilitado, nenhumaRotulo = 'Nenhuma (padrão)' }: {
  valor: string; aoMudar: (v: string) => void; desabilitado?: boolean; nenhumaRotulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const e = useEditor();
  const aba = abaAtiva(e);
  const legendas = useMemo(() => (aba ? coresDeLegendas(aba.doc) : []), [aba]);
  const atual = normalizarCor(valor);
  const escolher = (c: string) => {
    aoMudar(c);
    setAberto(false);
  };
  return (
    <span className="prop-cor">
      <button
        ref={botao} type="button" className="cor-botao" disabled={desabilitado} title={atual || 'Sem cor (padrão)'}
        onClick={() => setAberto((v) => !v)}
      >
        <span className={`cor-amostra${atual ? '' : ' cor-nenhuma'}`} style={atual ? { background: atual } : undefined} />
        <span className="cor-texto">{atual || 'nenhuma'}</span>
      </button>
      {aberto && (
        <Popover ancora={botao.current} aoFechar={() => setAberto(false)} largura={252}>
          <div className="cor-grade">
            {PALETA_CORES.map((c) => (
              <button key={c} type="button" className={`cor-cel${c === atual ? ' sel' : ''}`} style={{ background: c }} title={c} onClick={() => escolher(c)} />
            ))}
          </div>
          {legendas.length > 0 && (
            <>
              <div className="cor-titulo">Legendas</div>
              <div className="cor-grade">
                {legendas.map((l) => (
                  <button key={l.cor} type="button" className={`cor-cel${l.cor === atual ? ' sel' : ''}`} style={{ background: l.cor }} title={`${l.texto} (${l.cor})`} onClick={() => escolher(l.cor)} />
                ))}
              </div>
            </>
          )}
          <div className="cor-rodape">
            <label title="Cor personalizada">
              Personalizada <input type="color" value={atual || '#ffffff'} onChange={(ev) => aoMudar(ev.target.value)} />
            </label>
            <button type="button" onClick={() => escolher('')}>{nenhumaRotulo}</button>
          </div>
        </Popover>
      )}
    </span>
  );
}
