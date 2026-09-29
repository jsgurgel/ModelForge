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
import { ItemDesenho, TipoItemDesenho, caixaDosItens, itemNovo, itensDoDesenho, simplificar } from '../editor/desenhador';
import { Ponto } from '../editor/geometry';
import { moverItem } from '../editor/logico';
import { atualizarForma } from '../editor/ops';
import { abaAtiva, mutar } from '../editor/store';
import { Modal } from './Modal';

type Ferramenta = 'selecionar' | TipoItemDesenho;

const FERRAMENTAS: { valor: Ferramenta; rotulo: string }[] = [
  { valor: 'selecionar', rotulo: 'Selecionar/mover' },
  { valor: 'retangulo', rotulo: 'Retângulo' },
  { valor: 'elipse', rotulo: 'Elipse' },
  { valor: 'linha', rotulo: 'Linha' },
  { valor: 'polilinha', rotulo: 'Polígono (duplo clique termina)' },
  { valor: 'caminho', rotulo: 'Mão livre' },
];

const ROTULO_ITEM: Record<TipoItemDesenho, string> = { retangulo: 'Retângulo', elipse: 'Elipse', linha: 'Linha', caminho: 'Mão livre', polilinha: 'Polígono' };

/** Desenha os itens num contexto 2D (o mesmo desenho que o SVG do diagrama mostra). */
function pintar(g: CanvasRenderingContext2D, itens: ItemDesenho[], w: number, h: number, sel: number, previa?: ItemDesenho) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  const todos = previa ? [...itens, previa] : itens;
  todos.forEach((it, i) => {
    g.strokeStyle = it.cor;
    g.fillStyle = it.cor;
    g.lineWidth = it.largura || 1;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    if (it.tipo === 'retangulo') g.rect(it.x, it.y, it.w, it.h);
    else if (it.tipo === 'elipse') g.ellipse(it.x + it.w / 2, it.y + it.h / 2, Math.max(0.1, it.w / 2), Math.max(0.1, it.h / 2), 0, 0, Math.PI * 2);
    else {
      (it.pontos ?? []).forEach((p, k) => (k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      if (it.tipo === 'polilinha' && it.preencher) g.closePath();
    }
    if (it.preencher && it.tipo !== 'linha' && it.tipo !== 'caminho') g.fill();
    g.stroke();
    if (i === sel) {
      const c = caixaDosItens([it]);
      if (c) { g.save(); g.setLineDash([4, 3]); g.strokeStyle = '#d9480f'; g.lineWidth = 1; g.strokeRect(c.x - 2, c.y - 2, c.w + 4, c.h + 4); g.restore(); }
    }
  });
}

const deslocar = (it: ItemDesenho, dx: number, dy: number): ItemDesenho => ({
  ...it, x: it.x + dx, y: it.y + dy, pontos: it.pontos?.map((p) => ({ x: p.x + dx, y: p.y + dy })),
});

function acertou(it: ItemDesenho, p: Ponto): boolean {
  const c = caixaDosItens([it]);
  if (!c) return false;
  return p.x >= c.x - 3 && p.x <= c.x + c.w + 3 && p.y >= c.y - 3 && p.y <= c.y + c.h + 3;
}

/** Editor de desenho livre: formas básicas e mão livre num canvas, na escala da forma. */
export function DesenhadorEditor({ id, onFechar }: { id: string; onFechar: () => void }) {
  const doc = abaAtiva()!.doc;
  const original = doc.formas.find((f) => f.id === id);
  const [itens, setItens] = useState<ItemDesenho[]>(() => (original ? structuredClone(itensDoDesenho(original)) : []));
  const [ferr, setFerr] = useState<Ferramenta>('retangulo');
  const [cor, setCor] = useState('#000000');
  const [preencher, setPreencher] = useState(true);
  const [largura, setLargura] = useState(1);
  const [sel, setSel] = useState(-1);
  const [tam, setTam] = useState({ w: original?.w ?? 250, h: original?.h ?? 150 });
  const [previa, setPrevia] = useState<ItemDesenho | undefined>();
  const cv = useRef<HTMLCanvasElement>(null);
  const arrasto = useRef<{ ini: Ponto; ultimo: Ponto; pontos: Ponto[]; idx: number } | null>(null);
  const poli = useRef<Ponto[]>([]);

  useEffect(() => {
    const g = cv.current?.getContext('2d');
    if (g) pintar(g, itens, tam.w, tam.h, sel, previa);
  }, [itens, sel, previa, tam]);

  if (!original) return null;

  const ponto = (e: React.PointerEvent<HTMLCanvasElement>): Ponto => {
    const r = cv.current!.getBoundingClientRect();
    return { x: Math.round(((e.clientX - r.left) / r.width) * tam.w), y: Math.round(((e.clientY - r.top) / r.height) * tam.h) };
  };
  const base = (tipo: TipoItemDesenho, a: Ponto, b: Ponto) => ({ ...itemNovo(tipo, a, b, cor, preencher), largura });

  const fim = () => {
    if (poli.current.length >= 2) {
      const pts = poli.current;
      const it = { ...itemNovo('polilinha', pts[0], pts[pts.length - 1], cor, preencher), largura, pontos: pts };
      const c = caixaDosItens([it])!;
      setItens((x) => [...x, { ...it, x: c.x, y: c.y, w: c.w, h: c.h }]);
    }
    poli.current = [];
    setPrevia(undefined);
  };

  const aoApertar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = ponto(e);
    cv.current!.setPointerCapture(e.pointerId);
    if (ferr === 'selecionar') {
      let idx = -1;
      for (let i = itens.length - 1; i >= 0; i--) if (acertou(itens[i], p)) { idx = i; break; }
      setSel(idx);
      arrasto.current = idx >= 0 ? { ini: p, ultimo: p, pontos: [], idx } : null;
      return;
    }
    if (ferr === 'polilinha') {
      poli.current = [...poli.current, p];
      setPrevia({ ...itemNovo('polilinha', p, p, cor, false), largura, pontos: [...poli.current, p] });
      return;
    }
    arrasto.current = { ini: p, ultimo: p, pontos: [p], idx: -1 };
  };
  const aoMover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = arrasto.current;
    const p = ponto(e);
    if (ferr === 'polilinha' && poli.current.length) {
      setPrevia({ ...itemNovo('polilinha', p, p, cor, false), largura, pontos: [...poli.current, p] });
      return;
    }
    if (!a) return;
    if (ferr === 'selecionar') {
      const dx = p.x - a.ultimo.x;
      const dy = p.y - a.ultimo.y;
      a.ultimo = p;
      setItens((x) => x.map((it, i) => (i === a.idx ? deslocar(it, dx, dy) : it)));
      return;
    }
    a.ultimo = p;
    if (ferr === 'caminho') {
      a.pontos.push(p);
      setPrevia({ ...itemNovo('caminho', a.ini, p, cor, false), largura, pontos: a.pontos.slice() });
    } else {
      setPrevia(base(ferr, a.ini, p));
    }
  };
  const aoSoltar = () => {
    const a = arrasto.current;
    arrasto.current = null;
    if (!a || ferr === 'selecionar' || ferr === 'polilinha') return;
    if (Math.hypot(a.ultimo.x - a.ini.x, a.ultimo.y - a.ini.y) < 3) { setPrevia(undefined); return; }
    if (ferr === 'caminho') {
      const pts = simplificar(a.pontos);
      const c = caixaDosItens([{ ...itemNovo('caminho', a.ini, a.ultimo, cor, false), pontos: pts }])!;
      setItens((x) => [...x, { ...itemNovo('caminho', a.ini, a.ultimo, cor, false), largura, pontos: pts, x: c.x, y: c.y, w: c.w, h: c.h }]);
    } else {
      setItens((x) => [...x, base(ferr, a.ini, a.ultimo)]);
    }
    setPrevia(undefined);
  };

  const aplicar = () => {
    mutar((d) => atualizarForma(d, id, { w: tam.w, h: tam.h, props: { ...original.props, tipoDesenho: original.kind === 'desenhador' ? 'livre' : original.props.tipoDesenho, itens } }));
    onFechar();
  };
  const ajustar = () => {
    const c = caixaDosItens(itens);
    if (!c) return;
    const dx = -c.x + 2;
    const dy = -c.y + 2;
    setItens(itens.map((it) => deslocar(it, dx, dy)));
    setTam({ w: Math.max(20, Math.round(c.w) + 4), h: Math.max(20, Math.round(c.h) + 4) });
  };

  return (
    <Modal titulo="Editor de desenho" onFechar={onFechar} largura={920} rodape={<><button onClick={aplicar}>OK</button><button onClick={onFechar}>Cancelar</button></>}>
      <div className="dd-barra">
        <label>Ferramenta
          <select value={ferr} onChange={(e) => { fim(); setFerr(e.target.value as Ferramenta); }}>
            {FERRAMENTAS.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
          </select>
        </label>
        <label>Cor <input type="color" value={cor} onChange={(e) => { setCor(e.target.value); if (sel >= 0) setItens(itens.map((it, i) => (i === sel ? { ...it, cor: e.target.value } : it))); }} /></label>
        <label><input type="checkbox" checked={preencher} onChange={(e) => { setPreencher(e.target.checked); if (sel >= 0) setItens(itens.map((it, i) => (i === sel ? { ...it, preencher: e.target.checked } : it))); }} /> Preencher</label>
        <label>Traço <input type="number" min={1} max={20} value={largura} style={{ width: 56 }} onChange={(e) => setLargura(Math.max(1, Number(e.target.value) || 1))} /></label>
        <button onClick={fim} disabled={!previa || ferr !== 'polilinha'}>Concluir polígono</button>
        <button onClick={ajustar} disabled={!itens.length} title="Recorta a caixa da forma ao tamanho do desenho">Ajustar ao desenho</button>
        <button onClick={() => { setItens([]); setSel(-1); }} disabled={!itens.length}>Limpar</button>
      </div>
      <div className="dd-desenho">
        <canvas
          ref={cv} width={tam.w} height={tam.h} style={{ width: Math.min(tam.w, 640), height: (Math.min(tam.w, 640) / tam.w) * tam.h }}
          onPointerDown={aoApertar} onPointerMove={aoMover} onPointerUp={aoSoltar} onDoubleClick={fim}
        />
        <div className="dd-desenho-lista" role="listbox" aria-label="Itens do desenho">
          {itens.map((it, i) => (
            <div key={i} className={i === sel ? 'sel' : ''} onClick={() => setSel(i)}>{i + 1}. {ROTULO_ITEM[it.tipo]} <span style={{ background: it.cor, display: 'inline-block', width: 10, height: 10, border: '1px solid #666' }} /></div>
          ))}
          {!itens.length && <div className="dica">Desenhe no quadro ao lado.</div>}
        </div>
      </div>
      {sel >= 0 && (
        <div className="dd-barra" style={{ marginTop: 8 }}>
          <button onClick={() => { setItens(moverItem(itens, sel, 1)); setSel(Math.min(itens.length - 1, sel + 1)); }}>Trazer para frente</button>
          <button onClick={() => { setItens(moverItem(itens, sel, -1)); setSel(Math.max(0, sel - 1)); }}>Enviar para trás</button>
          <button onClick={() => { setItens(itens.filter((_, i) => i !== sel)); setSel(-1); }}>Excluir item</button>
        </div>
      )}
    </Modal>
  );
}
