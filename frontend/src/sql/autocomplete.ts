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

/** Autocomplete SQL baseado no catálogo real do banco. */
import { CatalogoAutocomplete, EntradaCatalogo } from '../api';

export interface Sugestao {
  label: string;
  tipo: string;
  detalhe?: string;
  /** Texto a inserir no editor (diferente de `label` quando qualifica com schema). */
  inserir?: string;
}

const SQL_KEYWORDS: Sugestao[] = [
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'INTO', 'VALUES', 'SET', 'AND', 'OR', 'NOT', 'NULL', 'IS',
  'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'ON', 'AS', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
  'CREATE', 'TABLE', 'ALTER', 'DROP', 'ADD', 'COLUMN', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'CHECK',
  'DEFAULT', 'CONSTRAINT', 'INDEX', 'VIEW', 'TRIGGER', 'FUNCTION', 'PROCEDURE', 'RETURNS', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE', 'DISTINCT', 'ALL', 'UNION', 'INTERSECT', 'EXCEPT',
  'BEGIN', 'COMMIT', 'ROLLBACK', 'WITH', 'RETURNING', 'CROSS', 'NATURAL', 'USING', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
  'COALESCE', 'CAST', 'CONCAT', 'UPPER', 'LOWER', 'LENGTH', 'TRIM', 'SUBSTRING', 'NOW', 'CURRENT_TIMESTAMP',
].map((kw) => ({ label: kw, tipo: 'kw' }));

/**
 * Gera sugestões baseadas no contexto do cursor no texto SQL.
 * Analisa a posição do cursor para determinar a "zona" atual:
 *
 *  - Após "FROM " ou "JOIN " (zona de tabelas): sugere tabelas, views e schemas.
 *  - Entre "SELECT" e "FROM" (zona de colunas): sugere colunas das tabelas referenciadas no FROM/JOIN.
 *  - Após alias + ".": sugere colunas da tabela correspondente ao alias.
 *  - Após schema + ".": sugere objetos daquele schema.
 *  - Após "WHERE", "ON", "AND", "OR", etc.: sugere colunas + keywords.
 *  - No geral: keywords + tudo do catálogo.
 */
export function sugerir(sql: string, pos: number, catalogo: CatalogoAutocomplete | null, forcar: boolean = false): Sugestao[] {
  if (!catalogo || !catalogo.objetos.length) return SQL_KEYWORDS;

  const antes = sql.slice(0, pos);
  //# O contexto olha o SQL INTEIRO (não só antes do cursor): "FROM clientes" pode estar
  //# depois do cursor ("SELECT | FROM clientes") e as colunas da tabela ainda são a resposta.
  const contexto = analisarContexto(antes, sql);

  //# Caso 1: cursor logo após "alias." ou "schema." — sugere colunas/objetos do prefixo.
  const mPonto = antes.match(/(\w+)\s*\.\s*(\w*)$/);
  if (mPonto) {
    const prefixo = mPonto[1];
    const resto = mPonto[2];
    //# Alias de tabela? ("c." -> colunas de clientes c). Procura no SQL COMPLETO:
    //# o "FROM clientes c" pode estar depois do cursor.
    const alias = resolverAlias(sql, prefixo, catalogo);
    if (alias.length) return filtrar(alias, resto);
    //# Schema? ("public." -> tabelas de public)
    const objsSchema = catalogo.objetos.filter((e) => e.schema === prefixo && (e.tipo === 'tabela' || e.tipo === 'view' || e.tipo === 'view_materializada'));
    if (objsSchema.length) return filtrar(objsSchema.map(sugestaoDeEntrada), resto);
  }

  //# Extrai a "palavra parcial" sob o cursor (o que o usuário já digitou).
  const mPalavra = antes.match(/([A-Za-z_]\w*)$/);
  const palavraParcial = mPalavra?.[1] ?? '';
  const textoAntesPalavra = mPalavra ? antes.slice(0, antes.length - mPalavra[1].length) : antes;

  //# Caso 2: zona de tabelas (após FROM ou JOIN).
  if (contexto.zona === 'tabelas') {
    const objs = catalogo.objetos.filter((e) => ['tabela', 'view', 'view_materializada'].includes(e.tipo));
    const schemas = catalogo.objetos.filter((e) => e.tipo === 'schema');
    return filtrar([...schemas.map(sugestaoDeEntrada), ...objs.map(sugestaoDeEntrada)], palavraParcial);
  }

  //# Caso 3: zona de colunas (entre SELECT e FROM, ou em cláusulas WHERE/ON/etc.).
  if (contexto.zona === 'colunas' || contexto.zona === 'clausula') {
    const tabelasRef = contexto.tabelasReferenciadas;
    let colunas: Sugestao[] = [];
    for (const t of tabelasRef) {
      const cols = catalogo.objetos.filter((e) => e.tipo === 'coluna' && e.tabela?.toLowerCase() === t.nome.toLowerCase());
      colunas = colunas.concat(cols.map(sugestaoDeEntrada));
    }
    //# Zona SELECT: só os campos das tabelas referenciadas (keywords só no fim, se vazio).
    if (contexto.zona === 'colunas' && colunas.length) {
      return filtrar(colunas, palavraParcial);
    }
    //# Se não há tabelas no FROM ainda, mostra todas as colunas + tabelas + keywords.
    if (!colunas.length) {
      const todasColunas = catalogo.objetos.filter((e) => e.tipo === 'coluna');
      const objs = catalogo.objetos.filter((e) => ['tabela', 'view', 'view_materializada'].includes(e.tipo));
      return filtrar([...todasColunas.map(sugestaoDeEntrada), ...objs.map(sugestaoDeEntrada), ...SQL_KEYWORDS], palavraParcial);
    }
    //# Cláusulas (WHERE/ON/AND...): colunas primeiro, keywords depois.
    return filtrar([...colunas, ...SQL_KEYWORDS], palavraParcial);
  }

  //# Caso 4: fallback — catálogo + keywords.
  const catSugestoes = catalogo.objetos.map(sugestaoDeEntrada);
  return filtrar([...catSugestoes, ...SQL_KEYWORDS], palavraParcial);
}

interface Contexto {
  zona: 'tabelas' | 'colunas' | 'clausula' | 'geral';
  tabelasReferenciadas: { nome: string; alias: string | null }[];
}

/**
 * Analisa o texto para determinar em que "zona" do SQL o cursor está.
 * `antes` = texto até o cursor (define a zona); `sql` = texto completo
 * (de onde vêm as tabelas referenciadas, que podem estar após o cursor).
 */
function analisarContexto(antes: string, sql: string): Contexto {
  const semStrings = removerStrings(antes);
  const upper = semStrings.toUpperCase();

  //# Coleta todas as tabelas + aliases do FROM/JOIN do SQL COMPLETO.
  const tabelas: { nome: string; alias: string | null }[] = [];
  const padraoTabela = /\b(?:from|join)\s+(\w+)(?:\s*(?:\.\s*(\w+))?)?(?:\s+(?:as\s+)?(\w+))?/gi;
  let mt: RegExpExecArray | null;
  while ((mt = padraoTabela.exec(removerStrings(sql))) !== null) {
    const nome = mt[2] ? `${mt[1]}.${mt[2]}` : mt[1];
    const alias = mt[3] && !PALAVRAS_SQL.has(mt[3].toUpperCase()) ? mt[3] : null;
    tabelas.push({ nome, alias });
  }

  //# Determina a zona pela última keyword significativa antes do cursor.
  const ultimaKeyword = encontrarUltimaKeyword(upper);
  let zona: Contexto['zona'] = 'geral';

  if (ultimaKeyword === 'FROM' || ultimaKeyword === 'JOIN') {
    //# Depois do FROM/JOIN e antes de WHERE/GROUP/ORDER/LIMIT/etc. -> zona de tabelas.
    const aposFrom = upper.lastIndexOf(ultimaKeyword);
    const trecho = upper.slice(aposFrom);
    const temClausulaPosterior = /\b(WHERE|GROUP|ORDER|HAVING|LIMIT|OFFSET|UNION|RETURNING|SET|VALUES|INTO)\b/.test(trecho.slice(trecho.indexOf(' ') + 3));
    zona = temClausulaPosterior ? 'clausula' : 'tabelas';
  } else if (ultimaKeyword === 'SELECT') {
    //# SELECT ... | FROM -> zona de colunas.
    zona = 'colunas';
  } else if (ultimaKeyword === 'WHERE' || ultimaKeyword === 'ON' || ultimaKeyword === 'AND' || ultimaKeyword === 'OR' ||
    ultimaKeyword === 'HAVING' || ultimaKeyword === 'BY' || ultimaKeyword === 'SET' || ultimaKeyword === 'VALUES' || ultimaKeyword === 'THEN') {
    zona = 'clausula';
  }

  return { zona, tabelasReferenciadas: tabelas };
}

const PALAVRAS_SQL = new Set([
  'WHERE', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE', 'AS', 'ON',
  'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'NATURAL', 'JOIN', 'GROUP', 'ORDER', 'BY',
  'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'INTERSECT', 'EXCEPT', 'ALL', 'DISTINCT', 'WITH', 'RETURNING',
  'SET', 'VALUES', 'INTO', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'ASC', 'DESC', 'USING',
]);

function encontrarUltimaKeyword(upper: string): string | null {
  const keywords = ['FROM', 'JOIN', 'SELECT', 'WHERE', 'ON', 'AND', 'OR', 'HAVING', 'GROUP', 'ORDER', 'BY', 'SET', 'VALUES', 'INTO', 'THEN', 'LIMIT', 'OFFSET'];
  let ultima: string | null = null;
  let ultimaPos = -1;
  for (const kw of keywords) {
    const padrao = new RegExp(`\\b${kw}\\b`, 'g');
    let m: RegExpExecArray | null;
    while ((m = padrao.exec(upper)) !== null) {
      if (m.index > ultimaPos) { ultimaPos = m.index; ultima = kw; }
    }
  }
  return ultima;
}

/** Remove strings ('...', "...", `...`) para não confundir o parser de keywords. */
function removerStrings(s: string): string {
  return s.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""').replace(/`(?:[^`])*`/g, '``');
}

/** Dado um alias (ex. "c"), encontra a tabela correspondente no FROM/JOIN e devolve suas colunas. */
function resolverAlias(antes: string, alias: string, catalogo: CatalogoAutocomplete): Sugestao[] {
  const esc = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  //# Procura por "from/join <tabela> [as] <alias>" — o alias precisa estar explicitamente presente.
  const padrao = new RegExp(`\\b(?:from|join)\\s+(\\w+)(?:\\s*\\.\\s*(\\w+))?\\s+(?:as\\s+)?${esc}\\b`, 'gi');
  let m: RegExpExecArray | null;
  let tabela: string | null = null;
  while ((m = padrao.exec(antes)) !== null) {
    tabela = m[2] ? `${m[1]}.${m[2]}` : m[1];
  }
  if (!tabela) return [];
  const nomeTabela = tabela.split('.').pop()!;
  return catalogo.objetos
    .filter((e) => e.tipo === 'coluna' && e.tabela?.toLowerCase() === nomeTabela.toLowerCase())
    .map(sugestaoDeEntrada);
}

function sugestaoDeEntrada(e: EntradaCatalogo): Sugestao {
  const rotulos: Record<string, string> = {
    tabela: 'Tabela', view: 'View', view_materializada: 'View Mat.', sequencia: 'Sequência',
    rotina: 'Rotina', coluna: 'Coluna', schema: 'Schema',
  };
  //# Detalhe: tipo + schema (para distinguir tabelas de mesmo nome em schemas diferentes).
  const rotulo = rotulos[e.tipo] ?? e.tipo;
  const detalhe = e.tipoColuna ? e.tipoColuna : e.tipo === 'tabela' || e.tipo === 'view' || e.tipo === 'view_materializada'
    ? (e.schema ? `${rotulo} · ${e.schema}` : rotulo)
    : rotulo;
  return {
    label: e.nome,
    tipo: e.tipo,
    detalhe,
    //# "public.clientes" quando a tabela pertence a um schema (evita "não existe a relação").
    inserir: e.inserir ?? e.nome,
  };
}

function filtrar(sugestoes: Sugestao[], prefixo: string): Sugestao[] {
  if (!prefixo) return dedup(sugestoes).slice(0, 80);
  const lower = prefixo.toLowerCase();
  const startsWith = sugestoes.filter((s) => s.label.toLowerCase().startsWith(lower));
  const resultado = startsWith.length ? startsWith : sugestoes.filter((s) => s.label.toLowerCase().includes(lower));
  return dedup(resultado).slice(0, 80);
}

function dedup(sugestoes: Sugestao[]): Sugestao[] {
  const vistos = new Set<string>();
  return sugestoes.filter((s) => {
    const chave = `${s.tipo}:${s.label.toLowerCase()}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}