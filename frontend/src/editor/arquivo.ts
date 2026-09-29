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

import { abrirDialogo } from '../ui/dialogos';
import { baixar } from './exportar';
import { Diagrama, TIPOS, VERSAO_DIAGRAMA, diagramaVazio, novoId } from './types';

export const EXTENSAO = 'mfd.json';
export const EXTENSAO_PACOTE = 'mfp.json';

/** Aceita só o que o editor sabe desenhar; ignora campos desconhecidos. */
export function lerDiagrama(bruto: unknown): Diagrama {
  const o = bruto as Partial<Diagrama> | null;
  if (!o || typeof o !== 'object' || !TIPOS.includes(o.tipo as never) || !Array.isArray(o.formas)) {
    throw new Error('arquivo não é um diagrama do ModelForge');
  }
  const base = diagramaVazio(o.tipo!, typeof o.nome === 'string' && o.nome.trim() ? o.nome : 'Diagrama');
  return {
    ...base,
    ...o,
    versao: VERSAO_DIAGRAMA,
    fonte: { ...base.fonte, ...(o.fonte ?? {}) },
    formas: o.formas.map((f) => ({ ...f, props: f.props ?? {}, id: f.id || novoId() })),
    ligacoes: Array.isArray(o.ligacoes) ? o.ligacoes.map((l) => ({ ...l, props: l.props ?? {} })) : [],
  } as Diagrama;
}

export function salvarLocal(doc: Diagrama) {
  baixar(`${doc.nome}.${EXTENSAO}`, JSON.stringify(doc, null, 2), 'application/json');
}

export function salvarPacote(docs: Diagrama[]) {
  baixar(`pacote.${EXTENSAO_PACOTE}`, JSON.stringify({ pacote: true, versao: VERSAO_DIAGRAMA, diagramas: docs }, null, 2), 'application/json');
}

export function escolherArquivo(aceita: string): Promise<File | null> {
  return new Promise((ok) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = aceita;
    inp.onchange = () => ok(inp.files?.[0] ?? null);
    inp.oncancel = () => ok(null);
    inp.click();
  });
}

/** Extensões aceitas no diálogo Abrir e no arrastar-e-soltar (diagrama e pacote em JSON). */
export const ACEITA_ABRIR = '.json,.mfd.json,.mfp.json';

export const ehArquivoAbrivel = (nome: string): boolean => /\.json$/i.test(nome);

/** Compara "a.b.c" numericamente (>0: a é mais nova). Partes ausentes/inválidas valem 0. */
export function compararVersoes(a: string, b: string): number {
  const pa = String(a ?? '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b ?? '').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Diagramas gravados por versão MAIS NOVA que esta. */
export function versoesMaisNovas(brutos: unknown[]): { nome: string; versao: string }[] {
  const out: { nome: string; versao: string }[] = [];
  for (const b of brutos) {
    const o = b as { versao?: unknown; nome?: unknown } | null;
    if (o && typeof o.versao === 'string' && compararVersoes(o.versao, VERSAO_DIAGRAMA) > 0) out.push({ nome: typeof o.nome === 'string' ? o.nome : 'Diagrama', versao: o.versao });
  }
  return out;
}

const confirmarVersao = (itens: { nome: string; versao: string }[]): Promise<boolean> =>
  new Promise((ok) => abrirDialogo({ tipo: 'g2', nome: 'versao', itens, aoConfirmar: () => ok(true), aoRecusar: () => ok(false) }));

/** Lê um ou mais diagramas (diagrama ou pacote JSON). Versão mais nova: pede confirmação (cancelar devolve []). */
export async function abrirArquivo(file: File): Promise<Diagrama[]> {
  const texto = await file.text();
  const j = JSON.parse(texto) as { pacote?: boolean; diagramas?: unknown[] };
  const brutos = j.pacote && Array.isArray(j.diagramas) ? j.diagramas : [j];
  const novas = versoesMaisNovas(brutos);
  if (novas.length && !(await confirmarVersao(novas))) return [];
  return brutos.map(lerDiagrama);
}
