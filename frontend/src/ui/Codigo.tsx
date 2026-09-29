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

import { CSSProperties, useMemo, useRef } from 'react';
import { Linguagem, tokenizar } from '../editor/realce';

function Tokens({ texto, linguagem }: { texto: string; linguagem: Linguagem }) {
  const tokens = useMemo(() => tokenizar(texto, linguagem), [texto, linguagem]);
  return <>{tokens.map((t, i) => (t.tipo === 'tx' ? t.texto : <span key={i} className={`tk tk-${t.tipo}`}>{t.texto}</span>))}</>;
}

/** Bloco de código somente leitura, com realce de sintaxe. */
export function Codigo({ texto, linguagem, className = '' }: { texto: string; linguagem: Linguagem; className?: string }) {
  return <pre className={`codigo ${className}`}><Tokens texto={texto} linguagem={linguagem} /></pre>;
}

/** Caixa de edição com realce: um <pre> colorido atrás de um <textarea> transparente com a mesma fonte e quebra de linha. */
export function EditorCodigo({ valor, aoMudar, linguagem, rows = 8, placeholder, style, className = '' }: {
  valor: string; aoMudar: (v: string) => void; linguagem: Linguagem; rows?: number; placeholder?: string; style?: CSSProperties; className?: string;
}) {
  const fundo = useRef<HTMLPreElement>(null);
  const sincronizar = (el: HTMLTextAreaElement) => {
    if (fundo.current) fundo.current.style.transform = `translate(${-el.scrollLeft}px, ${-el.scrollTop}px)`;
  };
  return (
    <div className={`editor-codigo ${className}`} style={{ ...style, height: `${rows * 1.5 + 1.2}em` }}>
      <div className="editor-codigo-fundo" aria-hidden>
        <pre ref={fundo}><Tokens texto={valor} linguagem={linguagem} />{'\n'}</pre>
      </div>
      <textarea
        value={valor} spellCheck={false} placeholder={placeholder} wrap="soft"
        onChange={(e) => aoMudar(e.target.value)} onScroll={(e) => sincronizar(e.currentTarget)}
      />
    </div>
  );
}
