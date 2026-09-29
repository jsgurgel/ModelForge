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

/** Divisão de scripts em comandos e execução com limites. */
import { celula, LIMITES, mensagemSegura } from './seguranca';
import { Conexao, ResultadoSql, TipoBanco } from './tipos';

/**
 * Divide o script em comandos por ";" respeitando aspas ('...', "...", `...`, [...] no SQL Server), comentários
 * (-- e /* *\/) e dollar-quoting do PostgreSQL ($$...$$ e $tag$...$tag$). No SQL Server, uma linha só com GO separa lotes.
 */
export function dividirComandos(sql: string, tipo: TipoBanco = 'postgresql'): string[] {
  const res: string[] = [];
  let atual = '';
  let i = 0;
  const n = sql.length;
  const fecha = () => { const t = atual.trim(); if (t) res.push(t); atual = ''; };
  while (i < n) {
    const c = sql[i];
    const c2 = sql[i + 1];
    if (c === '-' && c2 === '-') {
      const fim = sql.indexOf('\n', i);
      const e = fim < 0 ? n : fim;
      atual += sql.slice(i, e);
      i = e;
    } else if (c === '/' && c2 === '*') {
      const fim = sql.indexOf('*/', i + 2);
      const e = fim < 0 ? n : fim + 2;
      atual += sql.slice(i, e);
      i = e;
    } else if (c === "'" || c === '"' || c === '`' || (c === '[' && tipo === 'sqlserver')) {
      const f = c === '[' ? ']' : c;
      let j = i + 1;
      while (j < n) {
        if (sql[j] === f) {
          if (sql[j + 1] === f) { j += 2; continue; }
          break;
        }
        j++;
      }
      atual += sql.slice(i, Math.min(j + 1, n));
      i = j + 1;
    } else if (c === '$' && tipo === 'postgresql') {
      const m = /^\$([A-Za-z_][A-Za-z_0-9]*)?\$/.exec(sql.slice(i, i + 64));
      if (m) {
        const fim = sql.indexOf(m[0], i + m[0].length);
        const e = fim < 0 ? n : fim + m[0].length;
        atual += sql.slice(i, e);
        i = e;
      } else {
        atual += c;
        i++;
      }
    } else if (c === ';') {
      fecha();
      i++;
    } else if (tipo === 'sqlserver' && (i === 0 || sql[i - 1] === '\n') && /^go[ \t]*(\r?\n|$)/i.test(sql.slice(i, i + 8))) {
      fecha();
      const fim = sql.indexOf('\n', i);
      i = fim < 0 ? n : fim + 1;
    } else {
      atual += c;
      i++;
    }
  }
  fecha();
  return res;
}

export interface ResultadoComando extends ResultadoSql {
  sql: string;
  ms: number;
  erro?: string;
}

export interface OpcoesExecucao {
  paramsPorComando?: string[][];
  limiteLinhas?: number;
  continuarNoErro?: boolean;
  segredos?: string[];
}

/** Executa os comandos em sequência (sem transação: DDL costuma confirmar sozinho). Para no primeiro erro, salvo `continuarNoErro`. */
export async function executarScript(con: Conexao, sql: string, o: OpcoesExecucao = {}): Promise<{ resultados: ResultadoComando[]; total: number; parou: boolean }> {
  const comandos = dividirComandos(sql, con.tipo);
  if (!comandos.length) return { resultados: [], total: 0, parou: false };
  const limite = Math.min(Math.max(1, o.limiteLinhas ?? LIMITES.maxLinhas), LIMITES.maxLinhasAbsoluto);
  const resultados: ResultadoComando[] = [];
  let parou = false;
  for (let i = 0; i < comandos.length; i++) {
    const t0 = Date.now();
    try {
      const r = await con.executar(comandos[i], o.paramsPorComando?.[i] ?? [], limite);
      resultados.push({ ...r, linhas: r.linhas.map((l) => l.map(celula)), sql: comandos[i], ms: Date.now() - t0 });
    } catch (e) {
      resultados.push({ sql: comandos[i], colunas: [], linhas: [], afetadas: null, truncado: false, ms: Date.now() - t0, erro: mensagemSegura(e, o.segredos) });
      if (!o.continuarNoErro) { parou = true; break; }
    }
  }
  return { resultados, total: comandos.length, parou };
}
