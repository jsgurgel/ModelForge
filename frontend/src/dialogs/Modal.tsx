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

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { SELETOR_FOCAVEL, deveConfirmarNoEnter, proximoFoco } from './modalLogica';
import './modalG2.css';

interface Props {
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: number;
  /** Ação do botão padrão: o Enter (fora de campos multilinha/botões) a executa. */
  aoConfirmar?: () => void;
  /** Há edição não salva: Esc/✕ pedem confirmação antes de descartar. */
  sujo?: boolean;
  /** Diálogo só de leitura: clicar no fundo fecha. Nos demais o fundo NÃO fecha (evita perder edição por um clique). */
  fundoFecha?: boolean;
}

/**
 * Modal acessível: `aria-modal`, foco inicial (primeiro campo do corpo, senão o primeiro botão), Tab preso dentro do diálogo,
 * foco devolvido ao elemento anterior ao fechar, Esc = cancelar, Enter = botão padrão (`aoConfirmar`) e clique no fundo só
 * fecha diálogos de leitura (`fundoFecha`).
 */
export function Modal({ titulo, onFechar, children, rodape, largura = 640, aoConfirmar, sujo, fundoFecha }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [descartar, setDescartar] = useState(false);

  const pedirFechar = useCallback(() => {
    if (sujo) setDescartar(true);
    else onFechar();
  }, [sujo, onFechar]);

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) {
      const alvo = el.querySelector<HTMLElement>('[autofocus], .modal-corpo input:not([type="checkbox"]):not([type="radio"]):not([disabled]), .modal-corpo textarea, .modal-corpo select')
        ?? el.querySelector<HTMLElement>('.modal-rodape button:not([disabled])')
        ?? el.querySelector<HTMLElement>(SELETOR_FOCAVEL);
      alvo?.focus();
    }
    return () => { if (anterior && document.contains(anterior)) anterior.focus?.(); };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); if (descartar) setDescartar(false); else pedirFechar(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [pedirFechar, descartar]);

  const teclado = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab' && ref.current) {
      const itens = Array.from(ref.current.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL)).filter((x) => x.offsetParent !== null || x === document.activeElement);
      const i = proximo(itens, document.activeElement, e.shiftKey);
      if (i >= 0) { e.preventDefault(); itens[i].focus(); }
      return;
    }
    const t = e.target as HTMLElement;
    if (deveConfirmarNoEnter({
      tecla: e.key, tag: t.tagName, tipo: (t as HTMLInputElement).type, editavel: t.isContentEditable, temConfirmar: !!aoConfirmar && !descartar,
      cancelado: e.defaultPrevented, mods: e.ctrlKey || e.altKey || e.metaKey || e.shiftKey,
    })) {
      e.preventDefault();
      aoConfirmar!();
    }
  };

  return (
    <div className="modal-fundo" onMouseDown={fundoFecha ? pedirFechar : undefined}>
      <div
        ref={ref} className="modal" style={{ width: largura }} onMouseDown={(e) => e.stopPropagation()} onKeyDown={teclado}
        role="dialog" aria-modal="true" aria-label={titulo}
      >
        <div className="modal-titulo">
          <span>{titulo}</span>
          <button onClick={pedirFechar} aria-label="Fechar">✕</button>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
        {descartar && (
          <div className="modal-descarte" role="alertdialog" aria-label="Descartar alterações">
            <div>
              <p>Há alterações não salvas neste diálogo. Descartá-las?</p>
              <div className="acoes">
                <button autoFocus onClick={() => setDescartar(false)}>Continuar editando</button>
                <button onClick={onFechar}>Descartar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function proximo(itens: HTMLElement[], ativo: Element | null, voltar: boolean): number {
  return proximoFoco(itens.length, ativo ? itens.indexOf(ativo as HTMLElement) : -1, voltar);
}
