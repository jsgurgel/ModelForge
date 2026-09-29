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

import { useEffect, useState } from 'react';
import { baixar, gerarPdfDoDiagrama, imprimirPaginas, renderizarPaginas } from '../editor/exportar';
import { CONFIG_PADRAO, ConfigPagina, Orientacao, PAPEIS, Papel } from '../editor/pdf';
import { abaAtiva, setMensagem } from '../editor/store';
import { docDaSelecao, limitarPagina, paginasAImprimir, ModoImpressao } from '../editor/impressao';
import { Modal } from './Modal';

const ESCALAS: { valor: number | 'ajustar'; rotulo: string }[] = [
  { valor: 'ajustar', rotulo: 'Ajustar a uma página' }, { valor: 50, rotulo: '50%' }, { valor: 75, rotulo: '75%' },
  { valor: 100, rotulo: '100%' }, { valor: 150, rotulo: '150%' }, { valor: 200, rotulo: '200%' },
];

/** Pré-visualização de impressão: configuração da página, paginação do diagrama e saída em impressora ou PDF. */
export function PreviaImpressao({ onFechar }: { onFechar: () => void }) {
  const aba = abaAtiva();
  const [cfg, setCfg] = useState<ConfigPagina>(CONFIG_PADRAO);
  const [imgs, setImgs] = useState<string[]>([]);
  const [info, setInfo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [soSelecao, setSoSelecao] = useState(false);
  const [mostrarArea, setMostrarArea] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [grade, setGrade] = useState({ cols: 1, rows: 1 });
  const temSelecao = !!aba && aba.selecao.length > 0;
  const docAlvo = aba ? (soSelecao && temSelecao ? docDaSelecao(aba.doc, aba.selecao) : aba.doc) : null;

  useEffect(() => {
    if (!docAlvo) return;
    let vivo = true;
    setOcupado(true);
    renderizarPaginas(docAlvo, cfg, 48)
      .then((r) => {
        if (!vivo) return;
        setImgs(r.paginas.map((p) => p.canvas.toDataURL('image/png')));
        setGrade({ cols: r.cols, rows: r.rows });
        setPagina((p) => limitarPagina(p, r.paginas.length));
        setInfo(`${r.paginas.length} página(s) - ${r.cols} coluna(s) × ${r.rows} linha(s) - escala ${Math.round(r.escala * 100)}%`);
        setErro('');
      })
      .catch((e: Error) => vivo && setErro(e.message))
      .finally(() => vivo && setOcupado(false));
    return () => { vivo = false; };
  }, [docAlvo, cfg]);

  if (!aba) return null;
  const set = (p: Partial<ConfigPagina>) => setCfg({ ...cfg, ...p });
  const imprimir = async (modo: ModoImpressao) => {
    setOcupado(true);
    try {
      const r = await renderizarPaginas(docAlvo!, cfg, 150);
      const idx = paginasAImprimir(r.paginas.length, pagina, modo);
      if (!imprimirPaginas(docAlvo!, { ...r, paginas: idx.map((i) => r.paginas[i]) })) setErro('O navegador bloqueou a janela de impressão.');
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setOcupado(false); }
  };
  const salvarPdf = async () => {
    setOcupado(true);
    try {
      const blob = await gerarPdfDoDiagrama(docAlvo!, cfg);
      baixar(`${aba.doc.nome}.pdf`, blob, 'application/pdf');
      setMensagem(`PDF gerado: ${aba.doc.nome}.pdf`);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setOcupado(false); }
  };
  const naoProp = cfg.proporcional === false;

  return (
    <Modal
      titulo="Pré-visualização de impressão" onFechar={onFechar} largura={900} fundoFecha
      rodape={<><button onClick={() => imprimir('atual')} disabled={ocupado || !imgs.length}>Imprimir esta página</button><button onClick={() => imprimir('todas')} disabled={ocupado}>Imprimir tudo</button><button onClick={salvarPdf} disabled={ocupado}>Salvar PDF</button><button onClick={onFechar}>Fechar</button></>}
    >
      <div className="dd-barra">
        <label>Papel
          <select value={cfg.papel} onChange={(e) => set({ papel: e.target.value as Papel })}>{PAPEIS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}</select>
        </label>
        <label>Orientação
          <select value={cfg.orientacao} onChange={(e) => set({ orientacao: e.target.value as Orientacao })}>
            <option value="retrato">Retrato</option><option value="paisagem">Paisagem</option>
          </select>
        </label>
        <label>Margem (mm) <input type="number" min={0} max={50} value={cfg.margemMm} style={{ width: 60 }} onChange={(e) => set({ margemMm: Math.max(0, Number(e.target.value) || 0) })} /></label>
        <label>Escala
          <select value={String(cfg.escala)} onChange={(e) => set({ escala: e.target.value === 'ajustar' ? 'ajustar' : Number(e.target.value) })}>
            {ESCALAS.map((s) => <option key={String(s.valor)} value={String(s.valor)}>{s.rotulo}</option>)}
          </select>
        </label>
        <label><input type="checkbox" checked={!naoProp} onChange={(e) => set({ proporcional: e.target.checked })} /> Proporcional</label>
        <label>Colunas <input type="number" min={1} max={20} disabled={!naoProp} value={cfg.colunas ?? 1} style={{ width: 52 }} onChange={(e) => set({ colunas: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} /></label>
        <label>Linhas <input type="number" min={1} max={20} disabled={!naoProp} value={cfg.linhas ?? 1} style={{ width: 52 }} onChange={(e) => set({ linhas: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} /></label>
        <label><input type="checkbox" checked={soSelecao && temSelecao} disabled={!temSelecao} onChange={(e) => setSoSelecao(e.target.checked)} /> Somente a seleção</label>
        <label><input type="checkbox" checked={mostrarArea} onChange={(e) => setMostrarArea(e.target.checked)} /> Mostrar área de impressão</label>
      </div>
      <p className="dica">{ocupado ? 'Gerando pré-visualização...' : info}</p>
      {erro && <p className="dd-erro">{erro}</p>}
      {!mostrarArea && imgs.length > 0 && (
        <div className="dd-barra" role="navigation" aria-label="Páginas">
          <button onClick={() => setPagina(limitarPagina(pagina - 1, imgs.length))} disabled={pagina <= 0}>Anterior</button>
          <span>Página {pagina + 1} de {imgs.length}</span>
          <button onClick={() => setPagina(limitarPagina(pagina + 1, imgs.length))} disabled={pagina >= imgs.length - 1}>Próxima</button>
        </div>
      )}
      <div className="dd-previa">
        {mostrarArea
          ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${grade.cols}, 1fr)`, gap: 0 }} aria-label="Área de impressão">
              {imgs.map((u, i) => <img key={i} src={u} alt={`Página ${i + 1}`} style={{ width: '100%', outline: '1px dashed #c62828', cursor: 'pointer' }} onClick={() => { setPagina(i); setMostrarArea(false); }} />)}
            </div>
          )
          : imgs[pagina] && <figure><img src={imgs[pagina]} alt={`Página ${pagina + 1}`} /><figcaption>Página {pagina + 1}</figcaption></figure>}
      </div>
    </Modal>
  );
}
