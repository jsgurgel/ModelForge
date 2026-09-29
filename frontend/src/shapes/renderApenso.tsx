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

import { ReactNode, CSSProperties } from 'react';
import { layoutApenso, opcoesApenso } from '../editor/textoApenso';
import { Ligacao } from '../editor/types';

/** Texto apenso à linha (fluxo, atividade, livre): caixa opcional (Livre), título, alinhamento e cor do texto. */
export function TextoApensoSvg({ l, texto, meio, tam, negrito, estilo, apenso }: {
  l: Ligacao; texto: string; meio: { x: number; y: number }; tam: number; negrito: boolean; estilo: CSSProperties; apenso: 'fluxo' | 'atividade' | 'livre';
}): ReactNode {
  const o = opcoesApenso(l);
  const lay = layoutApenso(l, texto, tam, tam * (negrito ? 0.62 : 0.56), meio);
  const cx = lay.caixa;
  const caixa = apenso === 'livre' && o.tipo !== 'embranco';
  const idG = `ag-${l.id}`;
  const fill = o.gradiente ? `url(#${idG})` : o.corFundo;
  const rx = o.tipo === 'arredondado' ? 8 : 0;
  const cor = o.corTexto ?? (estilo.fill as string | undefined);
  const halo = !caixa ? { paintOrder: 'stroke', stroke: 'var(--forma-branco)', strokeWidth: 3 } : {};
  return (
    <g data-apenso={l.id}>
      {caixa && (
        <>
          {o.gradiente && (
            <defs>
              <linearGradient id={idG} x1="0" y1="0" x2={o.gradDir === 'Horizontal' ? 1 : 0} y2={o.gradDir === 'Horizontal' ? 0 : 1}>
                <stop offset="0%" stopColor={o.gradCor1} />
                <stop offset="100%" stopColor={o.gradCor2} />
              </linearGradient>
            </defs>
          )}
          {o.sombra && (o.tipo === 'retangulo' || o.tipo === 'arredondado') && <rect x={cx.x + 3} y={cx.y + 3} width={cx.w} height={cx.h} rx={rx} fill={o.corSombra} fillOpacity={0.5} />}
          <rect x={cx.x} y={cx.y} width={cx.w} height={cx.h} rx={rx} fill={fill} fillOpacity={o.alfa / 100} stroke="var(--forma-borda)" />
          {o.gradiente && o.gradDetalhe && (o.tipo === 'retangulo' || o.tipo === 'arredondado') && <line x1={cx.x + cx.w * 0.25} x2={cx.x + cx.w * 0.75} y1={cx.y + 2} y2={cx.y + 2} stroke={o.gradCorDetalhe} strokeWidth={2} />}
        </>
      )}
      {lay.titulo && <text x={lay.titulo.x} y={lay.titulo.y} textAnchor="middle" dominantBaseline="central" className="forma-texto" style={{ ...estilo, fontWeight: 700, fill: cor }}>{lay.titulo.texto}</text>}
      <text textAnchor={lay.anchor} dominantBaseline="central" className="forma-texto" style={{ ...estilo, fill: cor, ...halo }}>
        {lay.linhas.map((t, i) => <tspan key={i} x={lay.x} y={lay.y0 + i * lay.passo}>{t || ' '}</tspan>)}
      </text>
    </g>
  );
}
