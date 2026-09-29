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

/**
 * Helpers SQL.
 * Trim, split e espaço em branco em versão ASCII, com saída estável byte a byte
 * (o trim do JS, por exemplo, remove também espaços Unicode).
 */

/** Maior identificador aceito pelo banco (63 bytes do PostgreSQL). */
export const LIMITE_IDENTIFICADOR = 63;

/** Tipo emitido no DDL quando a coluna ficou sem tipo definido. */
export const TIPO_NAO_DEFINIDO = 'TIPO_NAO_DEFINIDO';

/** Trim ASCII: remove apenas caracteres <= U+0020 das pontas. */
export function trimAscii(s: string | null | undefined): string {
  if (s == null) return '';
  let i = 0;
  let f = s.length;
  while (i < f && s.charCodeAt(i) <= 0x20) i++;
  while (f > i && s.charCodeAt(f - 1) <= 0x20) f--;
  return s.substring(i, f);
}

/**
 * Split por uma regex simples: sem correspondência devolve [s];
 * com correspondência, as strings vazias do final são descartadas.
 */
export function splitSemVaziosFinais(s: string, sep: RegExp): string[] {
  const g = new RegExp(sep.source, sep.flags.includes('g') ? sep.flags : sep.flags + 'g');
  const partes: string[] = [];
  let ultimo = 0;
  let achou = false;
  let m: RegExpExecArray | null;
  while ((m = g.exec(s)) !== null) {
    if (m[0].length === 0) {
      g.lastIndex++;
      continue;
    }
    achou = true;
    partes.push(s.substring(ultimo, m.index));
    ultimo = m.index + m[0].length;
  }
  if (!achou) return [s];
  partes.push(s.substring(ultimo));
  while (partes.length > 0 && partes[partes.length - 1] === '') partes.pop();
  return partes;
}

/** Qualquer quebra de linha (\r\n, \n, \r e separadores Unicode). */
export const QUEBRA_R = new RegExp('\\r\\n|[\\n\\u000B\\u000C\\r\\u0085\\u2028\\u2029]');

/** Espaço em branco (controles ASCII 0x09-0x0D, 0x1C-0x1F e separadores Unicode). */
export function ehEspacoBranco(c: string): boolean {
  const cp = c.charCodeAt(0);
  if (cp === 0x09 || cp === 0x0a || cp === 0x0b || cp === 0x0c || cp === 0x0d) return true;
  if (cp >= 0x1c && cp <= 0x1f) return true;
  if (cp === 0xa0 || cp === 0x2007 || cp === 0x202f) return false;
  return /[\p{Zs}\p{Zl}\p{Zp}]/u.test(c);
}

function ehLetraOuDigito(c: string): boolean {
  return /[\p{L}\p{Nd}]/u.test(c);
}

/** String#equalsIgnoreCase (aproximação por maiúsculas/minúsculas). */
export function equalsIgnoreCase(a: string, b: string): boolean {
  if (a === b) return true;
  return a.toUpperCase() === b.toUpperCase() || a.toLowerCase() === b.toLowerCase();
}

/**
 * Escapa um identificador SQL: envolve em aspas duplas e duplica as aspas internas.
 * Vazio/nulo vira `""`.
 */
export function escapeSqlIdentifier(identifier: string | null | undefined): string {
  if (identifier == null || identifier === '') return '""';
  return '"' + identifier.split('"').join('""') + '"';
}

/**
 * Nome de objeto como sai no DDL. Com schema: "schema"."nome" (o prefixo é ignorado);
 * sem schema: prefixo colado ao nome escapado.
 */
export function qualificarNome(schema: string | null | undefined, prefixo: string | null | undefined, nome: string): string {
  const esq = trimAscii(schema);
  if (esq !== '') return escapeSqlIdentifier(esq) + '.' + escapeSqlIdentifier(nome);
  return (prefixo ?? '') + escapeSqlIdentifier(nome);
}

/** Posição da palavra DEFAULT isolada (fora de aspas, não parte de identificador) ou -1. */
function acheClausulaDefault(s: string | null | undefined): number {
  if (s == null || s === '') return -1;
  const alvo = 'DEFAULT';
  const up = s.toUpperCase();
  let i = 0;
  while (i < s.length) {
    const c = s.charAt(i);
    if (c === "'" || c === '"') {
      const aspa = c;
      i++;
      while (i < s.length) {
        if (s.charAt(i) === aspa) {
          if (i + 1 < s.length && s.charAt(i + 1) === aspa) {
            i += 2;
            continue;
          }
          break;
        }
        i++;
      }
      i++;
      continue;
    }
    if (up.startsWith(alvo, i)) {
      const iniOk = i === 0 || (!ehLetraOuDigito(s.charAt(i - 1)) && s.charAt(i - 1) !== '_');
      const fim = i + alvo.length;
      const fimOk = fim >= s.length || (!ehLetraOuDigito(s.charAt(fim)) && s.charAt(fim) !== '_');
      if (iniOk && fimOk) return i;
    }
    i++;
  }
  return -1;
}

/** Posição em que o valor do DEFAULT termina (respeita aspas simples e parênteses). */
function fimDoValorDefault(s: string, inicio: number): number {
  let i = inicio;
  let profundidade = 0;
  let emAspa = false;
  while (i < s.length) {
    const c = s.charAt(i);
    if (c === "'") {
      if (emAspa && i + 1 < s.length && s.charAt(i + 1) === "'") {
        i += 2;
        continue;
      }
      emAspa = !emAspa;
    } else if (!emAspa && c === '(') {
      profundidade++;
    } else if (!emAspa && c === ')') {
      profundidade--;
    } else if (!emAspa && profundidade === 0 && ehEspacoBranco(c)) {
      break;
    }
    i++;
  }
  return i;
}

/** Valor de `DEFAULT <valor>` dentro de um trecho de definição de coluna, ou "". */
export function extrairClausulaDefault(s: string | null | undefined): string {
  const idx = acheClausulaDefault(s);
  if (idx < 0 || s == null) return '';
  let i = idx + 'DEFAULT'.length;
  while (i < s.length && ehEspacoBranco(s.charAt(i))) i++;
  return trimAscii(s.substring(i, fimDoValorDefault(s, i)));
}

/** `s` sem a cláusula `DEFAULT <valor>`, com espaços normalizados. */
export function removerClausulaDefault(s: string | null | undefined): string {
  const idx = acheClausulaDefault(s);
  if (idx < 0 || s == null) return s ?? '';
  let i = idx + 'DEFAULT'.length;
  while (i < s.length && ehEspacoBranco(s.charAt(i))) i++;
  const fim = fimDoValorDefault(s, i);
  const resto = s.substring(0, idx) + ' ' + s.substring(Math.min(fim, s.length));
  return trimAscii(resto).replace(/[ \t\n\x0B\f\r]+/g, ' ');
}

/** Escapa caracteres HTML especiais. */
export function escapeHtml(text: string | null | undefined): string {
  if (text == null) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Remove acentos (usado em nomes de tabela). */
export function textoParaTabela(original: string): string {
  return original
    .replace(/[ãâàáä]/g, 'a')
    .replace(/[êèéë]/g, 'e')
    .replace(/[îìíï]/g, 'i')
    .replace(/[õôòóö]/g, 'o')
    .replace(/[ûúùü]/g, 'u')
    .replace(/[ÃÂÀÁÄ]/g, 'A')
    .replace(/[ÊÈÉË]/g, 'E')
    .replace(/[ÎÌÍÏ]/g, 'I')
    .replace(/[ÕÔÒÓÖ]/g, 'O')
    .replace(/[ÛÙÚÜ]/g, 'U')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C')
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N');
}

/** Remove acentos e troca símbolos/espaços por "_". */
export function textoParaCampo(original: string): string {
  return textoParaTabela(original)
    .replace(/!/g, '')
    .replace(/[[´`?!@#$%¨*]/g, '_')
    .replace(/[(){}=~^\]]/g, '_')
    .replace(/[.;\-+'ªº:/]/g, '_')
    .replace(/[ \t\n\x0B\f\r]+/g, '_');
}
