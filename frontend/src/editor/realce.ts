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

/** Realce de sintaxe. Sem dependências, sem HTML. */
export type Linguagem = 'sql' | 'java' | 'python' | 'prisma' | 'js' | 'texto';
export type TipoToken = 'kw' | 'tp' | 'st' | 'nu' | 'cm' | 'fn' | 'id' | 'an' | 'op' | 'tx';
export interface Token { texto: string; tipo: TipoToken }

const conj = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

const SQL_KW = conj(`
ADD ALL ALTER AND ANY AS ASC AUTHORIZATION BEGIN BETWEEN BY CASCADE CASE CHECK COLLATE COLUMN COMMENT COMMIT CONSTRAINT CREATE CROSS
CURRENT DATABASE DECLARE DEFAULT DELETE DESC DISTINCT DO DROP EACH ELSE ELSIF END ESCAPE EXCEPT EXECUTE EXISTS EXTENSION FOR FOREIGN FROM
FULL FUNCTION GRANT GROUP HAVING IF IN INCLUDE INDEX INHERITS INNER INSERT INSTEAD INTERSECT INTO IS JOIN KEY LANGUAGE LEFT LIKE ILIKE LIMIT
MATERIALIZED NATURAL NO NOT NULL OF OFFSET ON ONLY OR ORDER OUTER OVER OWNED PARTITION PRIMARY PROCEDURE REFERENCES REFERENCING RENAME
REPLACE RETURN RETURNS RIGHT ROLLBACK ROW ROWS SCHEMA SELECT SEQUENCE SET START TABLE TEMPORARY TEMP THEN TO TRIGGER TRUNCATE UNION UNIQUE
UNLOGGED UPDATE USING VALUES VIEW WHEN WHERE WITH INCREMENT MINVALUE MAXVALUE CYCLE CACHE OWNED RANGE LIST HASH BEFORE AFTER EXECUTE
ENGINE AUTO_INCREMENT IDENTITY CLUSTERED NONCLUSTERED GO USE UNSIGNED ZEROFILL
`);
const SQL_TIPOS = conj(`
INT INTEGER BIGINT SMALLINT TINYINT MEDIUMINT SERIAL BIGSERIAL SMALLSERIAL DECIMAL NUMERIC REAL FLOAT DOUBLE PRECISION MONEY BIT BOOLEAN BOOL
CHAR CHARACTER VARCHAR NVARCHAR NCHAR TEXT TINYTEXT MEDIUMTEXT LONGTEXT CLOB DATE TIME TIMESTAMP TIMESTAMPTZ DATETIME DATETIME2 INTERVAL YEAR
BINARY VARBINARY BYTEA BLOB LONGBLOB UUID UNIQUEIDENTIFIER JSON JSONB XML ARRAY ENUM GEOMETRY GEOGRAPHY POINT POLYGON LINESTRING OID INET CIDR
`);
const SQL_FN = conj(`
COUNT SUM AVG MIN MAX COALESCE NULLIF NOW CURRENT_TIMESTAMP CURRENT_DATE CURRENT_USER GETDATE LOWER UPPER LENGTH SUBSTRING TRIM CAST CONVERT
NEXTVAL CURRVAL GEN_RANDOM_UUID UUID_GENERATE_V4 NEWID CONCAT ROUND ABS ST_GEOMFROMTEXT ST_SETSRID
`);
const JAVA_KW = conj(`
abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if
implements import instanceof int interface long native new package private protected public return short static strictfp super switch
synchronized this throw throws transient try void volatile while var record null true false
`);
const JAVA_TIPOS = conj('String Integer Long Double Float Boolean BigDecimal BigInteger LocalDate LocalDateTime LocalTime OffsetDateTime Instant UUID List Set Map Optional byte[] Date Timestamp');
const PY_KW = conj(`
False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal
not or pass raise return try while with yield
`);
const PY_TIPOS = conj('Integer String Text Boolean Float Numeric Date DateTime Time BigInteger SmallInteger LargeBinary JSON Enum Column ForeignKey relationship Mapped mapped_column int str float bool bytes list dict set');
const PRISMA_KW = conj('model enum datasource generator type view');
const PRISMA_TIPOS = conj('String Int BigInt Float Decimal Boolean DateTime Json Bytes Unsupported');
const JS_KW = conj(`
async await break case catch class const continue debugger default delete do else export extends false finally for function if import in
instanceof let new null return super switch this throw true try typeof undefined var void while with yield db
`);
const JS_TIPOS = conj('string number boolean date objectId array object int long double decimal bool');

interface Regras {
  kw: Set<string>; tp: Set<string>; fn?: Set<string>; ci: boolean;
  linha: string[]; bloco?: [string, string]; aspasIdent: string[]; aspasStr: string[]; anotacao?: string;
}

const REGRAS: Record<Exclude<Linguagem, 'texto'>, Regras> = {
  sql: { kw: SQL_KW, tp: SQL_TIPOS, fn: SQL_FN, ci: true, linha: ['--'], bloco: ['/*', '*/'], aspasIdent: ['"', '`'], aspasStr: ["'"] },
  java: { kw: JAVA_KW, tp: JAVA_TIPOS, ci: false, linha: ['//'], bloco: ['/*', '*/'], aspasIdent: [], aspasStr: ['"', "'"], anotacao: '@' },
  python: { kw: PY_KW, tp: PY_TIPOS, ci: false, linha: ['#'], aspasIdent: [], aspasStr: ['"', "'"], anotacao: '@' },
  prisma: { kw: PRISMA_KW, tp: PRISMA_TIPOS, ci: false, linha: ['//'], aspasIdent: [], aspasStr: ['"'], anotacao: '@' },
  js: { kw: JS_KW, tp: JS_TIPOS, ci: false, linha: ['//'], bloco: ['/*', '*/'], aspasIdent: [], aspasStr: ['"', "'", '`'] },
};

const ehInicioPalavra = (c: string) => /[A-Za-z_À-ɏ]/.test(c);
const ehPalavra = (c: string) => /[A-Za-z0-9_$À-ɏ]/.test(c);
const ehDigito = (c: string) => c >= '0' && c <= '9';

/** Divide o texto em tokens; concatenar `texto` de todos devolve exatamente a entrada. */
export function tokenizar(texto: string, lang: Linguagem): Token[] {
  if (lang === 'texto') return [{ texto, tipo: 'tx' }];
  const r = REGRAS[lang];
  const out: Token[] = [];
  let pend = '';
  const solta = () => { if (pend) { out.push({ texto: pend, tipo: 'tx' }); pend = ''; } };
  const emite = (t: string, tipo: TipoToken) => { solta(); out.push({ texto: t, tipo }); };
  const n = texto.length;
  let i = 0;
  while (i < n) {
    const c = texto[i];
    const resto = texto.startsWith.bind(texto);
    const lin = r.linha.find((m) => resto(m, i));
    if (lin) {
      let j = texto.indexOf('\n', i);
      if (j < 0) j = n;
      emite(texto.slice(i, j), 'cm'); i = j; continue;
    }
    if (r.bloco && resto(r.bloco[0], i)) {
      let j = texto.indexOf(r.bloco[1], i + r.bloco[0].length);
      j = j < 0 ? n : j + r.bloco[1].length;
      emite(texto.slice(i, j), 'cm'); i = j; continue;
    }
    if (lang === 'sql' && c === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(texto.slice(i, i + 40));
      if (m) {
        let j = texto.indexOf(m[0], i + m[0].length);
        j = j < 0 ? n : j + m[0].length;
        emite(texto.slice(i, j), 'st'); i = j; continue;
      }
    }
    if (lang === 'python' && (resto('"""', i) || resto("'''", i))) {
      const q = texto.slice(i, i + 3);
      let j = texto.indexOf(q, i + 3);
      j = j < 0 ? n : j + 3;
      emite(texto.slice(i, j), 'st'); i = j; continue;
    }
    const q = r.aspasStr.includes(c) ? 'st' : r.aspasIdent.includes(c) ? 'id' : null;
    if (q) {
      let j = i + 1;
      while (j < n) {
        if (texto[j] === '\\' && lang !== 'sql') { j += 2; continue; }
        if (texto[j] === c) {
          if (texto[j + 1] === c && (lang === 'sql')) { j += 2; continue; }
          j++; break;
        }
        if (texto[j] === '\n' && c !== '`') break;
        j++;
      }
      emite(texto.slice(i, j), q); i = j; continue;
    }
    if (r.anotacao && c === r.anotacao && ehInicioPalavra(texto[i + 1] ?? '')) {
      let j = i + 1;
      while (j < n && (ehPalavra(texto[j]) || (texto[j] === '.' && ehInicioPalavra(texto[j + 1] ?? '')))) j++;
      emite(texto.slice(i, j), 'an'); i = j; continue;
    }
    if (ehDigito(c) || (c === '.' && ehDigito(texto[i + 1] ?? '') && !ehPalavra(texto[i - 1] ?? ' '))) {
      let j = i + 1;
      while (j < n && (ehDigito(texto[j]) || texto[j] === '.' || /[eExXa-fA-F_]/.test(texto[j]) && ehDigito(texto[i]))) j++;
      emite(texto.slice(i, j), 'nu'); i = j; continue;
    }
    if (ehInicioPalavra(c)) {
      let j = i + 1;
      while (j < n && ehPalavra(texto[j])) j++;
      const p = texto.slice(i, j);
      const chave = r.ci ? p.toUpperCase() : p;
      const prox = texto.slice(j).match(/^\s*\(/);
      let tipo: TipoToken | null = null;
      if (r.tp.has(chave)) tipo = 'tp';
      else if (r.kw.has(chave)) tipo = 'kw';
      else if (r.fn?.has(chave) || (prox && lang === 'sql')) tipo = r.fn?.has(chave) ? 'fn' : null;
      if (tipo) emite(p, tipo); else pend += p;
      i = j; continue;
    }
    if (/[()\[\]{},;.:=<>+\-*/%!|&^~?]/.test(c)) { emite(c, 'op'); i++; continue; }
    pend += c; i++;
  }
  solta();
  return out;
}

/** Linguagem pelo nome de arquivo sugerido. */
export function linguagemDoArquivo(nome?: string, padrao: Linguagem = 'texto'): Linguagem {
  const ext = (nome ?? '').toLowerCase().split('.').pop();
  switch (ext) {
    case 'sql': return 'sql';
    case 'java': return 'java';
    case 'py': return 'python';
    case 'prisma': return 'prisma';
    case 'js': case 'mongosh': return 'js';
    default: return padrao;
  }
}

/** Cores dos tokens (variáveis CSS com padrão, para funcionar também em SVG exportado). */
export const COR_TOKEN: Record<TipoToken, string | undefined> = {
  kw: 'var(--tk-kw, #1c5fb0)', tp: 'var(--tk-tp, #0b7a75)', st: 'var(--tk-st, #b5402a)', nu: 'var(--tk-nu, #7a3fb0)',
  cm: 'var(--tk-cm, #6a7a6a)', fn: 'var(--tk-fn, #8a5a00)', id: 'var(--tk-id, #5a4a9a)', an: 'var(--tk-an, #9a6a00)', op: 'var(--tk-op, #555)', tx: undefined,
};
