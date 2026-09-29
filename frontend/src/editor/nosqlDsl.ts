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

import { CampoNoSql, TipoCampoNoSql } from './types';

/** DSL de coleções NoSQL: uma declaração por linha, blocos `embedded { ... }` aninháveis. */
export interface ResultadoDsl {
  campos: CampoNoSql[];
  erros: string[];
}

const TIPOS: TipoCampoNoSql[] = ['string', 'number', 'boolean', 'date', 'objectid', 'array', 'embedded', 'array_embedded', 'reference'];
const EMBUTIDO = /^(\w+)\s*:\s*(embedded|array_embedded)\s*\{\s*$/i;
const REFERENCIA = /^(\w+)\s*:\s*reference\s+(\w+)\s*$/i;
const SIMPLES = /^(\w+)\s*:\s*(\w+)\s*$/;
const FECHA = /^\}\s*$/;

const tipoPorPalavra = (p: string): TipoCampoNoSql | null => TIPOS.find((t) => t === p.toLowerCase()) ?? null;
const temSub = (t: TipoCampoNoSql) => t === 'embedded' || t === 'array_embedded';

export function parseDsl(texto: string): ResultadoDsl {
  const erros: string[] = [];
  const linhas = texto.split('\n');
  const cursor = { i: 0 };
  const campos = parseBloco(linhas, cursor, erros, false);
  if (cursor.i < linhas.length) erros.push(`Linha ${cursor.i + 1}: '}' sem bloco correspondente.`);
  return { campos, erros };
}

function parseBloco(linhas: string[], cursor: { i: number }, erros: string[], dentro: boolean): CampoNoSql[] {
  const res: CampoNoSql[] = [];
  while (cursor.i < linhas.length) {
    const bruta = linhas[cursor.i];
    const linha = bruta.trim();
    if (!linha || linha.startsWith('#')) {
      cursor.i++;
      continue;
    }
    if (FECHA.test(linha)) {
      if (dentro) cursor.i++;
      return res;
    }
    let m = EMBUTIDO.exec(linha);
    if (m) {
      const tipo = tipoPorPalavra(m[2])!;
      cursor.i++;
      const sub = parseBloco(linhas, cursor, erros, true);
      if (!sub.length) erros.push(`Linha ${cursor.i}: "${m[1]}" está vazio - documento embutido precisa de pelo menos um campo.`);
      res.push({ nome: m[1], tipo, subCampos: sub });
      continue;
    }
    m = REFERENCIA.exec(linha);
    if (m) {
      res.push({ nome: m[1], tipo: 'reference', colecaoReferenciada: m[2] });
      cursor.i++;
      continue;
    }
    m = SIMPLES.exec(linha);
    if (m) {
      const tipo = tipoPorPalavra(m[2]);
      if (!tipo || temSub(tipo)) {
        erros.push(`Linha ${cursor.i + 1}: tipo desconhecido "${m[2]}" (use string, number, boolean, date, objectid, array, embedded { ... }, array_embedded { ... } ou reference NomeDaColecao): ${linha}`);
      } else {
        res.push({ nome: m[1], tipo });
      }
      cursor.i++;
      continue;
    }
    erros.push(`Linha ${cursor.i + 1}: declaração inválida (esperado "nome: tipo"): ${linha}`);
    cursor.i++;
  }
  //# Só chega aqui sem passar pelo "}" quando o texto acabou antes de fechar o bloco.
  if (dentro) erros.push("Fim do texto: bloco de documento embutido não foi fechado com '}'.");
  return res;
}

export function gerarDsl(campos: CampoNoSql[], nivel = 0): string {
  const recuo = '    '.repeat(nivel);
  let s = '';
  for (const c of campos) {
    if (c.tipo === 'reference') s += `${recuo}${c.nome}: reference ${c.colecaoReferenciada ?? ''}\n`;
    else if (temSub(c.tipo)) s += `${recuo}${c.nome}: ${c.tipo} {\n${gerarDsl(c.subCampos ?? [], nivel + 1)}${recuo}}\n`;
    else s += `${recuo}${c.nome}: ${c.tipo}\n`;
  }
  return s;
}
