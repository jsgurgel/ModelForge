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
import { ESTILOS_FONTE, FonteSel, TAMANHOS_FONTE, descreverFonte, estiloDaFonte, estiloParaFlags, fonteValida, nomesDeFonte } from './fontesCores';
import { Popover } from './Popover';

/** Prévia com a fonte (o "Exemplo"). */
const estiloPrevia = (f: FonteSel) => ({ fontFamily: f.nome, fontSize: Math.min(f.tamanho, 40), fontWeight: f.negrito ? 700 : 400, fontStyle: f.italico ? 'italic' : 'normal' } as const);

/**
 * Seletor de fonte: lista de nomes, tamanho, estilo, exemplo, "Anterior" e "Restaurar".
 * O botão mostra a fonte atual; a alteração só vale ao confirmar.
 */
export function FontChooser({ valor, padrao, aoMudar, desabilitado }: { valor: FonteSel; padrao?: FonteSel; aoMudar: (f: FonteSel) => void; desabilitado?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [rasc, setRasc] = useState<FonteSel>(valor);
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (aberto) setRasc(valor); }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = padrao ?? valor;
  const confirmar = () => {
    aoMudar(fonteValida(rasc, base));
    setAberto(false);
  };
  return (
    <span className="prop-cor">
      <button ref={botao} type="button" className="prop-botao" disabled={desabilitado} title="Editor de fonte." onClick={() => setAberto((v) => !v)}>
        {descreverFonte(valor)} ...
      </button>
      {aberto && (
        <Popover ancora={botao.current} aoFechar={() => setAberto(false)} largura={330}>
          <div className="fonte-cols">
            <div>
              <div className="cor-titulo">Nome da fonte</div>
              <select size={8} value={rasc.nome} onChange={(ev) => setRasc({ ...rasc, nome: ev.target.value })} aria-label="Nome da fonte">
                {nomesDeFonte(valor.nome).map((n) => <option key={n} value={n} style={{ fontFamily: n }}>{n}</option>)}
              </select>
            </div>
            <div>
              <div className="cor-titulo">Estilo da fonte</div>
              <select size={4} value={estiloDaFonte(rasc.negrito, rasc.italico)} onChange={(ev) => setRasc({ ...rasc, ...estiloParaFlags(ev.target.value) })} aria-label="Estilo da fonte">
                {ESTILOS_FONTE.map((s) => <option key={s}>{s}</option>)}
              </select>
              <div className="cor-titulo">Tamanho da fonte</div>
              <input type="number" min={1} max={200} value={rasc.tamanho} onChange={(ev) => setRasc({ ...rasc, tamanho: Number(ev.target.value) })} aria-label="Tamanho da fonte" />
              <select size={4} value={String(rasc.tamanho)} onChange={(ev) => setRasc({ ...rasc, tamanho: Number(ev.target.value) })} aria-label="Tamanhos">
                {TAMANHOS_FONTE.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <fieldset className="fonte-previa">
            <legend>Exemplo</legend>
            <div style={estiloPrevia(rasc)}>AaBbYyZz</div>
          </fieldset>
          <fieldset className="fonte-previa">
            <legend>Anterior</legend>
            <div style={estiloPrevia(valor)}>AaBbYyZz</div>
          </fieldset>
          <div className="cor-rodape">
            <button type="button" onClick={() => setRasc(valor)}>Restaurar</button>
            <button type="button" onClick={confirmar}>OK</button>
            <button type="button" onClick={() => setAberto(false)}>Cancelar</button>
          </div>
        </Popover>
      )}
    </span>
  );
}
