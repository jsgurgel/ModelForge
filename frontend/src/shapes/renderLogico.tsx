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

import { useMemo } from 'react';
import { corpoDoObjetoLogico } from '../editor/corpoLogico';
import { retanguloDoItem } from '../editor/itemSel';
import { propsTabela } from '../editor/logico';
import { realceDoRoque, useRoque } from '../editor/roque';
import { Diagrama, Forma } from '../editor/types';
import { quebrarLinhas } from './texto';

const ALT_TITULO = 24;

/** Corpo de View/Sequence/Function/Procedure/Enum/Domain: rótulo "(tipo)", resumo e SQL. */
export function CorpoObjetoLogico({ f, doc, tam, negrito }: { f: Forma; doc: Diagrama; tam: number; negrito: boolean }) {
  const c = corpoDoObjetoLogico(f);
  if (!c) return null;
  const fs = Math.max(6, tam - 2);
  const alt = Math.round(fs * 1.25);
  const x = 4;
  const y = ALT_TITULO + 3;
  const w = f.w - 8;
  const h = f.h - ALT_TITULO - 6;
  if (w <= 0 || h <= 0) return null;
  const fill = f.corTexto || 'var(--forma-texto)';
  const linhas = [c.rotulo, ...c.linhas];
  const topoCorpo = linhas.length * alt + 4;
  const corpo = c.corpo ? quebrarLinhas(c.corpo, w, fs, negrito) : [];
  return (
    <svg x={x} y={y} width={w} height={h} overflow="hidden">
      <g className="campo-texto" style={{ fontSize: fs, fontFamily: doc.fonte.nome, fill }}>
        {linhas.map((l, i) => <text key={i} x={0} y={(i + 1) * alt - 3}>{l}</text>)}
        {corpo.length > 0 && topoCorpo + alt <= h && corpo.map((l, i) => (
          <text key={`c${i}`} x={0} y={topoCorpo + (i + 1) * alt - 3} xmlSpace="preserve" style={{ whiteSpace: 'pre' }}>{l}</text>
        ))}
      </g>
    </svg>
  );
}

/**
 * "Roqued": caixa pontilhada arredondada + see.png nos campos/IR realçados desta tabela,
 * quando o mouse está sobre uma LogicoLinha ou sobre uma IR de FK.
 */
export function RoqueTabela({ f, doc, tam }: { f: Forma; doc: Diagrama; tam: number }) {
  const alvo = useRoque();
  const realce = useMemo(() => (alvo ? realceDoRoque(doc, alvo) : null), [alvo, doc]);
  if (!realce) return null;
  const p = propsTabela(f);
  const itens = [
    ...p.campos.filter((c) => realce.campos.has(c.id)).map((c) => ({ tipo: 'campo' as const, id: c.id })),
    ...p.constraints.filter((c) => realce.constraints.has(c.id)).map((c) => ({ tipo: 'constraint' as const, id: c.id })),
  ];
  if (!itens.length) return null;
  return (
    <g pointerEvents="none">
      {itens.map((it) => {
        const r = retanguloDoItem(f, { formaId: f.id, ...it }, tam);
        if (!r) return null;
        const img = 16;
        return (
          <g key={`${it.tipo}${it.id}`}>
            <rect x={r.x + 1} y={r.y + 1} width={Math.max(0, r.w - 2)} height={Math.max(0, r.h - 2)} rx={4} fill="none" stroke="var(--selecao)" strokeWidth={2} strokeDasharray="1 2" />
            {f.w > img && r.w > img + 4 && <image href="/icons/see.png" x={r.x + r.w - img - 2} y={r.y + (r.h - img) / 2} width={img} height={img} />}
          </g>
        );
      })}
    </g>
  );
}
