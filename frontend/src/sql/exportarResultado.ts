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

/** Exportação de resultados de SQL em múltiplos formatos. Extensível: adicione um case em `exportarResultado`. */
import { ResultadoComandoSql } from '../api';

export type FormatoExportacao = 'csv' | 'json' | 'sql' | 'markdown' | 'html';

const escCsv = (v: unknown): string => {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
};

function paraCsv(r: ResultadoComandoSql): string {
  const linhas = [r.colunas.map(escCsv).join(',')];
  for (const l of r.linhas) linhas.push(l.map(escCsv).join(','));
  return '\ufeff' + linhas.join('\r\n');
}

function paraJson(r: ResultadoComandoSql): string {
  const objs = r.linhas.map((l) => {
    const o: Record<string, unknown> = {};
    r.colunas.forEach((c, i) => { o[c] = l[i]; });
    return o;
  });
  return JSON.stringify(objs, null, 2);
}

function paraSqlInsert(r: ResultadoComandoSql, tabela: string): string {
  if (!r.colunas.length) return '';
  const cols = r.colunas.join(', ');
  let sb = '';
  for (const l of r.linhas) {
    const vals = l.map((v) => v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
    sb += `INSERT INTO ${tabela} (${cols}) VALUES (${vals.join(', ')});\n`;
  }
  return sb;
}

function paraMarkdown(r: ResultadoComandoSql): string {
  const header = `| ${r.colunas.join(' | ')} |`;
  const sep = `| ${r.colunas.map(() => '---').join(' | ')} |`;
  const linhas = r.linhas.map((l) => {
    const cells = l.map((v) => (v == null ? '' : String(v).replace(/\|/g, '\\|'))).join(' | ');
    return '| ' + cells + ' |';
  });
  return [header, sep, ...linhas].join('\n');
}

function paraHtml(r: ResultadoComandoSql): string {
  const th = r.colunas.map((c) => `<th>${escHtml(c)}</th>`).join('');
  const trs = r.linhas.map((l) => `<tr>${l.map((v) => `<td>${v == null ? '<i>null</i>' : escHtml(String(v))}</td>`).join('')}</tr>`).join('');
  return `<table border="1" cellpadding="4" cellspacing="0"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function exportarResultado(r: ResultadoComandoSql, formato: FormatoExportacao, tabela = 'resultado'): string {
  switch (formato) {
    case 'csv': return paraCsv(r);
    case 'json': return paraJson(r);
    case 'sql': return paraSqlInsert(r, tabela);
    case 'markdown': return paraMarkdown(r);
    case 'html': return paraHtml(r);
  }
}

export const EXT_FORMATO: Record<FormatoExportacao, string> = {
  csv: 'csv', json: 'json', sql: 'sql', markdown: 'md', html: 'html',
};

export const MIME_FORMATO: Record<FormatoExportacao, string> = {
  csv: 'text/csv;charset=utf-8', json: 'application/json;charset=utf-8', sql: 'text/plain;charset=utf-8',
  markdown: 'text/markdown;charset=utf-8', html: 'text/html;charset=utf-8',
};