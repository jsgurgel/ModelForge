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

/** Editor SQL com autocomplete baseado no catálogo do banco. */
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CatalogoAutocomplete } from '../api';
import { tokenizar } from '../editor/realce';
import { sugerir, Sugestao } from './autocomplete';

const ICONES_TIPO: Record<string, string> = {
  kw: '🔑', tabela: '🗃', view: '👁', view_materializada: '👁', sequencia: '🔢', rotina: '⚙', coluna: '📋', schema: '📁',
};

export function EditorSql({
  valor, aoMudar, catalogo, onExecutar, onParar, onPrecisaCatalogo, executando, style,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  catalogo: CatalogoAutocomplete | null;
  onExecutar: () => void;
  onParar?: () => void;
  /** Chamado quando um Ctrl+Space acontece sem catálogo carregado (carrega sob demanda). */
  onPrecisaCatalogo?: () => void;
  executando: boolean;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fundo = useRef<HTMLPreElement>(null);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [selSugestao, setSelSugestao] = useState(0);
  const [posCursor, setPosCursor] = useState({ top: 0, left: 0 });
  const [abertoManual, setAbertoManual] = useState(false);

  const tokens = useMemo(() => tokenizar(valor, 'sql'), [valor]);

  const sincronizar = (el: HTMLTextAreaElement) => {
    if (fundo.current) fundo.current.style.transform = `translate(${-el.scrollLeft}px, ${-el.scrollTop}px)`;
  };

  /**
   * Mede a posição do cursor na viewport criando um div-espelho com EXATAMENTE a
   * mesma tipografia e largura de conteúdo do textarea, escrevendo o texto até o
   * cursor e medindo onde um span marcador cai.
   *
   * Importante: copiar as propriedades de fonte INDIVIDUALMENTE — o shorthand
   * `font` do getComputedStyle volta vazio em vários navegadores, e a medida sai
   * com a fonte errada (posição distante do cursor).
   */
  const calcularPosCursor = (el: HTMLTextAreaElement): { top: number; left: number } => {
    const est = window.getComputedStyle(el);
    const espelho = document.createElement('div');
    espelho.style.position = 'absolute';
    espelho.style.visibility = 'hidden';
    espelho.style.top = '0';
    espelho.style.left = '0';
    espelho.style.margin = '0';
    espelho.style.border = 'none';
    //# Fonte, propriedade por propriedade (o shorthand est.font pode vir vazio).
    espelho.style.fontFamily = est.fontFamily;
    espelho.style.fontSize = est.fontSize;
    espelho.style.fontWeight = est.fontWeight;
    espelho.style.fontStyle = est.fontStyle;
    espelho.style.fontVariant = est.fontVariant;
    espelho.style.letterSpacing = est.letterSpacing;
    espelho.style.lineHeight = est.lineHeight;
    espelho.style.tabSize = est.tabSize;
    espelho.style.textTransform = est.textTransform;
    espelho.style.padding = est.padding;
    espelho.style.boxSizing = 'content-box';
    //# Mesmo comportamento de quebra de linha do textarea (wrap="soft" + CSS do editor).
    espelho.style.whiteSpace = 'pre-wrap';
    espelho.style.overflowWrap = 'anywhere';
    espelho.style.wordBreak = 'normal';
    //# Largura de CONTEÚDO do textarea: clientWidth já exclui borda e scrollbar,
    //# falta só tirar o padding horizontal.
    const larguraConteudo = el.clientWidth - parseFloat(est.paddingLeft) - parseFloat(est.paddingRight);
    espelho.style.width = larguraConteudo + 'px';
    espelho.textContent = el.value.slice(0, el.selectionStart);
    document.body.appendChild(espelho);
    const cursor = document.createElement('span');
    cursor.textContent = '\u200b';
    espelho.appendChild(cursor);
    const r = cursor.getBoundingClientRect();
    document.body.removeChild(espelho);
    const rectEl = el.getBoundingClientRect();
    const alturaLinha = r.height > 0 ? r.height : 18;
    //# O espelho reproduz o texto inteiro a partir do topo da página (com o mesmo padding).
    //# r.top/r.left = pixels do cursor desde o início do CONTEÚDO (inclui o padding do espelho,
    //# igual ao do textarea, por isso se cancelam com rectEl.top/left do textarea).
    //# O scroll interno do textarea esconde esse trecho inicial — compensar.
    const top = rectEl.top + r.top - el.scrollTop + alturaLinha + 4;
    const left = Math.max(8, Math.min(rectEl.left + r.left - el.scrollLeft, window.innerWidth - 270));
    return { top, left };
  };

  const abrirSugestoes = (el: HTMLTextAreaElement, forcar: boolean) => {
    const pos = el.selectionStart;
    const sugs = sugerir(el.value, pos, catalogo, forcar);
    if (sugs.length === 0) { setSugestoes([]); return; }
    setSugestoes(sugs);
    setSelSugestao(0);
    setPosCursor(calcularPosCursor(el));
  };

  const aplicarSugestao = (s: Sugestao) => {
    const el = ref.current;
    if (!el) return;
    const texto = s.inserir ?? s.label;
    const pos = el.selectionStart;
    const antes = el.value.slice(0, pos);
    const depois = el.value.slice(pos);
    //# Se o texto parcial termina com "." (alias./schema.), insere só o nome; senão troca a palavra parcial.
    const mPonto = antes.match(/(\w+)\s*\.\s*(\w*)$/);
    const mPalavra = antes.match(/([A-Za-z_]\w*)$/);
    if (mPonto) {
      const novoValor = antes.slice(0, antes.length - mPonto[2].length) + texto.replace(/^\w+\./, '') + depois;
      aoMudar(novoValor);
      const novaPos = pos - mPonto[2].length + texto.replace(/^\w+\./, '').length;
      requestAnimationFrame(() => { el.setSelectionRange(novaPos, novaPos); el.focus(); });
    } else if (mPalavra) {
      const novoValor = antes.slice(0, antes.length - mPalavra[1].length) + texto + depois;
      aoMudar(novoValor);
      const novaPos = pos - mPalavra[1].length + texto.length;
      requestAnimationFrame(() => { el.setSelectionRange(novaPos, novaPos); el.focus(); });
    } else {
      aoMudar(antes + texto + depois);
      const novaPos = pos + texto.length;
      requestAnimationFrame(() => { el.setSelectionRange(novaPos, novaPos); el.focus(); });
    }
    setSugestoes([]);
    setAbertoManual(false);
  };

  const teclado = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && (e.code === 'Space' || e.key === ' ' || e.keyCode === 32)) {
      e.preventDefault();
      e.stopPropagation();
      setAbertoManual(true);
      //# Catálogo ausente: carrega sob demanda antes de abrir (as sugestões vêm do banco).
      if (!catalogo) { onPrecisaCatalogo?.(); }
      abrirSugestoes(e.currentTarget, true);
      return;
    }

    if (sugestoes.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelSugestao((s) => Math.min(s + 1, sugestoes.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelSugestao((s) => Math.max(s - 1, 0)); return; }
      if (e.key === 'Tab') { e.preventDefault(); aplicarSugestao(sugestoes[selSugestao]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSugestoes([]); setAbertoManual(false); return; }
      if (e.key === 'Enter' && selSugestao > 0) { e.preventDefault(); aplicarSugestao(sugestoes[selSugestao]); return; }
      if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete') {
        setSugestoes([]);
        setAbertoManual(false);
      }
    }

    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onExecutar(); return; }
    if (e.key === 'F5') { e.preventDefault(); onExecutar(); return; }
    if (e.key === 'F9' && onParar) { e.preventDefault(); onParar(); return; }

    if (e.key === 'Tab' && !sugestoes.length) {
      e.preventDefault();
      const el = e.currentTarget;
      const pos = el.selectionStart;
      const novo = el.value.slice(0, pos) + '  ' + el.value.slice(pos);
      aoMudar(novo);
      requestAnimationFrame(() => el.setSelectionRange(pos + 2, pos + 2));
    }
  };

  useEffect(() => { if (sugestoes.length && selSugestao >= sugestoes.length) setSelSugestao(0); }, [sugestoes, selSugestao]);

  //# Quando o catálogo termina de carregar (chegou depois do Ctrl+Space), reabre as sugestões.
  useEffect(() => {
    if (catalogo && abertoManual && !sugestoes.length && ref.current) {
      abrirSugestoes(ref.current, true);
    }
  }, [catalogo]);

  useEffect(() => {
    const fechar = (e: MouseEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.closest('.sql-autocomplete')) return;
      if (ref.current?.contains(alvo)) return;
      setSugestoes([]);
      setAbertoManual(false);
    };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, []);

  return (
    <div className="editor-codigo sql-editor" style={style}>
      <div className="editor-codigo-fundo" aria-hidden>
        <pre ref={fundo}>{tokens.map((t, i) => (t.tipo === 'tx' ? t.texto : <span key={i} className={`tk tk-${t.tipo}`}>{t.texto}</span>))}{'\n'}</pre>
      </div>
      <textarea
        ref={ref}
        value={valor}
        spellCheck={false}
        wrap="soft"
        onChange={(e) => {
          aoMudar(e.target.value);
          sincronizar(e.currentTarget);
          //# Autocomplete: continua aberto se foi aberto com Ctrl+Space, ou abre
          //# automaticamente quando o usuário digita "." (alias. / schema.).
          if (abertoManual) abrirSugestoes(e.currentTarget, true);
          else {
            const v = e.target.value.slice(0, e.target.selectionStart);
            if (/\w\s*\.$/.test(v)) {
              setAbertoManual(true);
              abrirSugestoes(e.currentTarget, true);
            }
          }
        }}
        onScroll={(e) => sincronizar(e.currentTarget)}
        onKeyDown={teclado}
        onKeyUp={(e) => sincronizar(e.currentTarget)}
        onClick={(e) => { sincronizar(e.currentTarget); setSugestoes([]); setAbertoManual(false); }}
        placeholder="SELECT * FROM ... (Ctrl+Enter = executar · Ctrl+Space = autocomplete)"
      />
      {sugestoes.length > 0 && createPortal(
        <div className="sql-autocomplete" style={{ top: posCursor.top, left: posCursor.left }}>
          {sugestoes.map((s, i) => (
            <div
              key={i}
              className={`sql-autocomplete-item${i === selSugestao ? ' sel' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); aplicarSugestao(s); }}
            >
              <span className="sql-autocomplete-icone">{ICONES_TIPO[s.tipo] ?? '●'}</span>
              <span className="sql-autocomplete-label">{s.label}</span>
              <span className="sql-autocomplete-detalhe">{s.detalhe}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}