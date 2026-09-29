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

import { ReactNode } from 'react';
import { caminhoDoItem } from '../editor/desenhador';
import {
  ItemDrawer, areaDoDrawer, formatarUnidade, geometriaDoItem, itensDoDrawer, medidasDoDrawer, reguaHorizontal, reguaVertical, Segmento,
} from '../editor/drawer';
import { Diagrama, Forma } from '../editor/types';

/**
 * Desenho do LivreDrawer: quadro (borda/cantos/gradiente), réguas com unidade de medida,
 * título e itens (Retângulo, Elipse, Curva, Arco, Path, Imagem) recortados à área interna.
 */

const num = (v: unknown, pad: number) => (typeof v === 'number' && Number.isFinite(v) ? v : pad);

function Regua({ seg, cor }: { seg: Segmento[]; cor: string }) {
  return <>{seg.map((s, i) => <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={cor} strokeWidth={1} shapeRendering="crispEdges" />)}</>;
}

function itemLegado(it: ItemDrawer, i: number, pintura: string, alfa: number | undefined): ReactNode {
  const fill = it.preencher ? pintura : 'none';
  const comum = { fill, stroke: pintura, strokeWidth: it.largura || 1, fillOpacity: it.preencher ? alfa : undefined };
  if (it.tipo === 'linha') {
    const [a, b] = it.pontos ?? [];
    return a && b ? <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={pintura} strokeWidth={it.largura || 1} /> : null;
  }
  const d = caminhoDoItem(it as unknown as Parameters<typeof caminhoDoItem>[0]);
  return <path key={i} d={d} {...comum} fill={it.tipo === 'polilinha' ? fill : 'none'} strokeLinejoin="round" strokeLinecap="round" />;
}

export function DrawerSvg({ f, doc, gradiente, c1, c2, dir, alfa }: {
  f: Forma; doc: Diagrama; gradiente: boolean; c1: string; c2: string; dir: string; alfa: number;
}): ReactNode {
  const m = medidasDoDrawer(f);
  const A = areaDoDrawer(f, m);
  const v = { L: A.L, T: A.T, W: A.W, H: A.H };
  const itens = itensDoDrawer(f);
  const corBorda = f.corBorda || 'var(--forma-borda)';
  const corTexto = f.corTexto || 'var(--forma-texto)';
  const fonte = { ...doc.fonte, ...(f.fonte ?? {}) };
  const estiloTexto = { fontFamily: fonte.nome, fontSize: fonte.tamanho, fontWeight: fonte.negrito ? 700 : 400, fontStyle: fonte.italico ? 'italic' : 'normal', fill: corTexto } as const;
  const arred = m.roundrect > 0;
  const rr = m.roundrect / 2;
  const idG = `dg-${f.id}`;
  const idC = `dc-${f.id}`;
  const vertical = dir !== 'Horizontal';
  const grad = (id: string, a: string, b: string, d: string) => (
    <linearGradient key={id} id={id} gradientUnits="userSpaceOnUse" x1={A.L} y1={A.T} x2={d === 'Horizontal' ? A.L + A.W : A.L} y2={d === 'Horizontal' ? A.T : A.T + A.H} spreadMethod="reflect">
      <stop offset="0%" stopColor={a} />
      <stop offset="100%" stopColor={b} />
    </linearGradient>
  );
  const margemTitulo = fonte.tamanho * 1.25 + 8;
  const pinturaDoQuadro = gradiente ? `url(#${idG})` : corTexto;

  const nos = itens.map((it, i) => {
    let pintura: string;
    let op: number | undefined;
    if (it.herdar) {
      pintura = pinturaDoQuadro;
      op = gradiente ? alfa : undefined;
    } else if (it.gradiente) {
      pintura = `url(#${idG}-${i})`;
    } else {
      pintura = it.cor || '#000000';
    }
    if (it.expr === undefined) return itemLegado(it, i, pintura, op);
    const g = geometriaDoItem(it, v);
    const estilo = it.preencher ? { fill: pintura, fillOpacity: op } : { fill: 'none', stroke: pintura, strokeWidth: 1 };
    switch (g.forma) {
      case 'retangulo': return <rect key={i} x={g.x} y={g.y} width={Math.max(0, g.w)} height={Math.max(0, g.h)} rx={g.rx} ry={g.ry} {...estilo} />;
      case 'elipse': return <ellipse key={i} cx={g.x + g.w / 2} cy={g.y + g.h / 2} rx={Math.max(0, g.w / 2)} ry={Math.max(0, g.h / 2)} {...estilo} />;
      case 'caminho': return <path key={i} d={g.d} {...estilo} />;
      case 'imagem': return it.src ? <image key={i} href={it.src} x={g.x + 2} y={g.y + 2} width={Math.max(1, g.w - 4)} height={Math.max(1, g.h - 4)} preserveAspectRatio="none" /> : null;
      default: return <text key={i} x={A.L + 5} y={A.T + 5} style={estiloTexto}>?</text>;
    }
  });

  const cxTopo = A.L + A.W / 2;
  const cyLado = A.T + A.H / 2;
  const txtH = (topo: boolean) => (
    <text x={cxTopo} y={topo ? m.margem / 2 : f.h - m.margem / 2} textAnchor="middle" dominantBaseline="central" style={estiloTexto}>{formatarUnidade(A.W, m)}</text>
  );
  const txtV = (dir_: boolean) => {
    const x = dir_ ? f.w - m.margem / 2 : m.margem / 2;
    return (
      <text x={x} y={cyLado} transform={`rotate(${dir_ ? 90 : -90} ${x} ${cyLado})`} textAnchor="middle" dominantBaseline="central" style={{ ...estiloTexto, fontWeight: 700 }}>
        {formatarUnidade(A.H, m)}
      </text>
    );
  };

  return (
    <g>
      <defs>
        {gradiente && grad(idG, c1, c2, vertical ? 'Vertical' : 'Horizontal')}
        {itens.map((it, i) => (it.gradiente && !it.herdar ? grad(`${idG}-${i}`, it.grad1 || it.cor || '#000000', it.cor2 || '#cccccc', it.gradDir ?? 'Vertical') : null))}
        <clipPath id={idC}>
          <rect x={A.L} y={A.T} width={Math.max(0, A.W)} height={Math.max(0, A.H)} rx={arred && m.pintarBorda ? rr : undefined} ry={arred && m.pintarBorda ? rr : undefined} />
        </clipPath>
      </defs>
      {gradiente && <rect x={A.L + 1} y={A.T + 1} width={Math.max(0, A.W)} height={Math.max(0, A.H)} rx={arred && m.pintarBorda ? rr : undefined} ry={arred && m.pintarBorda ? rr : undefined} fill={`url(#${idG})`} fillOpacity={alfa} />}
      {m.pintarBorda && (arred ? (
        <rect x={A.L} y={A.T} width={A.W} height={A.H} rx={rr} ry={rr} fill="none" stroke={corBorda} />
      ) : (
        <>
          <rect x={A.L} y={A.T} width={A.W} height={A.H} fill="none" stroke="#a9a9a9" />
          <rect x={A.L} y={A.T} width={A.W + 1} height={A.H + 1} fill="none" stroke="#808080" />
          <rect x={A.L} y={A.T} width={Math.max(0, A.W - 1)} height={Math.max(0, A.H - 1)} fill="none" stroke={corBorda} />
        </>
      ))}
      {m.delimite && <line x1={A.L + 1} y1={A.T + margemTitulo} x2={A.L + A.W - 2} y2={A.T + margemTitulo} stroke={corBorda} />}
      {f.texto && (
        <text x={cxTopo} y={A.T + 4} textAnchor="middle" dominantBaseline="hanging" style={estiloTexto}>{f.texto}</text>
      )}
      <g clipPath={`url(#${idC})`}>{nos}</g>
      {m.topo && <Regua seg={reguaHorizontal(f, m, true)} cor={m.corRegua} />}
      {m.baixo && <Regua seg={reguaHorizontal(f, m, false)} cor={m.corRegua} />}
      {m.dir && <Regua seg={reguaVertical(f, m, true)} cor={m.corRegua} />}
      {m.esq && <Regua seg={reguaVertical(f, m, false)} cor={m.corRegua} />}
      {m.mostrarTexto && m.topo && txtH(true)}
      {m.mostrarTexto && m.baixo && txtH(false)}
      {m.mostrarTexto && m.dir && txtV(true)}
      {m.mostrarTexto && m.esq && txtV(false)}
    </g>
  );
}
