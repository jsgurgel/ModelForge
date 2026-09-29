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
 * Importar DDL -> Conceitual: cada CREATE TABLE vira uma Entidade (grade de 3 por linha), cada coluna um Atributo (PK = identificador,
 * NOT NULL = obrigatório, senão opcional) e cada FK um Relacionamento com (1,n) do lado referenciado e (0,n) do lado da FK.
 *
 * O parser (regex, cortes de string, avisos) é o mesmo de importador.ts (Lógico), copiado porque lá ele é privado.
 * O layout calcula a posição dos atributos, a largura do losango pela métrica da fonte Dialog 12 e o desvio de
 * sobreposições. Ordem dos itens = ordem de criação.
 */
import type { Diagrama, Forma, Ligacao } from '../modelo/tipos';
import { GDiagrama, GForma, serializarConceitual } from './conversor';

const WS_CLASSE = '[ \\t\\n\\x0B\\f\\r]';
/** Compila uma regex trocando \s (que no JS inclui espaços unicode) por [ \t\n\x0B\f\r]. */
function R(src: string, flags = ''): RegExp {
  return new RegExp(src.replace(/\\s/g, WS_CLASSE), flags);
}
/** Trim ASCII: remove das pontas tudo que é <= U+0020. */
function jtrim(s: string): string {
  let i = 0;
  let j = s.length;
  while (i < j && s.charCodeAt(i) <= 0x20) i++;
  while (j > i && s.charCodeAt(j - 1) <= 0x20) j--;
  return s.substring(i, j);
}
/** Espaço em branco (controles ASCII e separadores Unicode). */
function isWs(c: string): boolean {
  const n = c.charCodeAt(0);
  return (n >= 9 && n <= 13) || (n >= 0x1c && n <= 0x20) || n === 0x1680 || (n >= 0x2000 && n <= 0x200a && n !== 0x2007)
    || n === 0x2028 || n === 0x2029 || n === 0x205f || n === 0x3000;
}
function isLD(c: string): boolean {
  return /[\p{L}\p{Nd}]/u.test(c);
}
/** Split por regex que remove vazios do fim quando houve corte. */
function jsplit(s: string, sep: RegExp | string): string[] {
  const r = s.split(sep);
  if (r.length > 1) {
    while (r.length && r[r.length - 1] === '') r.pop();
  }
  return r;
}
function eqIC(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase() || a.toLowerCase() === b.toLowerCase();
}
function resumir(s: string): string {
  return s.length > 60 ? s.substring(0, 60) + '...' : s;
}

// ---------------------------------------------------------------------------------------------
// Modelo intermediário (Def*)
// ---------------------------------------------------------------------------------------------
interface DefColuna {
  nome: string; tipo: string; complemento: string; comentario: string;
  notNull: boolean; primaryKey: boolean; unique: boolean; valorDefault: string; srid: string; subtipoGeometria: string;
}
interface DefConstraint {
  tipo: 'PK' | 'UNIQUE' | 'FK' | 'CHECK';
  nome: string | null;
  colunas: string[];
  expressao: string | null;
  refTabela: string | null;
  refSchema: string | null;
  refColunas: string[];
}
interface DefIndice { nome: string; tabela: string; unico: boolean; metodo: string; condicao: string; colunas: string[] }
interface DefGatilho { nome: string; tabela: string; momento: string; eventos: string; porLinha: boolean; condicao: string; funcao: string }
interface DefTabela {
  nome: string; schema: string | null; comentario: string;
  colunas: DefColuna[]; constraints: DefConstraint[]; indices: DefIndice[]; gatilhos: DefGatilho[];
  estrategiaParticao: string; chaveParticao: string; tabelaPai: string; limiteParticao: string;
}
type TipoC = 'PK' | 'UNIQUE' | 'FK' | 'CHECK';
// ---------------------------------------------------------------------------------------------
function acheClausulaDefault(s: string | null): number {
  if (!s) return -1;
  const alvo = 'DEFAULT';
  const up = s.toUpperCase();
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "'" || c === '"') {
      const aspa = c;
      i++;
      while (i < s.length) {
        if (s[i] === aspa) {
          if (i + 1 < s.length && s[i + 1] === aspa) { i += 2; continue; }
          break;
        }
        i++;
      }
      i++;
      continue;
    }
    if (up.startsWith(alvo, i)) {
      const iniOk = i === 0 || (!isLD(s[i - 1]) && s[i - 1] !== '_');
      const fim = i + alvo.length;
      const fimOk = fim >= s.length || (!isLD(s[fim]) && s[fim] !== '_');
      if (iniOk && fimOk) return i;
    }
    i++;
  }
  return -1;
}
function fimDoValorDefault(s: string, inicio: number): number {
  let i = inicio;
  let prof = 0;
  let emAspa = false;
  while (i < s.length) {
    const c = s[i];
    if (c === "'") {
      if (emAspa && i + 1 < s.length && s[i + 1] === "'") { i += 2; continue; }
      emAspa = !emAspa;
    } else if (!emAspa && c === '(') prof++;
    else if (!emAspa && c === ')') prof--;
    else if (!emAspa && prof === 0 && isWs(c)) break;
    i++;
  }
  return i;
}
function extrairClausulaDefault(s: string): string {
  const idx = acheClausulaDefault(s);
  if (idx < 0) return '';
  let i = idx + 7;
  while (i < s.length && isWs(s[i])) i++;
  return jtrim(s.substring(i, fimDoValorDefault(s, i)));
}
function removerClausulaDefault(s: string): string {
  const idx = acheClausulaDefault(s);
  if (idx < 0) return s ?? '';
  let i = idx + 7;
  while (i < s.length && isWs(s[i])) i++;
  const fim = fimDoValorDefault(s, i);
  const resto = s.substring(0, idx) + ' ' + s.substring(Math.min(fim, s.length));
  return jtrim(resto).replace(R('\\s+', 'g'), ' ');
}

// ---------------------------------------------------------------------------------------------
const ID = '[a-zA-Z0-9_"`\\[\\]]';
const IDQ = '[a-zA-Z0-9_"`\\[\\]\\.]';

class ParserDdl {
  erros: string[] = [];
  avisos: string[] = [];
  inlineFKs = new Map<DefColuna, DefConstraint[]>();

  protected normalizar(script: string): string {
    let sb = '';
    let emAspa = false;
    for (let i = 0; i < script.length; i++) {
      const c = script[i];
      if (c === '$' && !emAspa) {
        const fim = fimDoBlocoDollar(script, i);
        if (fim > i) { sb += script.substring(i, fim); i = fim - 1; continue; }
      }
      if (c === "'" && !emAspa) { emAspa = true; sb += c; continue; }
      if (c === "'" && emAspa) {
        if (i + 1 < script.length && script[i + 1] === "'") { sb += c + script[i + 1]; i++; continue; }
        emAspa = false; sb += c; continue;
      }
      if (!emAspa) {
        if (c === '/' && i + 1 < script.length && script[i + 1] === '*') {
          let fim = script.indexOf('*/', i + 2);
          if (fim < 0) fim = script.length - 1;
          i = fim + 1;
          sb += ' ';
          continue;
        }
        if (c === '-' && i + 1 < script.length && script[i + 1] === '-') {
          let fim = script.indexOf('\n', i);
          if (fim < 0) fim = script.length - 1;
          i = fim;
          sb += ' ';
          continue;
        }
        if (c === '#') {
          let fim = script.indexOf('\n', i);
          if (fim < 0) fim = script.length - 1;
          i = fim;
          sb += ' ';
          continue;
        }
      }
      sb += c;
    }
    const s = sb;
    let sb2 = '';
    emAspa = false;
    let prevSpace = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '$' && !emAspa) {
        const fim = fimDoBlocoDollar(s, i);
        if (fim > i) { sb2 += s.substring(i, fim); i = fim - 1; prevSpace = false; continue; }
      }
      if (c === "'" && !emAspa) { emAspa = true; sb2 += c; prevSpace = false; continue; }
      if (c === "'" && emAspa) {
        if (i + 1 < s.length && s[i + 1] === "'") { sb2 += c + s[i + 1]; i++; prevSpace = false; continue; }
        emAspa = false; sb2 += c; prevSpace = false; continue;
      }
      if (!emAspa && isWs(c)) {
        if (!prevSpace) { sb2 += ' '; prevSpace = true; }
        continue;
      }
      sb2 += c;
      prevSpace = false;
    }
    return sb2;
  }

  protected splitStatements(s: string): string[] {
    const res: string[] = [];
    let cur = '';
    let parenteses = 0;
    let emAspa = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '$' && !emAspa) {
        const fim = fimDoBlocoDollar(s, i);
        if (fim > i) { cur += s.substring(i, fim); i = fim - 1; continue; }
      }
      if (c === "'" && !emAspa) { emAspa = true; cur += c; continue; }
      if (c === "'" && emAspa) {
        if (i + 1 < s.length && s[i + 1] === "'") { cur += c + s[i + 1]; i++; continue; }
        emAspa = false; cur += c; continue;
      }
      if (!emAspa && c === '(') parenteses++;
      if (!emAspa && c === ')') parenteses--;
      if (!emAspa && c === ';' && parenteses === 0) {
        const st = jtrim(cur);
        if (st !== '') res.push(st);
        cur = '';
        continue;
      }
      cur += c;
    }
    const st = jtrim(cur);
    if (st !== '') res.push(st);
    return res;
  }

  protected novaTabela(): DefTabela {
    return {
      nome: '', schema: null, comentario: '', colunas: [], constraints: [], indices: [], gatilhos: [],
      estrategiaParticao: '', chaveParticao: '', tabelaPai: '', limiteParticao: '',
    };
  }

  protected novaConstraint(tipo: TipoC): DefConstraint {
    return { tipo, nome: null, colunas: [], expressao: null, refTabela: null, refSchema: null, refColunas: [] };
  }

  protected parseCreateTable(stmt: string): DefTabela | null {
    const p = R('CREATE\\s+(?:TEMPORARY\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(' + IDQ + '+)\\s*\\(', 'is');
    const bruto = jtrim(stmt);
    const m = p.exec(bruto);
    if (!m) {
      this.avisos.push('Instrução CREATE TABLE não reconhecida: ' + resumir(stmt));
      return null;
    }
    const abre = m.index + m[0].length - 1;
    const fecha = fimDoGrupoParenteses(bruto, abre);
    if (fecha < 0) {
      this.avisos.push('Instrução CREATE TABLE não reconhecida (parênteses não fecham): ' + resumir(stmt));
      return null;
    }
    const t = this.novaTabela();
    const partesNome = this.separarSchema(m[1]);
    t.schema = partesNome[0];
    t.nome = partesNome[1] as string;

    this.capturarParticionamento(t, bruto.substring(fecha + 1));

    const corpo = jtrim(bruto.substring(abre + 1, fecha));
    const itens = splitItensCorpo(corpo);

    for (const item of itens) {
      const up = jtrim(item.toUpperCase());
      if (up.startsWith('PRIMARY KEY')) {
        const c = this.novaConstraint('PK');
        c.colunas.push(...extrairColunasEntreParenteses(item));
        t.constraints.push(c);
      } else if (up.startsWith('UNIQUE') || (up.startsWith('CONSTRAINT') && up.includes('UNIQUE'))) {
        const c = this.novaConstraint('UNIQUE');
        if (up.startsWith('CONSTRAINT')) {
          const mc = R('CONSTRAINT\\s+(' + ID + '+)\\s+UNIQUE\\s*\\((.*)\\)', 'i').exec(item);
          if (mc) {
            c.nome = desqualificar(mc[1]);
            c.colunas.push(...splitVirgula(mc[2]));
          }
        } else {
          c.colunas.push(...extrairColunasEntreParenteses(item));
        }
        t.constraints.push(c);
      } else if (up.startsWith('FOREIGN KEY') || (up.startsWith('CONSTRAINT') && up.includes('FOREIGN KEY'))) {
        const c = this.parseFK(item);
        if (c) t.constraints.push(c);
      } else if (up.startsWith('CONSTRAINT')) {
        if (up.includes('PRIMARY KEY')) {
          const c = this.novaConstraint('PK');
          const mc = R('CONSTRAINT\\s+(' + ID + '+)\\s+PRIMARY\\s+KEY\\s*\\((.*)\\)', 'i').exec(item);
          if (mc) {
            c.nome = desqualificar(mc[1]);
            c.colunas.push(...splitVirgula(mc[2]));
          }
          t.constraints.push(c);
        } else if (up.includes('UNIQUE')) {
          // inalcançável (UNIQUE já tratado acima), mantido por fidelidade
          const c = this.novaConstraint('UNIQUE');
          t.constraints.push(c);
        } else if (up.includes('FOREIGN KEY')) {
          const c = this.parseFK(item);
          if (c) t.constraints.push(c);
        } else if (up.includes('CHECK')) {
          const c = this.novaConstraint('CHECK');
          const mc = R('CONSTRAINT\\s+(' + ID + '+)\\s+CHECK\\s*\\(', 'i').exec(item);
          if (mc) c.nome = desqualificar(mc[1]);
          c.expressao = extrairExpressaoEntreParenteses(item);
          if (c.expressao === null) this.avisos.push('CHECK não reconhecido em ' + t.nome + ': ' + resumir(item));
          else t.constraints.push(c);
        } else {
          this.avisos.push('Constraint ignorada (não suportada): ' + resumir(item) + ' em ' + t.nome);
        }
      } else if (up.startsWith('CHECK')) {
        const c = this.novaConstraint('CHECK');
        c.expressao = extrairExpressaoEntreParenteses(item);
        if (c.expressao === null) this.avisos.push('CHECK não reconhecido em ' + t.nome + ': ' + resumir(item));
        else t.constraints.push(c);
      } else if (up.startsWith('KEY') || up.startsWith('INDEX')) {
        this.avisos.push('KEY/INDEX ignorado em ' + t.nome);
      } else {
        const col = this.parseColuna(item);
        if (col) t.colunas.push(col);
      }
    }
    return t;
  }

  protected parseCreateParticao(stmt: string): DefTabela | null {
    const p = R('CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(' + IDQ + '+)\\s+PARTITION\\s+OF\\s+(' + IDQ + '+)\\s+(.*)', 'is');
    const m = p.exec(jtrim(stmt));
    if (!m) return null;
    const t = this.novaTabela();
    const partes = this.separarSchema(m[1]);
    t.schema = partes[0];
    t.nome = partes[1] as string;
    t.tabelaPai = this.separarSchema(m[2])[1] as string;

    const resto = jtrim(m[3]);
    this.capturarParticionamento(t, resto);
    const semParticionar = jtrim(resto.replace(R('\\bPARTITION\\s+BY\\b.*$', 'is'), ''));
    if (semParticionar.toUpperCase().startsWith('DEFAULT')) {
      t.limiteParticao = 'DEFAULT';
    } else {
      const mv = R('FOR\\s+VALUES\\s+(.*)', 'is').exec(semParticionar);
      if (mv) {
        t.limiteParticao = jtrim(mv[1]);
        if (t.limiteParticao.endsWith(';')) t.limiteParticao = jtrim(t.limiteParticao.substring(0, t.limiteParticao.length - 1));
      }
    }
    if (t.limiteParticao === '') {
      this.avisos.push('Partição "' + t.nome + '" sem limite reconhecido (FOR VALUES/DEFAULT): ' + resumir(stmt));
      t.limiteParticao = 'DEFAULT';
    }
    return t;
  }

  protected capturarParticionamento(t: DefTabela, trecho: string): void {
    const mp = R('\\bPARTITION\\s+BY\\s+([a-zA-Z]+)\\s*\\(', 'i').exec(trecho);
    if (mp) {
      t.estrategiaParticao = mp[1].toUpperCase();
      const chave = extrairExpressaoEntreParenteses(trecho.substring(mp.index + mp[0].length - 1));
      t.chaveParticao = chave === null ? '' : chave;
    }
    const mh = R('\\bINHERITS\\s*\\(', 'i').exec(trecho);
    if (mh) {
      const pai = extrairExpressaoEntreParenteses(trecho.substring(mh.index));
      if (pai !== null && ![...pai].every(isWs)) {
        const pais = jsplit(pai, ',');
        t.tabelaPai = this.separarSchema(jtrim(pais[0]))[1] as string;
        if (pais.length > 1) {
          this.avisos.push('Tabela "' + t.nome + '" herda de ' + pais.length
            + ' tabelas; o modelo guarda apenas a primeira (' + t.tabelaPai + ').');
        }
      }
    }
  }

  protected parseColuna(item: string): DefColuna | null {
    const m = R('^(' + ID + '+)\\s+(.*)$', 's').exec(jtrim(item));
    if (!m) {
      this.avisos.push('Definição de coluna não reconhecida: ' + resumir(item));
      return null;
    }
    const col: DefColuna = {
      nome: desqualificar(m[1]), tipo: '', complemento: '', comentario: '', notNull: false, primaryKey: false,
      unique: false, valorDefault: '', srid: '', subtipoGeometria: '',
    };
    const resto = jtrim(m[2]);
    const tokens = jsplit(resto, R('\\s+'));
    let tipo = '';
    let compl = '';
    let capturandoTipo = true;
    const parar = new Set(['NOT', 'NULL', 'DEFAULT', 'PRIMARY', 'UNIQUE', 'REFERENCES', 'COLLATE', 'AUTO_INCREMENT',
      'AUTOINCREMENT', 'IDENTITY', 'ON', 'CHECK']);
    for (const tk of tokens) {
      if (parar.has(tk.toUpperCase())) capturandoTipo = false;
      if (capturandoTipo) {
        if (tipo.length > 0) tipo += ' ';
        tipo += tk;
      } else {
        if (compl.length > 0) compl += ' ';
        compl += tk;
      }
    }
    col.tipo = jtrim(tipo);
    this.separarModificadorEspacial(col);
    col.valorDefault = extrairClausulaDefault(resto);
    col.complemento = this.limparComplementoImportado(removerClausulaDefault(jtrim(compl)));

    const upResto = resto.toUpperCase();
    if (upResto.includes('NOT NULL')) col.notNull = true;
    if (upResto.includes('PRIMARY KEY')) col.primaryKey = true;
    if (upResto.includes('UNIQUE')) col.unique = true;
    if (upResto.includes('REFERENCES')) {
      const fk = this.parseFKInline(resto);
      if (fk) {
        fk.colunas.push(col.nome);
        const l = this.inlineFKs.get(col) ?? [];
        l.push(fk);
        this.inlineFKs.set(col, l);
      }
    }
    return col;
  }

  protected separarModificadorEspacial(col: DefColuna): void {
    const m = /^(GEOMETRY|GEOGRAPHY)[ \t\n\x0B\f\r]*\(([^)]*)\)$/i.exec(jtrim(col.tipo));
    if (!m) return;
    col.tipo = m[1].toUpperCase();
    const partes = jsplit(m[2], ',');
    const sub = jtrim(partes[0] ?? '');
    if (sub !== '' && sub.toUpperCase() !== 'GEOMETRY') col.subtipoGeometria = sub;
    if (partes.length > 1) col.srid = jtrim(partes[1]);
  }

  protected parseCreateTrigger(stmt: string, defs: DefTabela[]): void {
    const p = R('CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:CONSTRAINT\\s+)?TRIGGER\\s+(' + ID + '+)\\s+(BEFORE|AFTER|INSTEAD\\s+OF)\\s+(.+?)\\s+ON\\s+(' + IDQ + '+)', 'is');
    const m = p.exec(jtrim(stmt));
    if (!m) {
      this.avisos.push('Instrução CREATE TRIGGER não reconhecida: ' + resumir(stmt));
      return;
    }
    const g: DefGatilho = {
      nome: desqualificar(m[1]),
      momento: m[2].replace(R('\\s+', 'g'), ' ').toUpperCase(),
      eventos: jtrim(m[3].replace(R('\\s+', 'g'), ' ')).toUpperCase(),
      tabela: this.separarSchema(m[4])[1] as string,
      porLinha: !stmt.toUpperCase().includes('FOR EACH STATEMENT'),
      condicao: '', funcao: '',
    };
    const mw = R('\\bWHEN\\s*\\(', 'i').exec(stmt);
    if (mw) {
      const cond = extrairExpressaoEntreParenteses(stmt.substring(mw.index));
      g.condicao = cond === null ? '' : cond;
    }
    const mf = R('EXECUTE\\s+(?:FUNCTION|PROCEDURE)\\s+(.+?)\\s*$', 'is').exec(jtrim(stmt));
    if (mf) {
      g.funcao = jtrim(mf[1]);
      if (g.funcao.endsWith(';')) g.funcao = jtrim(g.funcao.substring(0, g.funcao.length - 1));
    }
    const t = this.buscarTabela(defs, g.tabela);
    if (!t) {
      this.avisos.push('CREATE TRIGGER ignorado: tabela não encontrada no script: ' + g.tabela);
      return;
    }
    t.gatilhos.push(g);
  }

  protected separarSchema(nomeCompleto: string | null): [string | null, string] {
    const s = nomeCompleto === null ? '' : jtrim(nomeCompleto);
    let corte = -1;
    let fechamento = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (fechamento !== '') {
        if (c === fechamento) fechamento = '';
        continue;
      }
      if (c === '"' || c === '`') fechamento = c;
      else if (c === '[') fechamento = ']';
      else if (c === '.') { corte = i; break; }
    }
    if (corte < 0) return [null, desqualificar(s)];
    return [desqualificar(s.substring(0, corte)), desqualificar(s.substring(corte + 1))];
  }

  protected parseCreateIndex(stmt: string, defs: DefTabela[]): void {
    const p = R('CREATE\\s+(UNIQUE\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?(' + ID + '+)?\\s*ON\\s+(' + IDQ + '+)\\s*(?:USING\\s+([a-zA-Z0-9_]+)\\s*)?\\(', 'is');
    const m = p.exec(jtrim(stmt));
    if (!m) {
      this.avisos.push('Instrução CREATE INDEX não reconhecida: ' + resumir(stmt));
      return;
    }
    const ind: DefIndice = {
      unico: m[1] !== undefined,
      nome: m[2] === undefined ? '' : desqualificar(m[2]),
      tabela: semSchema(desqualificar(m[3])),
      metodo: m[4] === undefined ? '' : m[4],
      condicao: '', colunas: [],
    };
    const listaCols = extrairExpressaoEntreParenteses(stmt.substring(m.index + m[0].length - 1));
    if (listaCols === null) {
      this.avisos.push('CREATE INDEX sem lista de colunas reconhecível: ' + resumir(stmt));
      return;
    }
    for (const c of splitItensCorpo(listaCols)) {
      const nomeCol = desqualificar(jsplit(jtrim(c), R('\\s+'))[0] ?? '');
      if (nomeCol !== '') ind.colunas.push(nomeCol);
    }
    const idxWhere = stmt.toUpperCase().lastIndexOf(' WHERE ');
    if (idxWhere > -1) {
      ind.condicao = jtrim(stmt.substring(idxWhere + 7));
      if (ind.condicao.endsWith(';')) ind.condicao = jtrim(ind.condicao.substring(0, ind.condicao.length - 1));
    }
    const t = this.buscarTabela(defs, ind.tabela);
    if (!t) {
      this.avisos.push('CREATE INDEX ignorado: tabela não encontrada no script: ' + ind.tabela);
      return;
    }
    t.indices.push(ind);
  }

  protected limparComplementoImportado(compl: string): string {
    if (!compl) return '';
    let res = compl;
    const idxRef = res.toUpperCase().indexOf('REFERENCES');
    if (idxRef >= 0) res = res.substring(0, idxRef);
    res = res.replace(R('\\bPRIMARY\\s+KEY\\b', 'gi'), ' ');
    res = res.replace(R('\\bUNIQUE\\b', 'gi'), ' ');
    return jtrim(res).replace(R('\\s+', 'g'), ' ');
  }

  protected parseFK(item: string): DefConstraint | null {
    const c = this.novaConstraint('FK');
    const m = R('(?:CONSTRAINT\\s+(' + ID + '+)\\s+)?FOREIGN\\s+KEY\\s*\\(([^)]*)\\)\\s+REFERENCES\\s+(' + IDQ + '+)\\s*\\(([^)]*)\\)', 'i').exec(item);
    if (!m) {
      this.avisos.push('FOREIGN KEY mal formada: ' + resumir(item));
      return null;
    }
    if (m[1] !== undefined) c.nome = desqualificar(m[1]);
    c.colunas.push(...splitVirgula(m[2]));
    const refCompleto = desqualificar(m[3]);
    const ponto = refCompleto.indexOf('.');
    if (ponto > -1) {
      c.refSchema = refCompleto.substring(0, ponto);
      c.refTabela = refCompleto.substring(ponto + 1);
    } else {
      c.refTabela = refCompleto;
    }
    c.refColunas.push(...splitVirgula(m[4]));
    return c;
  }

  protected parseFKInline(resto: string): DefConstraint | null {
    const c = this.novaConstraint('FK');
    const m = R('REFERENCES\\s+(' + IDQ + '+)\\s*\\(([^)]*)\\)', 'i').exec(resto);
    if (!m) return null;
    const refCompleto = desqualificar(m[1]);
    const ponto = refCompleto.indexOf('.');
    if (ponto > -1) {
      c.refSchema = refCompleto.substring(0, ponto);
      c.refTabela = refCompleto.substring(ponto + 1);
    } else {
      c.refTabela = refCompleto;
    }
    c.refColunas.push(...splitVirgula(m[2]));
    return c;
  }

  protected parseAlterTable(stmt: string, defs: DefTabela[]): void {
    const mTab = R('ALTER\\s+TABLE\\s+(?:IF\\s+(?:NOT\\s+)?EXISTS\\s+)?(' + IDQ + '+)', 'i').exec(stmt);
    if (!mTab) return;
    const nomeTab = desqualificar(mTab[1]);
    const nomeSimples = semSchema(nomeTab);
    const t = this.buscarTabela(defs, nomeSimples);
    if (!t) {
      this.avisos.push('ALTER TABLE: tabela não encontrada no script nem no modelo: ' + nomeTab);
      return;
    }
    const stmtUp = stmt.toUpperCase();
    let idxAdd = stmtUp.indexOf(' ADD ');
    if (idxAdd < 0) idxAdd = stmtUp.indexOf(' ADD');
    if (idxAdd < 0) return;
    idxAdd = idxAdd + 1;
    const parte = jtrim(stmt.substring(idxAdd + 3));
    const pu = parte.toUpperCase();

    if (pu.startsWith('PRIMARY KEY') || (pu.startsWith('CONSTRAINT') && pu.includes('PRIMARY KEY'))) {
      const c = this.novaConstraint('PK');
      const mc = R('(?:CONSTRAINT\\s+(' + ID + '+)\\s+)?PRIMARY\\s+KEY\\s*\\(([^)]*)\\)', 'i').exec(parte);
      if (mc) {
        if (mc[1] !== undefined) c.nome = desqualificar(mc[1]);
        c.colunas.push(...splitVirgula(mc[2]));
        t.constraints.push(c);
      }
    } else if (pu.startsWith('UNIQUE') || (pu.startsWith('CONSTRAINT') && pu.includes('UNIQUE'))) {
      const c = this.novaConstraint('UNIQUE');
      const mc = R('(?:CONSTRAINT\\s+(' + ID + '+)\\s+)?UNIQUE\\s*\\(([^)]*)\\)', 'i').exec(parte);
      if (mc) {
        if (mc[1] !== undefined) c.nome = desqualificar(mc[1]);
        c.colunas.push(...splitVirgula(mc[2]));
        t.constraints.push(c);
      }
    } else if (pu.startsWith('FOREIGN KEY') || (pu.startsWith('CONSTRAINT') && pu.includes('FOREIGN KEY'))) {
      const c = this.parseFK(parte);
      if (c) t.constraints.push(c);
    } else if (pu.startsWith('CHECK') || (pu.startsWith('CONSTRAINT') && pu.includes('CHECK'))) {
      const c = this.novaConstraint('CHECK');
      const mc = R('CONSTRAINT\\s+(' + ID + '+)\\s+CHECK\\s*\\(', 'i').exec(parte);
      if (mc) c.nome = desqualificar(mc[1]);
      c.expressao = extrairExpressaoEntreParenteses(parte);
      if (c.expressao === null) this.avisos.push('CHECK não reconhecido em ' + t.nome + ': ' + resumir(parte));
      else t.constraints.push(c);
    } else {
      this.avisos.push('ALTER TABLE em ' + t.nome + ' ignorado: ' + resumir(parte));
    }
  }

  protected parseComment(stmt: string, defs: DefTabela[]): void {
    const s = jtrim(stmt);
    if (s.length < 11) throw new Error('begin 11, end ' + s.length + ', length ' + s.length);
    const resto = jtrim(s.substring(11));
    const ru = resto.toUpperCase();
    const isTable = ru.startsWith('TABLE ');
    const isColumn = ru.startsWith('COLUMN ');
    if (!isTable && !isColumn) return;
    if (isTable) {
      const m = R('TABLE\\s+(' + IDQ + '+)\\s+IS\\s+', 'i').exec(resto);
      if (!m) return;
      const comentario = extrairStringConcatenada(resto.substring(m.index + m[0].length));
      if (comentario === null) return;
      const nomeTab = desqualificar(m[1]);
      const t = this.buscarTabela(defs, semSchema(nomeTab));
      if (!t) {
        this.avisos.push('COMMENT ON TABLE: tabela não encontrada: ' + nomeTab);
        return;
      }
      t.comentario = comentario;
    } else {
      const m = R('COLUMN\\s+(' + IDQ + '+)\\s+IS\\s+', 'i').exec(resto);
      if (!m) return;
      const comentario = extrairStringConcatenada(resto.substring(m.index + m[0].length));
      if (comentario === null) return;
      const nomeCompleto = desqualificar(m[1]);
      const partes = jsplit(nomeCompleto, /\./);
      if (partes.length < 2) return;
      const nomeCol = partes[partes.length - 1];
      const nomeTab = partes[partes.length - 2];
      const t = this.buscarTabela(defs, nomeTab);
      if (!t) {
        this.avisos.push('COMMENT ON COLUMN: tabela não encontrada: ' + nomeTab);
        return;
      }
      for (const dc of t.colunas) {
        if (eqIC(dc.nome, nomeCol)) { dc.comentario = comentario; return; }
      }
      this.avisos.push('COMMENT ON COLUMN: coluna não encontrada: ' + nomeTab + '.' + nomeCol);
    }
  }

  protected buscarTabela(defs: DefTabela[], nome: string): DefTabela | null {
    for (const t of defs) if (eqIC(t.nome, nome)) return t;
    return null;
  }

}

// ---------------------------------------------------------------------------------------------
// Funções de parser sem estado
// ---------------------------------------------------------------------------------------------
function fimDoBlocoDollar(s: string, i: number): number {
  if (i >= s.length || s[i] !== '$') return -1;
  let j = i + 1;
  while (j < s.length && (isLD(s[j]) || s[j] === '_')) j++;
  if (j >= s.length || s[j] !== '$') return -1;
  const tag = s.substring(i, j + 1);
  const fim = s.indexOf(tag, j + 1);
  return fim < 0 ? s.length : fim + tag.length;
}

function splitItensCorpo(corpo: string): string[] {
  const res: string[] = [];
  let cur = '';
  let parenteses = 0;
  let emAspa = false;
  for (let i = 0; i < corpo.length; i++) {
    const c = corpo[i];
    if (c === "'" && !emAspa) { emAspa = true; cur += c; continue; }
    if (c === "'" && emAspa) {
      if (i + 1 < corpo.length && corpo[i + 1] === "'") { cur += c + corpo[i + 1]; i++; continue; }
      emAspa = false; cur += c; continue;
    }
    if (!emAspa && c === '(') parenteses++;
    if (!emAspa && c === ')') parenteses--;
    if (!emAspa && c === ',' && parenteses === 0) {
      const st = jtrim(cur);
      if (st !== '') res.push(st);
      cur = '';
      continue;
    }
    cur += c;
  }
  const st = jtrim(cur);
  if (st !== '') res.push(st);
  return res;
}

function fimDoGrupoParenteses(s: string, idxAbre: number): number {
  let prof = 0;
  let emAspa = false;
  for (let i = idxAbre; i < s.length; i++) {
    const c = s[i];
    if (c === "'") {
      if (emAspa && i + 1 < s.length && s[i + 1] === "'") { i++; continue; }
      emAspa = !emAspa;
      continue;
    }
    if (emAspa) continue;
    if (c === '(') prof++;
    else if (c === ')') {
      prof--;
      if (prof === 0) return i;
    }
  }
  return -1;
}

function extrairExpressaoEntreParenteses(item: string): string | null {
  const ini = item.indexOf('(');
  if (ini < 0) return null;
  let prof = 0;
  let emAspa = false;
  for (let i = ini; i < item.length; i++) {
    const c = item[i];
    if (c === "'") {
      if (emAspa && i + 1 < item.length && item[i + 1] === "'") { i++; continue; }
      emAspa = !emAspa;
      continue;
    }
    if (emAspa) continue;
    if (c === '(') prof++;
    else if (c === ')') {
      prof--;
      if (prof === 0) {
        const expr = jtrim(item.substring(ini + 1, i));
        return expr === '' ? null : expr;
      }
    }
  }
  return null;
}

function extrairColunasEntreParenteses(item: string): string[] {
  const m = /\(([^)]*)\)/.exec(item);
  return m ? splitVirgula(m[1]) : [];
}

function splitVirgula(s: string | null): string[] {
  const res: string[] = [];
  if (s === null) return res;
  for (const p of jsplit(s, ',')) {
    const t = desqualificar(jtrim(p));
    if (t !== '') res.push(t);
  }
  return res;
}

function desqualificar(s: string | null): string {
  if (s === null) return '';
  s = jtrim(s);
  if (s === '') return s;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('`') && s.endsWith('`'))) {
    s = s.substring(1, s.length - 1);
  } else if (s.startsWith('[') && s.endsWith(']')) {
    s = s.substring(1, s.length - 1);
  }
  return s;
}

function extrairStringConcatenada(s: string): string | null {
  let i = 0;
  while (i < s.length && isWs(s[i])) i++;
  if (i >= s.length || s[i] !== "'") return null;
  let sb = '';
  while (i < s.length && s[i] === "'") {
    i++;
    const inicio = i;
    while (i < s.length) {
      if (s[i] === "'") {
        if (i + 1 < s.length && s[i + 1] === "'") { i += 2; continue; }
        break;
      }
      i++;
    }
    sb += s.substring(inicio, i).split("''").join("'");
    if (i < s.length) i++;
    let j = i;
    while (j < s.length && isWs(s[j])) j++;
    if (j < s.length && s[j] === "'") i = j;
    else break;
  }
  return sb;
}

function semSchema(nomeCompleto: string): string {
  const p = nomeCompleto.indexOf('.');
  return p > -1 ? nomeCompleto.substring(p + 1) : nomeCompleto;
}

// ---------------------------------------------------------------------------------------------------------
// Importação para o Conceitual
// ---------------------------------------------------------------------------------------------------------

/** Larguras (px) dos caracteres 32..383 da fonte Dialog 12. */
const LARGURAS_DIALOG12 = [3,3,5,8,7,10,9,3,4,4,7,7,3,4,3,4,7,7,7,7,7,7,7,7,7,7,3,3,7,7,7,5,11,8,8,8,9,7,6,9,9,4,3,7,6,11,9,9,7,9,7,7,7,9,7,11,7,7,7,4,4,4,7,5,3,7,7,6,7,7,4,7,7,3,3,6,3,11,7,7,7,7,5,6,4,7,6,9,6,6,6,5,7,5,7,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,3,7,7,7,7,7,6,7,10,4,6,7,4,10,6,5,7,4,4,3,7,8,3,3,4,5,6,9,9,9,5,8,8,8,8,8,8,11,8,7,7,7,7,4,4,4,4,9,9,9,9,9,9,9,7,9,9,9,9,9,7,7,8,7,7,7,7,7,7,10,6,7,7,7,7,3,3,3,3,7,7,7,7,7,7,7,7,7,7,7,7,7,6,7,6,8,7,8,7,8,7,8,6,8,6,8,6,8,6,9,7,9,7,7,7,7,7,7,7,7,7,7,7,9,7,9,7,9,7,9,7,9,7,9,7,4,3,4,3,4,3,4,3,4,3,7,6,3,3,7,6,6,6,3,6,3,6,3,6,3,6,3,9,7,9,7,9,7,8,9,7,9,7,9,7,9,7,11,11,7,5,7,5,7,5,7,6,7,6,7,6,7,6,7,4,7,4,7,4,9,7,9,7,9,7,9,7,9,7,9,7,11,9,7,6,7,7,6,7,6,7,6,4];

/** Largura do texto na fonte Dialog 12 (caracteres fora da tabela contam 7). */
function larguraTexto(s: string): number {
  let t = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    t += c >= 32 && c < 384 ? LARGURAS_DIALOG12[c - 32] : 7;
  }
  return t;
}

/** Interseção de retângulos. */
function intersecta(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.w > 0 && a.h > 0 && b.w > 0 && b.h > 0 && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const idivi = (a: number, b: number): number => Math.trunc(a / b);

class ImportadorConceitual extends ParserDdl {
  private gd = new GDiagrama();
  private entidadesCriadas = new Map<string, GForma>();
  private entidadesNovas: GForma[] = [];
  private atributosPorEntidade = new Map<string, GForma>();
  private losangos: { x: number; y: number; w: number; h: number }[] = [];

  private parse(script: string): DefTabela[] {
    const res: DefTabela[] = [];
    const s = this.normalizar(script);
    const statements = this.splitStatements(s);
    for (const stmt of statements) {
      const up = jtrim(stmt).toUpperCase();
      if (up.startsWith('CREATE TABLE')) {
        let t = this.parseCreateParticao(stmt);
        if (t === null) t = this.parseCreateTable(stmt);
        if (t !== null) res.push(t);
      }
    }
    for (const stmt of statements) {
      if (jtrim(stmt).toUpperCase().startsWith('ALTER TABLE')) this.parseAlterTable(stmt, res);
    }
    for (const stmt of statements) {
      const up = jtrim(stmt).toUpperCase();
      if (up.startsWith('CREATE INDEX') || up.startsWith('CREATE UNIQUE INDEX')) this.parseCreateIndex(stmt, res);
    }
    for (const stmt of statements) {
      const up = jtrim(stmt).toUpperCase();
      if (up.startsWith('CREATE TRIGGER') || up.startsWith('CREATE OR REPLACE TRIGGER') || up.startsWith('CREATE CONSTRAINT TRIGGER')) {
        this.parseCreateTrigger(stmt, res);
      }
    }
    for (const stmt of statements) {
      if (jtrim(stmt).toUpperCase().startsWith('COMMENT ON')) this.parseComment(stmt, res);
    }
    for (const t of res) {
      for (const c of t.constraints) {
        if (c.tipo === 'PK') {
          for (const nomeCol of c.colunas) {
            for (const dc of t.colunas) {
              if (eqIC(dc.nome, nomeCol)) {
                dc.primaryKey = true;
                break;
              }
            }
          }
        }
      }
    }
    return res;
  }

  processar(script: string): boolean {
    const defs = this.parse(script);
    if (defs.length === 0) {
      this.erros.push('Nenhuma instrução CREATE TABLE encontrada no script.');
      return false;
    }
    this.aplicarEntidades(defs);
    this.organize();
    this.aplicarRelacionamentos(defs);
    return true;
  }

  /** `organizeDiagramaConceitual`: reorganiza os atributos de cada entidade nova. */
  organize(): void {
    for (const e of this.entidadesNovas) this.gd.organizeAtributos(e);
  }

  get diagrama(): GDiagrama {
    return this.gd;
  }

  private aplicarEntidades(defs: DefTabela[]): void {
    const maxPorLinha = 3;
    const x0 = 100;
    const y0 = 100;
    const dx = 700;
    const dy = 650;
    let coluna = 0;
    let linha = 0;
    for (const d of defs) {
      const ent = this.gd.nova('ent', x0 + coluna * dx, y0 + linha * dy, 120, 58);
      ent.reenquadre();
      ent.texto = d.nome;
      if (d.comentario !== '') ent.descricao = d.comentario;
      this.entidadesCriadas.set(d.nome.toLowerCase(), ent);
      this.entidadesNovas.push(ent);
      let i = 0;
      for (const dc of d.colunas) {
        const atr = this.criarAtributo(ent, dc, i);
        this.atributosPorEntidade.set(d.nome.toLowerCase() + '.' + dc.nome.toLowerCase(), atr);
        i++;
      }
      for (const dc of d.colunas) {
        if (dc.primaryKey) {
          const atr = this.atributosPorEntidade.get(d.nome.toLowerCase() + '.' + dc.nome.toLowerCase());
          if (atr) {
            if (atr.extra.opcional === true) {
              atr.extra.opcional = false;
              atr.extra.cardMin = 1;
            }
            atr.extra.identificador = true;
          }
        }
      }
      coluna++;
      if (coluna >= maxPorLinha) {
        coluna = 0;
        linha++;
      }
    }
    for (const d of defs) {
      for (const dc of d.colunas) {
        const fks = this.inlineFKs.get(dc);
        if (fks) for (const fk of fks) d.constraints.push(fk);
      }
    }
  }

  private criarAtributo(ent: GForma, dc: DefColuna, index: number): GForma {
    const lado = index % 2 === 0 ? 1 : 3;
    const posNoLado = idivi(index, 2);
    const margem = 15;
    const espaco = 22;
    const x = ent.x + margem + ((posNoLado * espaco) % Math.max(1, ent.w - 2 * margem));
    const y = lado === 1 ? ent.y + 2 : ent.bottom - 2;
    const wa = 7;
    const largAtt = 72;
    const pt2a: [number, number] = lado === 1 ? [x, ent.y - 4 * wa] : [x, ent.bottom + 4 * wa];
    const att = this.gd.nova('attr', pt2a[0], pt2a[1] - wa, largAtt, 2 * wa);
    // la.SuperInicie(0, posi, pt2a): o ponto do atributo (ponta A) em pt2a, o da entidade (ponta B) em posi
    this.gd.novaLigacao(att, ent, [x, y], pt2a);
    att.reenquadre();
    att.texto = dc.nome;
    if (dc.comentario !== '') att.descricao = dc.comentario;
    if (dc.tipo !== '') att.extra.tipo = dc.tipo;
    if (dc.notNull) {
      att.extra.opcional = false;
      att.extra.cardMin = 1;
    } else {
      att.extra.opcional = true;
      att.extra.cardMin = 0;
    }
    return att;
  }

  private aplicarRelacionamentos(defs: DefTabela[]): void {
    for (const d of defs) {
      const entDest = this.entidadesCriadas.get(d.nome.toLowerCase());
      if (!entDest) {
        this.avisos.push('Relacionamento: entidade de destino não encontrada: ' + d.nome);
        continue;
      }
      for (const c of d.constraints) {
        if (c.tipo !== 'FK') continue;
        const entOrig = this.entidadesCriadas.get((c.refTabela ?? '').toLowerCase());
        if (!entOrig) {
          this.avisos.push('Relacionamento: entidade de origem não encontrada: ' + c.refTabela);
          continue;
        }
        this.criarRelacionamento(entOrig, entDest, c);
      }
    }
  }

  private sobreposto(r: { x: number; y: number; w: number; h: number }): boolean {
    for (const o of this.losangos) if (intersecta(r, o)) return true;
    for (const e of this.entidadesCriadas.values()) if (intersecta(r, e)) return true;
    for (const a of this.atributosPorEntidade.values()) if (intersecta(r, a)) return true;
    return false;
  }

  private criarRelacionamento(entOrig: GForma, entDest: GForma, c: DefConstraint): void {
    let x: number;
    let y: number;
    if (entOrig === entDest) {
      x = entOrig.right + 120;
      y = entOrig.y + idivi(entOrig.h, 2) - 25;
    } else {
      const cxOrig = entOrig.x + idivi(entOrig.w, 2);
      const cyOrig = entOrig.y + idivi(entOrig.h, 2);
      const cxDest = entDest.x + idivi(entDest.w, 2);
      const cyDest = entDest.y + idivi(entDest.h, 2);
      x = idivi(cxOrig + cxDest, 2);
      y = idivi(cyOrig + cyDest, 2);
      if (Math.abs(cyOrig - cyDest) < 100) y = Math.max(cyOrig, cyDest) + 80;
      if (Math.abs(cxOrig - cxDest) < 100) x = Math.max(cxOrig, cxDest) + 100;
    }
    let nomeRel = c.nome;
    if (nomeRel !== null && nomeRel !== '') {
      nomeRel = nomeRel.replace(/_fkey$/i, '').replace(/_fk$/i, '');
      nomeRel = nomeRel.replace(/^tb_/i, '');
      const prefixoDest = entDest.texto.replace(/^tb_/i, '');
      if (nomeRel.startsWith(prefixoDest + '_')) nomeRel = nomeRel.substring(prefixoDest.length + 1);
    } else {
      nomeRel = 'rel';
    }
    if (nomeRel.length > 20) nomeRel = nomeRel.substring(0, 18) + '..';

    const textWidth = larguraTexto(nomeRel) + 40;
    const largura = Math.max(150, textWidth);
    const altura = 50;
    let losango = { x: x - idivi(largura, 2), y: y - idivi(altura, 2), w: largura, h: altura };
    let offset = 0;
    while (this.sobreposto(losango)) {
      offset += 60;
      losango = { x: x - idivi(largura, 2), y: y - idivi(altura, 2) + offset, w: largura, h: altura };
    }
    this.losangos.push(losango);

    const rel = this.gd.nova('rel', losango.x, losango.y, largura, altura);
    rel.texto = nomeRel;
    rel.reenquadre();

    const ligar = (ent: GForma, ptEnt: [number, number], card: number): void => {
      const ptRel = melhorPontoDeLigacao(rel, ptEnt);
      const lig = this.gd.novaLigacao(rel, ent, ptEnt, ptRel);
      this.gd.prepareCardinalidade(lig);
      lig.cardTexto = card;
    };
    ligar(entOrig, [entOrig.right - 2, entOrig.y + idivi(entOrig.h, 2)], 2);
    ligar(entDest, [entDest.x + 2, entDest.y + idivi(entDest.h, 2)], 3);
  }
}

/** `Forma.getMelhorPontoDeLigacao`: ponto colateral (com recuo de 2px para dentro) mais próximo. */
function melhorPontoDeLigacao(f: GForma, p: [number, number]): [number, number] {
  const pts: [number, number][] = [
    [f.x, f.y + idivi(f.h, 2)], [f.x + idivi(f.w, 2), f.y], [f.x + f.w, f.y + idivi(f.h, 2)], [f.x + idivi(f.w, 2), f.y + f.h],
  ];
  let mx = 0;
  let dm = Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]);
  for (let i = 1; i < 4; i++) {
    const d = Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]);
    if (dm > d) {
      mx = i;
      dm = d;
    }
  }
  switch (mx) {
    case 0: return [pts[0][0] + 2, pts[0][1]];
    case 1: return [pts[1][0], pts[1][1] + 2];
    case 2: return [pts[2][0] - 2, pts[2][1]];
    default: return [pts[3][0], pts[3][1] - 2];
  }
}

/** DDL -> Diagrama conceitual. */
export function importarDdlConceitual(script: string, nome = ''): { diagrama: Diagrama; avisos: string[]; erros: string[] } {
  const imp = new ImportadorConceitual();
  let sn = false;
  try {
    sn = imp.processar(script);
  } catch (e) {
    imp.erros.push('Erro durante a importação: ' + (e as Error).message);
  }
  if (sn) imp.organize();
  return { diagrama: serializarConceitual(imp.diagrama, nome), avisos: imp.avisos, erros: imp.erros };
}
