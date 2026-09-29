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

/** Grid de resultados SQL com paginação client-side, ordenação e copiar. */
import { useMemo, useState } from 'react';
import { ResultadoComandoSql } from '../api';

const LINHAS_POR_PAGINA = [50, 100, 500, 1000];

export function ResultadoGrid({ r, onExportar }: { r: ResultadoComandoSql; onExportar: (formato: string) => void }) {
  const [ordenarPor, setOrdenarPor] = useState<number | null>(null);
  const [desc, setDesc] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [tamPagina, setTamPagina] = useState(100);
  const [menuExport, setMenuExport] = useState(false);

  const linhas = useMemo(() => {
    if (ordenarPor == null) return r.linhas;
    const idx = ordenarPor;
    const copia = [...r.linhas];
    copia.sort((a, b) => {
      const va = a[idx], vb = b[idx];
      if (va == null && vb == null) return 0;
      if (va == null) return desc ? 1 : -1;
      if (vb == null) return desc ? -1 : 1;
      if (typeof va === 'number' && typeof vb === 'number') return desc ? vb - va : va - vb;
      return desc ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
    });
    return copia;
  }, [r.linhas, ordenarPor, desc]);

  const totalPaginas = Math.max(1, Math.ceil(linhas.length / tamPagina));
  const inicio = pagina * tamPagina;
  const visiveis = linhas.slice(inicio, inicio + tamPagina);

  const ordenar = (i: number) => {
    if (ordenarPor === i) setDesc(!desc);
    else { setOrdenarPor(i); setDesc(false); }
    setPagina(0);
  };

  const copiarCelula = (v: unknown) => {
    navigator.clipboard?.writeText(v == null ? '' : String(v)).catch(() => undefined);
  };

  const copiarTudo = () => {
    const csv = [r.colunas.join('\t'), ...r.linhas.map((l) => l.map((v) => v == null ? '' : String(v)).join('\t'))].join('\n');
    navigator.clipboard?.writeText(csv).catch(() => undefined);
  };

  return (
    <div className="sql-resultado">
      <div className="sql-resultado-barra">
        <span className="dica">{r.linhas.length} linha(s){r.truncado ? ' (cortado)' : ''}{r.afetadas != null && !r.colunas.length ? ` · ${r.afetadas} afetadas` : ''} · {r.ms} ms</span>
        <div className="sql-resultado-acoes">
          <button onClick={copiarTudo} disabled={!r.colunas.length}>Copiar</button>
          <button onClick={() => setMenuExport((v) => !v)} disabled={!r.colunas.length}>Exportar ▾</button>
          {menuExport && (
            <div className="sql-export-menu" onMouseLeave={() => setMenuExport(false)}>
              {(['csv', 'json', 'sql', 'markdown', 'html'] as const).map((f) => (
                <button key={f} onClick={() => { onExportar(f); setMenuExport(false); }}>{f.toUpperCase()}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      {r.colunas.length > 0 ? (
        <div className="sql-resultado-grid">
          <table className="ed-campos">
            <thead>
              <tr>{r.colunas.map((c, i) => (
                <th key={i} onClick={() => ordenar(i)} className="sql-th" title="Clique para ordenar">
                  {c}{ordenarPor === i ? (desc ? ' ▼' : ' ▲') : ''}
                </th>
              ))}</tr>
            </thead>
            <tbody>
              {visiveis.map((l, i) => (
                <tr key={i}>
                  {l.map((v, j) => (
                    <td key={j} onClick={() => copiarCelula(v)} title="Clique para copiar" className="sql-td">
                      {v == null ? <i>null</i> : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="sql-paginacao">
            <button onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0}>◀</button>
            <span>{pagina + 1} / {totalPaginas}</span>
            <button onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))} disabled={pagina >= totalPaginas - 1}>▶</button>
            <select value={tamPagina} onChange={(e) => { setTamPagina(Number(e.target.value)); setPagina(0); }}>
              {LINHAS_POR_PAGINA.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      ) : (
        <div className="dica" style={{ padding: 8 }}>Comando executado. {r.afetadas != null ? `${r.afetadas} linha(s) afetada(s).` : ''}</div>
      )}
    </div>
  );
}