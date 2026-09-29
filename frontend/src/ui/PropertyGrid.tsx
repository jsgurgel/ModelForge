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

import { Linguagem } from '../editor/realce';
import { EditorCodigo } from './Codigo';
import { useState } from 'react';
import { useConfig } from '../editor/config';
import { CorPicker } from './CorPicker';
import { FontChooser } from './FontChooser';
import { dicaPorRotulo, prefixosDoGrupo } from './dicas';
import { FonteSel } from './fontesCores';
import './inspetor.css';

export type EditorProp =
  | { tipo: 'texto' }
  | { tipo: 'textarea' }
  | { tipo: 'codigo'; linguagem: Linguagem }
  | { tipo: 'numero'; min?: number; max?: number; passo?: number }
  | { tipo: 'bool' }
  | { tipo: 'cor' }
  | { tipo: 'select'; opcoes: string[] }
  | { tipo: 'leitura' }
  | { tipo: 'botao'; rotulo: string }
  | { tipo: 'fonte'; fonte: FonteSel; padrao?: FonteSel; aoMudarFonte: (f: FonteSel) => void };

export interface Prop {
  rotulo: string;
  valor?: string | number | boolean;
  editor: EditorProp;
  aoMudar?: (v: string | number | boolean) => void;
  aoClicar?: () => void;
  /** Texto da dica (tooltip); sem ele vale o achado pelo rótulo (dicas.json). */
  dica?: string;
  /** Identificador da linha para as condições. */
  id?: string;
  /** Linha visível mas não editável (condição não satisfeita). */
  desabilitado?: boolean;
  /** Sugestões para linhas de texto livre (datalist): o valor pode ser qualquer texto. */
  sugestoes?: string[];
  /** Forçar habilitado/desabilitado: vence as condições. */
  forcar?: 'habilitar' | 'desabilitar';
}

export interface Grupo {
  titulo: string;
  props: Prop[];
}

/** Efetivamente desabilitada: condição não satisfeita ou forçada (forcar vence). */
export const estaDesabilitada = (p: Prop): boolean => (p.forcar === 'habilitar' ? false : p.forcar === 'desabilitar' ? true : !!p.desabilitado);

function Celula({ p }: { p: Prop }) {
  const e = p.editor;
  const off = estaDesabilitada(p);
  const aplicar = (v: string | number | boolean) => p.aoMudar?.(v);
  switch (e.tipo) {
    case 'leitura':
      return <span className="prop-leitura">{String(p.valor ?? '')}</span>;
    case 'botao':
      return <button className="prop-botao" disabled={off} onClick={p.aoClicar}>{e.rotulo}</button>;
    case 'fonte':
      return <FontChooser valor={e.fonte} padrao={e.padrao} aoMudar={e.aoMudarFonte} desabilitado={off} />;
    case 'bool':
      return <input type="checkbox" checked={!!p.valor} disabled={off} onChange={(ev) => aplicar(ev.target.checked)} />;
    case 'cor':
      return <CorPicker valor={typeof p.valor === 'string' ? p.valor : ''} aoMudar={aplicar} desabilitado={off} />;
    case 'select':
      return (
        <select value={String(p.valor ?? '')} disabled={off} onChange={(ev) => aplicar(ev.target.value)}>
          {e.opcoes.map((o) => <option key={o}>{o}</option>)}
        </select>
      );
    case 'numero':
      return (
        <input
          type="number" disabled={off} value={Number(p.valor ?? 0)} min={e.min} max={e.max} step={e.passo ?? 1}
          onChange={(ev) => ev.target.value !== '' && aplicar(Number(ev.target.value))}
        />
      );
    case 'codigo':
      return <EditorCodigo valor={String(p.valor ?? '')} aoMudar={aplicar} linguagem={e.linguagem} rows={6} />;
    case 'textarea':
      return <textarea rows={2} disabled={off} value={String(p.valor ?? '')} onChange={(ev) => aplicar(ev.target.value)} />;
    default:
      if (p.sugestoes?.length) {
        const lista = `sug-${p.rotulo.replace(/\W+/g, '_')}`;
        return (
          <>
            <input list={lista} disabled={off} value={String(p.valor ?? '')} onChange={(ev) => aplicar(ev.target.value)} />
            <datalist id={lista}>{p.sugestoes.map((o) => <option key={o} value={o} />)}</datalist>
          </>
        );
      }
      return <input disabled={off} value={String(p.valor ?? '')} onChange={(ev) => aplicar(ev.target.value)} />;
  }
}

/** Dica efetiva de uma linha: a explícita ou a pelo rótulo (com o grupo desempatando rótulos repetidos). */
export const dicaDaLinha = (p: Prop, titulo: string): string => p.dica ?? dicaPorRotulo(p.rotulo, prefixosDoGrupo(titulo));

/** Grade "rótulo | valor" com grupos recolhíveis e painel de dicas - o Inspector. */
export function PropertyGrid({ grupos }: { grupos: Grupo[] }) {
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [selecionada, setSelecionada] = useState<{ chave: string; rotulo: string; dica: string } | null>(null);
  const cfg = useConfig();
  const alternar = (t: string) =>
    setFechados((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  return (
    <div className="grade-props">
      {grupos.map((g, gi) => (
        <div key={`${g.titulo}#${gi}`}>
          <div className="grupo" onClick={() => alternar(g.titulo)}>
            <span className="grupo-sinal">{fechados.has(g.titulo) ? '+' : '−'}</span>
            {g.titulo}
          </div>
          {!fechados.has(g.titulo) &&
            g.props.map((p, pi) => {
              const chave = `${gi}:${pi}:${p.rotulo}`;
              const dica = dicaDaLinha(p, g.titulo);
              return (
                <div
                  className={`linha-prop${estaDesabilitada(p) ? ' desab' : ''}${selecionada?.chave === chave ? ' sel' : ''}`}
                  key={`${p.rotulo}#${pi}`}
                  title={cfg.dicas && dica ? dica : undefined}
                  onFocusCapture={() => setSelecionada({ chave, rotulo: p.rotulo, dica })}
                  onMouseDownCapture={() => setSelecionada({ chave, rotulo: p.rotulo, dica })}
                >
                  <div className="prop-rotulo">{p.rotulo}</div>
                  <div className="prop-valor"><Celula p={p} /></div>
                </div>
              );
            })}
        </div>
      ))}
      {cfg.dicas && (
        <div className="painel-dica" aria-live="polite">
          {selecionada ? (
            <>
              <div className="dica-titulo">{selecionada.rotulo}</div>
              {selecionada.dica}
            </>
          ) : ''}
        </div>
      )}
    </div>
  );
}
