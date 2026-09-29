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
 * Importar DDL (Lógico).
 *
 * O parser trabalha com regex e cortes de string, e o modelo intermediário (MTabela/MCampo/MConstraint) aplica os
 * efeitos de marcar chave, unique, FK e tipo em cada campo e de validar/adicionar constraints, porque são eles
 * que decidem, por exemplo, em qual constraint UNIQUE cada coluna cai.
 *
 * O layout resultante é a grade de aplicarTabelas/aplicarOutros (sem organização automática posterior).
 */
import { Diagrama, Forma, Ligacao } from '../modelo/tipos';

// ---------------------------------------------------------------------------------------------
// Utilitários de texto
// ---------------------------------------------------------------------------------------------
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
interface DefSequencia { nome: string; schema: string | null; incremento: string; inicio: string; minimo: string; maximo: string; ciclo: boolean }
interface DefTipoCustom {
  nome: string; schema: string | null; ehEnum: boolean; tipoBase: string; valorDefault: string; restricao: string; naoNulo: boolean; valores: string[];
}
interface DefRotina { nome: string; schema: string | null; procedure: boolean; parametros: string; retorno: string; linguagem: string; corpo: string }
interface DefVisao { nome: string; schema: string | null; materializada: boolean; corpo: string }
interface DefEsquema { visoes: DefVisao[]; sequencias: DefSequencia[]; tipos: DefTipoCustom[]; rotinas: DefRotina[] }

// ---------------------------------------------------------------------------------------------
// Modelo Lógico emulado (Campo/Tabela/Constraint/Indice/Gatilho)
// ---------------------------------------------------------------------------------------------
type TipoC = 'PK' | 'UNIQUE' | 'FK' | 'CHECK';
const MSG_CMP_CHANGE_TIPO = 6;
const MSG_IR_CHANGE_ADD_CMP = 2;

class MDiagrama {
  tabelas: MTabela[] = [];
  reciveNotifiqueIR(cons: MConstraint | null, msg: number, cmp: MCampo | null): void {
    if (msg === MSG_CMP_CHANGE_TIPO) {
      if (!cmp) return;
      const campos: MCampo[] = [];
      for (const ta of this.tabelas) {
        for (const c of ta.constraints) {
          let idx = c.camposOrigem.indexOf(cmp);
          if (idx > -1) {
            const tmp = c.camposDestino[idx];
            if (tmp && tmp.tipo !== cmp.tipo) campos.push(tmp);
          } else {
            idx = c.camposDestino.indexOf(cmp);
            if (idx > -1) {
              const tmp = c.camposOrigem[idx];
              if (tmp && tmp.tipo !== cmp.tipo) campos.push(tmp);
            }
          }
        }
      }
      for (const cp of campos) cp.setTipo(cmp.tipo);
    } else if (msg === MSG_IR_CHANGE_ADD_CMP) {
      if (!cons) return;
      for (const ta of this.tabelas) {
        for (const c of ta.constraints) {
          if (c.tipo === 'FK' && c.constraintOrigem === cons) c.valide();
        }
      }
    }
    // Exclusão de campo/IR só ocorre em remoção de campo/constraint,
    // que o importador nunca faz (a remoção de índice não notifica).
  }
}

class MCampo {
  texto = ''; tipo = ''; complemento = ''; valorDefault = ''; dicionario = ''; observacao = '';
  srid = ''; subtipoGeometria = ''; key = false; fkey = false; unique = false; separador = false;
  constructor(readonly tabela: MTabela) { tabela.campos.push(this); }
  setTipo(t: string): void {
    if (this.tipo !== t) {
      this.tipo = t;
      this.tabela.notifiqueIR(null, MSG_CMP_CHANGE_TIPO, this);
    }
  }
  setKey(v: boolean): void {
    if (this.key !== v) { this.key = v; this.tabela.processeIrKey(this); }
  }
  setFkey(v: boolean): void {
    if (this.fkey !== v) { this.fkey = v; this.tabela.processeIrFK(this); }
  }
  setUnique(v: boolean): void {
    if (this.unique !== v) { this.unique = v; this.tabela.processeIrUnique(this); }
  }
}

class MConstraint {
  tipo: TipoC = 'PK';
  nomeada = false;
  nome = '';
  expressao = '';
  camposOrigem: (MCampo | null)[] = [];
  camposDestino: (MCampo | null)[] = [];
  constraintOrigem: MConstraint | null = null;
  ligacao: object | null = null;
  validado = true;
  private novalide = false;
  constructor(readonly tabela: MTabela) { tabela.constraints.push(this); }

  private get tabelaDeOrigem(): MTabela | null {
    if (this.tipo === 'PK' || this.tipo === 'UNIQUE') return this.tabela;
    return this.constraintOrigem ? this.constraintOrigem.tabela : null;
  }

  valide(): void {
    if (this.tipo === 'CHECK') {
      this.validado = jtrim(this.expressao) !== '';
      return;
    }
    if (this.tipo !== 'FK') {
      if (this.camposOrigem.length === 1) {
        const cx = this.camposOrigem[0];
        if (cx && cx.key && cx.unique) { this.validado = false; return; }
      }
      this.validado = true;
      return;
    }
    if (this.ligacao === null) {
      if (this.tabela !== this.tabelaDeOrigem) { this.validado = false; return; }
    }
    if (this.constraintOrigem === null) { this.validado = false; return; }
    if (this.constraintOrigem.camposOrigem.length !== this.camposOrigem.length) { this.validado = false; return; }
    let sn = true;
    for (let i = 0; i < this.camposOrigem.length; i++) {
      const o = this.camposOrigem[i];
      const d = this.camposDestino[i];
      if (!d) throw new Error('campo de destino nulo ao validar a constraint');
      sn = o !== null && o.tipo === d.tipo;
      if (!sn) break;
    }
    if (sn) {
      const teste = new Set<MCampo>();
      let tl = 0;
      for (const c of this.camposOrigem) {
        if (c) {
          tl++;
          teste.add(c);
          if (tl !== teste.size) { sn = false; break; }
        }
      }
    }
    this.validado = sn;
  }

  setExpressao(e: string): void {
    if (this.expressao === e) return;
    this.expressao = e;
    if (this.tipo === 'CHECK') this.valide();
  }

  setTipo(t: TipoC): void {
    if (this.tipo === t) return;
    this.tipo = t;
    if (t === 'FK') this.validado = false;
  }

  setConstraintOrigem(co: MConstraint | null): void {
    if (this.constraintOrigem !== co) {
      if (this.tipo === 'FK') {
        if (co && co.tipo === 'FK') co = null;
        this.constraintOrigem = co;
        const tl = this.camposOrigem.length;
        this.camposOrigem = [];
        for (let i = 0; i < tl; i++) this.camposOrigem.push(null);
        if (!this.novalide) this.valide();
      }
    }
  }

  setLigacao(l: object | null): void {
    if (this.ligacao !== l) {
      this.ligacao = l;
      if (!this.novalide) this.valide();
    }
  }

  /** Add(origem, destino, lig, constraintOrigem) */
  addFK(origem: MCampo | null, destino: MCampo | null, lig: object, orig: MConstraint | null): void {
    this.novalide = true;
    this.setConstraintOrigem(orig);
    this.novalide = false;
    this.novalide = true;
    this.setLigacao(lig);
    this.novalide = false;
    this.add(origem, destino);
  }

  add(origem: MCampo | null, destino: MCampo | null): void {
    if (this.tipo !== 'FK') {
      const idx = this.camposOrigem.indexOf(origem);
      if (idx === -1) {
        this.camposOrigem.push(origem);
        this.camposDestino.push(destino);
      }
    } else {
      const idx = this.camposDestino.indexOf(destino);
      if (idx === -1) {
        this.camposOrigem.push(origem);
        this.camposDestino.push(destino);
      } else {
        this.camposOrigem[idx] = origem;
      }
      if (origem && destino) destino.setTipo(origem.tipo);
    }
    if (!this.novalide) this.valide();
  }
}

class MIndice {
  nome = ''; unico = false; metodo = ''; condicao = '';
  campos: MCampo[] = [];
  constructor(readonly tabela: MTabela) { tabela.indices.push(this); }
  add(c: MCampo): void { if (!this.campos.includes(c)) this.campos.push(c); }
  get nomeFormatado(): string {
    return this.nome !== '' ? this.nome : 'idx_' + this.tabela.texto + '_' + (this.tabela.indices.indexOf(this) + 1);
  }
}

class MGatilho {
  nome = ''; momento = ''; eventos = ''; porLinha = true; condicao = ''; funcao = '';
  constructor(readonly tabela: MTabela) { tabela.gatilhos.push(this); }
}

class MTabela {
  texto = ''; schema = ''; descricao = ''; observacao = '';
  estrategiaParticao = ''; chaveParticao = ''; tabelaPai = ''; limiteParticao = '';
  campos: MCampo[] = [];
  constraints: MConstraint[] = [];
  indices: MIndice[] = [];
  gatilhos: MGatilho[] = [];
  x = 0; y = 0;
  constructor(readonly dl: MDiagrama) { dl.tabelas.push(this); }

  notifiqueIR(cons: MConstraint | null, msg: number, cmp: MCampo | null): void {
    this.dl.reciveNotifiqueIR(cons, msg, cmp);
  }
  getPresentAsUN(cmp: MCampo): MConstraint[] {
    return this.constraints.filter((c) => c.tipo === 'UNIQUE' && c.camposOrigem.indexOf(cmp) > -1);
  }
  processeIrKey(cmp: MCampo): void {
    let pk = this.constraints.find((c) => c.tipo === 'PK') ?? null;
    if (!pk) {
      if (cmp.key) {
        pk = new MConstraint(this);
        pk.setTipo('PK');
        pk.add(cmp, null);
      }
      return;
    }
    if (cmp.key && pk.camposOrigem.indexOf(cmp) === -1) {
      pk.add(cmp, null);
      this.notifiqueIR(pk, MSG_IR_CHANGE_ADD_CMP, cmp);
    }
    // remoção (key=false) nunca acontece na importação
  }
  processeIrUnique(cmp: MCampo): void {
    let pk = this.constraints.find((c) => c.tipo === 'UNIQUE') ?? null;
    if (!pk) {
      if (cmp.unique) {
        pk = new MConstraint(this);
        pk.setTipo('UNIQUE');
        pk.add(cmp, null);
      }
      return;
    }
    if (cmp.unique && pk.camposOrigem.indexOf(cmp) === -1) {
      pk.add(cmp, null);
      this.notifiqueIR(pk, MSG_IR_CHANGE_ADD_CMP, cmp);
    }
  }
  processeIrFK(cmp: MCampo): void {
    let fk = this.constraints.find((c) => c.tipo === 'FK' && !c.validado) ?? null;
    if (!fk) {
      if (cmp.fkey) {
        fk = new MConstraint(this);
        fk.setTipo('FK');
        fk.add(null, cmp);
      }
      return;
    }
    if (cmp.fkey && fk.camposOrigem.indexOf(cmp) === -1) {
      fk.add(null, cmp);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Cláusula DEFAULT: extrair / remover
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
// Importador
// ---------------------------------------------------------------------------------------------
const ID = '[a-zA-Z0-9_"`\\[\\]]';
const IDQ = '[a-zA-Z0-9_"`\\[\\]\\.]';

interface Saida {
  tabelas: MTabela[];
  visoes: { v: DefVisao; x: number; y: number }[];
  sequencias: { s: DefSequencia; x: number; y: number }[];
  tipos: { t: DefTipoCustom; x: number; y: number }[];
  rotinas: { r: DefRotina; x: number; y: number }[];
  ligacoes: { de: MTabela; para: MTabela }[];
}

class Importador {
  erros: string[] = [];
  avisos: string[] = [];
  private inlineFKs = new Map<DefColuna, DefConstraint[]>();
  private tabelasCriadas = new Map<string, MTabela>();
  private camposPorTabela = new Map<MTabela, Map<string, MCampo>>();
  private dl = new MDiagrama();
  saida: Saida = { tabelas: this.dl.tabelas, visoes: [], sequencias: [], tipos: [], rotinas: [], ligacoes: [] };

  processarScript(script: string): boolean {
    const esquema: DefEsquema = { visoes: [], sequencias: [], tipos: [], rotinas: [] };
    const defs = this.parse(script, esquema);
    if (defs.length === 0 && esquema.visoes.length === 0 && esquema.sequencias.length === 0
      && esquema.tipos.length === 0 && esquema.rotinas.length === 0) {
      this.erros.push('Nenhuma instrução CREATE TABLE, VIEW, SEQUENCE, DOMAIN ou TYPE encontrada no script.');
      return false;
    }
    this.aplicarTiposCustomizados(esquema.tipos);
    this.aplicarSequencias(esquema.sequencias, defs.length);
    this.aplicarTabelas(defs);
    this.aplicarConstraints(defs);
    this.aplicarVisoes(esquema.visoes, defs.length);
    this.aplicarRotinas(esquema.rotinas, defs.length, esquema.visoes.length);
    this.aplicarGatilhos(defs);
    return true;
  }

  // ------------------------------------------------------------------ parser
  private parse(script: string, esquema: DefEsquema): DefTabela[] {
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
      const up = jtrim(stmt).toUpperCase();
      if (up.startsWith('CREATE VIEW') || up.startsWith('CREATE OR REPLACE VIEW') || up.startsWith('CREATE MATERIALIZED VIEW')) {
        const v = this.parseCreateView(stmt);
        if (v) esquema.visoes.push(v);
      } else if (up.startsWith('CREATE SEQUENCE')) {
        const q = this.parseCreateSequence(stmt);
        if (q) esquema.sequencias.push(q);
      } else if (up.startsWith('CREATE DOMAIN')) {
        const t = this.parseCreateDomain(stmt);
        if (t) esquema.tipos.push(t);
      } else if (up.startsWith('CREATE TYPE')) {
        const t = this.parseCreateType(stmt);
        if (t) esquema.tipos.push(t);
      } else if (up.startsWith('CREATE FUNCTION') || up.startsWith('CREATE OR REPLACE FUNCTION')
        || up.startsWith('CREATE PROCEDURE') || up.startsWith('CREATE OR REPLACE PROCEDURE')) {
        const r = this.parseCreateRotina(stmt);
        if (r) esquema.rotinas.push(r);
      } else {
        this.avisarObjetoNaoModelado(up, stmt);
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

    // (referenciarTabelaDoModelo: o diagrama de destino é novo, então nunca encontra nada.)

    for (const t of res) {
      for (const c of t.constraints) {
        if (c.tipo === 'PK') {
          for (const nomeCol of c.colunas) {
            for (const dc of t.colunas) {
              if (eqIC(dc.nome, nomeCol)) { dc.primaryKey = true; break; }
            }
          }
        }
      }
    }
    return res;
  }

  private normalizar(script: string): string {
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

  private splitStatements(s: string): string[] {
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

  private novaTabela(): DefTabela {
    return {
      nome: '', schema: null, comentario: '', colunas: [], constraints: [], indices: [], gatilhos: [],
      estrategiaParticao: '', chaveParticao: '', tabelaPai: '', limiteParticao: '',
    };
  }

  private novaConstraint(tipo: TipoC): DefConstraint {
    return { tipo, nome: null, colunas: [], expressao: null, refTabela: null, refSchema: null, refColunas: [] };
  }

  private parseCreateTable(stmt: string): DefTabela | null {
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

  private parseCreateParticao(stmt: string): DefTabela | null {
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

  private capturarParticionamento(t: DefTabela, trecho: string): void {
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

  private parseColuna(item: string): DefColuna | null {
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

  private separarModificadorEspacial(col: DefColuna): void {
    const m = /^(GEOMETRY|GEOGRAPHY)[ \t\n\x0B\f\r]*\(([^)]*)\)$/i.exec(jtrim(col.tipo));
    if (!m) return;
    col.tipo = m[1].toUpperCase();
    const partes = jsplit(m[2], ',');
    const sub = jtrim(partes[0] ?? '');
    if (sub !== '' && sub.toUpperCase() !== 'GEOMETRY') col.subtipoGeometria = sub;
    if (partes.length > 1) col.srid = jtrim(partes[1]);
  }

  private parseCreateRotina(stmt: string): DefRotina | null {
    const p = R('CREATE\\s+(?:OR\\s+REPLACE\\s+)?(FUNCTION|PROCEDURE)\\s+(' + IDQ + '+)\\s*\\(', 'is');
    const bruto = jtrim(stmt);
    const m = p.exec(bruto);
    if (!m) {
      this.avisos.push('Instrução CREATE FUNCTION/PROCEDURE não reconhecida: ' + resumir(stmt));
      return null;
    }
    const mEnd = m.index + m[0].length;
    const partes = this.separarSchema(m[2]);
    const r: DefRotina = {
      nome: partes[1] as string, schema: partes[0], procedure: m[1].toUpperCase() === 'PROCEDURE',
      parametros: '', retorno: '', linguagem: 'plpgsql', corpo: '',
    };
    const daAbertura = stmt.substring(mEnd - 1);
    const params = extrairExpressaoEntreParenteses(daAbertura);
    r.parametros = params === null ? '' : jtrim(params);

    const posDepois = stmt.indexOf(')', mEnd - 1);
    let resto = posDepois > -1 ? stmt.substring(posDepois + 1) : '';
    if (params !== null) {
      const fim = (mEnd - 1) + params.length + 2;
      if (fim <= stmt.length) {
        resto = stmt.substring(fim - 1);
        const fecha = resto.indexOf(')');
        resto = fecha > -1 ? resto.substring(fecha + 1) : resto;
      }
    }
    const mr = R('^\\s*RETURNS\\s+(.+?)\\s+AS\\s', 'is').exec(resto);
    if (mr) r.retorno = jtrim(mr[1]);

    let inicioCorpo = -1;
    for (let i = 0; i < resto.length; i++) {
      if (resto[i] === '$') {
        const fim = fimDoBlocoDollar(resto, i);
        if (fim > i) {
          const tag = resto.substring(i, resto.indexOf('$', i + 1) + 1);
          r.corpo = resto.substring(i + tag.length, Math.max(i + tag.length, fim - tag.length));
          inicioCorpo = i;
          resto = resto.substring(fim);
          break;
        }
      }
    }
    if (inicioCorpo < 0) {
      this.avisos.push('Corpo da rotina "' + r.nome + '" não reconhecido (esperado $$...$$): ' + resumir(stmt));
    }
    const ml = /LANGUAGE[ \t\n\x0B\f\r]+([a-zA-Z0-9_]+)/i.exec(resto);
    if (ml) r.linguagem = ml[1];
    return r;
  }

  private parseCreateTrigger(stmt: string, defs: DefTabela[]): void {
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

  private avisarObjetoNaoModelado(up: string, stmt: string): void {
    const conhecidos = [['CREATE RULE', 'Rule'], ['CREATE EXTENSION', 'Extensão'], ['CREATE SCHEMA', 'Schema']];
    for (const c of conhecidos) {
      if (up.startsWith(c[0])) {
        this.avisos.push(c[1] + ' não é representada no modelo e foi ignorada: ' + resumir(stmt));
        return;
      }
    }
  }

  private separarSchema(nomeCompleto: string | null): [string | null, string] {
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

  private parseCreateSequence(stmt: string): DefSequencia | null {
    const m = R('CREATE\\s+SEQUENCE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(' + IDQ + '+)', 'i').exec(jtrim(stmt));
    if (!m) {
      this.avisos.push('Instrução CREATE SEQUENCE não reconhecida: ' + resumir(stmt));
      return null;
    }
    const partes = this.separarSchema(m[1]);
    const val = (k: string): string => {
      const mm = R('\\b' + k + '\\s+(-?\\d+)', 'i').exec(stmt);
      return mm ? mm[1] : '';
    };
    return {
      nome: partes[1], schema: partes[0],
      incremento: val('INCREMENT(?:\\s+BY)?'), inicio: val('START(?:\\s+WITH)?'),
      minimo: val('MINVALUE'), maximo: val('MAXVALUE'),
      ciclo: R('(?<!NO\\s)\\bCYCLE\\b', 'i').test(stmt),
    };
  }

  private parseCreateDomain(stmt: string): DefTipoCustom | null {
    const m = R('CREATE\\s+DOMAIN\\s+(' + IDQ + '+)\\s+(?:AS\\s+)?(.*)', 'is').exec(jtrim(stmt));
    if (!m) {
      this.avisos.push('Instrução CREATE DOMAIN não reconhecida: ' + resumir(stmt));
      return null;
    }
    const partes = this.separarSchema(m[1]);
    const t: DefTipoCustom = {
      nome: partes[1], schema: partes[0], ehEnum: false, tipoBase: '', valorDefault: '', restricao: '', naoNulo: false, valores: [],
    };
    let resto = jtrim(m[2]);
    const mc = R('\\bCHECK\\s*\\(', 'i').exec(resto);
    if (mc) {
      const r = extrairExpressaoEntreParenteses(resto.substring(mc.index));
      t.restricao = r === null ? '' : r;
      resto = jtrim(resto.substring(0, mc.index));
    }
    t.valorDefault = extrairClausulaDefault(resto);
    resto = removerClausulaDefault(resto);
    if (resto.toUpperCase().includes('NOT NULL')) {
      t.naoNulo = true;
      resto = resto.replace(R('\\bNOT\\s+NULL\\b', 'gi'), ' ');
    }
    t.tipoBase = jtrim(resto).replace(R('\\s+', 'g'), ' ');
    if (t.tipoBase.endsWith(';')) t.tipoBase = jtrim(t.tipoBase.substring(0, t.tipoBase.length - 1));
    return t;
  }

  private parseCreateType(stmt: string): DefTipoCustom | null {
    const bruto = jtrim(stmt);
    const m = R('CREATE\\s+TYPE\\s+(' + IDQ + '+)\\s+AS\\s+ENUM\\s*\\(', 'is').exec(bruto);
    if (!m) {
      this.avisos.push('CREATE TYPE ignorado (só a forma AS ENUM é suportada): ' + resumir(stmt));
      return null;
    }
    const partes = this.separarSchema(m[1]);
    const t: DefTipoCustom = {
      nome: partes[1], schema: partes[0], ehEnum: true, tipoBase: '', valorDefault: '', restricao: '', naoNulo: false, valores: [],
    };
    const lista = extrairExpressaoEntreParenteses(stmt.substring(m.index + m[0].length - 1));
    if (lista === null) {
      this.avisos.push('CREATE TYPE ... AS ENUM sem lista de valores reconhecível: ' + resumir(stmt));
      return null;
    }
    for (const v of splitItensCorpo(lista)) {
      let val = jtrim(v);
      if (val.length > 1 && val.startsWith("'") && val.endsWith("'")) {
        val = val.substring(1, val.length - 1).split("''").join("'");
      }
      if (val !== '') t.valores.push(val);
    }
    return t;
  }

  private parseCreateIndex(stmt: string, defs: DefTabela[]): void {
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

  private limparComplementoImportado(compl: string): string {
    if (!compl) return '';
    let res = compl;
    const idxRef = res.toUpperCase().indexOf('REFERENCES');
    if (idxRef >= 0) res = res.substring(0, idxRef);
    res = res.replace(R('\\bPRIMARY\\s+KEY\\b', 'gi'), ' ');
    res = res.replace(R('\\bUNIQUE\\b', 'gi'), ' ');
    return jtrim(res).replace(R('\\s+', 'g'), ' ');
  }

  private parseCreateView(stmt: string): DefVisao | null {
    const m = R('CREATE\\s+(?:OR\\s+REPLACE\\s+)?(MATERIALIZED\\s+)?VIEW\\s+(' + IDQ + '+)\\s+AS\\s+(.*)', 'is').exec(jtrim(stmt));
    if (!m) {
      this.avisos.push('Instrução CREATE VIEW não reconhecida: ' + resumir(stmt));
      return null;
    }
    const partes = this.separarSchema(m[2]);
    return { materializada: m[1] !== undefined, nome: partes[1], schema: partes[0], corpo: jtrim(m[3]) };
  }

  private parseFK(item: string): DefConstraint | null {
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

  private parseFKInline(resto: string): DefConstraint | null {
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

  private parseAlterTable(stmt: string, defs: DefTabela[]): void {
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

  private parseComment(stmt: string, defs: DefTabela[]): void {
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

  private buscarTabela(defs: DefTabela[], nome: string): DefTabela | null {
    for (const t of defs) if (eqIC(t.nome, nome)) return t;
    return null;
  }

  // ------------------------------------------------------------------ aplicação
  private clampPos(x: number, y: number): [number, number] {
    return [Math.max(0, x), Math.max(0, y)];
  }

  private aplicarTabelas(defs: DefTabela[]): void {
    const total = defs.length;
    const maxPorLinha = Math.min(Math.max(2, Math.ceil(Math.sqrt(total))), 6);
    const x0 = 40, y0 = 40, dx = 240, dy = 200;
    let coluna = 0;
    let linha = 0;
    for (const d of defs) {
      const tab = new MTabela(this.dl);
      [tab.x, tab.y] = this.clampPos(x0 + coluna * dx, y0 + linha * dy);
      tab.texto = d.nome;
      tab.schema = jtrim(d.schema ?? '');
      tab.estrategiaParticao = jtrim(d.estrategiaParticao).toUpperCase();
      tab.chaveParticao = jtrim(d.chaveParticao);
      tab.tabelaPai = jtrim(d.tabelaPai);
      tab.limiteParticao = jtrim(d.limiteParticao);
      if (d.comentario !== '') tab.descricao = d.comentario;
      this.tabelasCriadas.set(d.nome.toLowerCase(), tab);
      const mapa = new Map<string, MCampo>();
      this.camposPorTabela.set(tab, mapa);

      for (const dc of d.colunas) {
        const c = new MCampo(tab);
        c.texto = dc.nome;
        if (dc.tipo !== '') c.setTipo(dc.tipo);
        let compl = dc.complemento;
        if (dc.notNull && !compl.toUpperCase().includes('NOT NULL')) {
          compl = (compl === '' ? '' : compl + ' ') + 'NOT NULL';
        }
        c.complemento = compl;
        c.valorDefault = dc.valorDefault;
        c.srid = jtrim(dc.srid);
        c.subtipoGeometria = jtrim(dc.subtipoGeometria);
        if (dc.comentario !== '') c.dicionario = dc.comentario;
        if (dc.primaryKey) c.setKey(true);
        if (dc.unique) c.setUnique(true);
        mapa.set(dc.nome.toLowerCase(), c);

        const fks = this.inlineFKs.get(dc);
        if (fks) for (const fk of fks) d.constraints.push(fk);
      }
      coluna++;
      if (coluna >= maxPorLinha) { coluna = 0; linha++; }
    }
  }

  private aplicarTiposCustomizados(tipos: DefTipoCustom[]): void {
    if (tipos.length === 0) return;
    const x0 = 40, y0 = -180, dx = 210;
    let coluna = 0;
    let linha = 0;
    for (const t of tipos) {
      const [x, y] = this.clampPos(x0 + coluna * dx, y0 - linha * 150);
      this.saida.tipos.push({ t, x, y });
      coluna++;
      if (coluna >= 6) { coluna = 0; linha++; }
    }
  }

  private aplicarSequencias(sequencias: DefSequencia[], totalTabelas: number): void {
    if (sequencias.length === 0) return;
    const maxPorLinhaTabelas = Math.min(Math.max(2, Math.ceil(Math.sqrt(Math.max(totalTabelas, 1)))), 6);
    const x0 = 40 + maxPorLinhaTabelas * 240 + 60;
    const y0 = 40;
    let linha = 0;
    for (const s of sequencias) {
      const [x, y] = this.clampPos(x0, y0 + linha * 140);
      this.saida.sequencias.push({ s, x, y });
      linha++;
    }
  }

  private aplicarRotinas(rotinas: DefRotina[], totalTabelas: number, totalVisoes: number): void {
    if (rotinas.length === 0) return;
    const maxPorLinhaTabelas = Math.min(Math.max(2, Math.ceil(Math.sqrt(Math.max(totalTabelas, 1)))), 6);
    const linhasTabelas = totalTabelas === 0 ? 0 : Math.ceil(totalTabelas / maxPorLinhaTabelas);
    const linhasVisoes = totalVisoes === 0 ? 0 : Math.ceil(totalVisoes / 6.0);
    const x0 = 40;
    const y0 = 40 + linhasTabelas * 200 + 60 + linhasVisoes * 160 + 60;
    let coluna = 0;
    let linha = 0;
    for (const r of rotinas) {
      const [x, y] = this.clampPos(x0 + coluna * 240, y0 + linha * 160);
      this.saida.rotinas.push({ r, x, y });
      this.avisos.push((r.procedure ? 'Procedure "' : 'Function "') + r.nome + '" importada sem validação do corpo.');
      coluna++;
      if (coluna >= 4) { coluna = 0; linha++; }
    }
  }

  private aplicarVisoes(visoes: DefVisao[], totalTabelas: number): void {
    if (visoes.length === 0) return;
    const maxPorLinhaTabelas = Math.min(Math.max(2, Math.ceil(Math.sqrt(Math.max(totalTabelas, 1)))), 6);
    const linhasTabelas = totalTabelas === 0 ? 0 : Math.ceil(totalTabelas / maxPorLinhaTabelas);
    const total = visoes.length;
    const maxPorLinha = Math.min(Math.max(2, Math.ceil(Math.sqrt(total))), 6);
    const x0 = 40;
    const y0 = 40 + linhasTabelas * 200 + 60;
    const dx = 260, dy = 160;
    let coluna = 0;
    let linha = 0;
    for (const v of visoes) {
      const [x, y] = this.clampPos(x0 + coluna * dx, y0 + linha * dy);
      this.saida.visoes.push({ v, x, y });
      this.avisos.push((v.materializada ? 'View materializada "' : 'View "') + v.nome
        + '" importada sem validação de sintaxe da consulta.');
      coluna++;
      if (coluna >= maxPorLinha) { coluna = 0; linha++; }
    }
  }

  private aplicarGatilhos(defs: DefTabela[]): void {
    for (const d of defs) {
      const tab = this.tabelasCriadas.get(d.nome.toLowerCase());
      if (!tab) continue;
      for (const dg of d.gatilhos) {
        const g = new MGatilho(tab);
        g.nome = jtrim(dg.nome);
        g.momento = jtrim(dg.momento);
        g.eventos = jtrim(dg.eventos);
        g.porLinha = dg.porLinha;
        g.condicao = jtrim(dg.condicao);
        g.funcao = jtrim(dg.funcao);
      }
    }
  }

  private aplicarConstraints(defs: DefTabela[]): void {
    for (const d of defs) {
      const tab = this.tabelasCriadas.get(d.nome.toLowerCase());
      if (!tab) continue;
      const temPK = d.constraints.some((c) => c.tipo === 'PK');
      if (!temPK) {
        const pk = this.novaConstraint('PK');
        for (const dc of d.colunas) if (dc.primaryKey) pk.colunas.push(dc.nome);
        if (pk.colunas.length > 0) d.constraints.push(pk);
      }
    }
    for (const d of defs) {
      const tab = this.tabelasCriadas.get(d.nome.toLowerCase());
      if (!tab) continue;
      for (const c of d.constraints) {
        if (c.tipo === 'PK') this.aplicarPK(tab, c);
        else if (c.tipo === 'UNIQUE') this.aplicarUnique(tab, c);
        else if (c.tipo === 'CHECK') this.aplicarCheck(tab, c);
      }
    }
    for (const d of defs) {
      const tab = this.tabelasCriadas.get(d.nome.toLowerCase());
      if (!tab) continue;
      for (const c of d.constraints) if (c.tipo === 'FK') this.aplicarFK(tab, c);
    }
    for (const d of defs) {
      const tab = this.tabelasCriadas.get(d.nome.toLowerCase());
      if (!tab) continue;
      for (const di of d.indices) this.aplicarIndice(tab, di);
    }
  }

  private aplicarIndice(tab: MTabela, di: DefIndice): void {
    const mapa = this.camposPorTabela.get(tab);
    if (!mapa) {
      this.avisos.push('Índice em ' + tab.texto + ': mapa de campos não encontrado');
      return;
    }
    const ind = new MIndice(tab);
    if (di.nome !== '') ind.nome = di.nome;
    ind.unico = di.unico;
    ind.metodo = jtrim(di.metodo);
    ind.condicao = jtrim(di.condicao);
    for (const nomeCol of di.colunas) {
      const cmp = mapa.get(nomeCol.toLowerCase());
      if (!cmp) {
        this.avisos.push('Índice "' + ind.nomeFormatado + '" em ' + tab.texto + ': coluna/expressão não mapeada: ' + nomeCol);
        continue;
      }
      ind.add(cmp);
    }
    if (ind.campos.length === 0) {
      this.avisos.push('Índice "' + ind.nomeFormatado + '" em ' + tab.texto + ' ficou sem coluna reconhecida e foi descartado.');
      tab.indices.splice(tab.indices.indexOf(ind), 1);
    }
  }

  private aplicarPK(tab: MTabela, c: DefConstraint): void {
    const mapa = this.camposPorTabela.get(tab)!;
    let pk = tab.constraints.find((x) => x.tipo === 'PK') ?? null;
    if (!pk) {
      pk = new MConstraint(tab);
      pk.setTipo('PK');
    }
    if (c.nome !== null && c.nome !== '') {
      pk.nomeada = true;
      pk.nome = c.nome;
    }
    for (const nomeCol of c.colunas) {
      const cmp = mapa.get(nomeCol.toLowerCase());
      if (!cmp) {
        this.avisos.push('PK ' + tab.texto + ': coluna não encontrada: ' + nomeCol);
        continue;
      }
      cmp.setKey(true);
      if (pk.camposOrigem.indexOf(cmp) === -1) pk.add(cmp, null);
    }
  }

  private aplicarCheck(tab: MTabela, c: DefConstraint): void {
    const chk = new MConstraint(tab);
    chk.setTipo('CHECK');
    if (c.nome !== null && c.nome !== '') {
      chk.nomeada = true;
      chk.nome = c.nome;
    }
    chk.setExpressao(c.expressao ?? '');
    chk.valide();
    this.avisos.push('CHECK importado em "' + tab.texto + '" sem validação da expressão: ' + resumir(c.expressao ?? ''));
  }

  private aplicarUnique(tab: MTabela, c: DefConstraint): void {
    const mapa = this.camposPorTabela.get(tab)!;
    const un = new MConstraint(tab);
    un.setTipo('UNIQUE');
    if (c.nome !== null && c.nome !== '') {
      un.nomeada = true;
      un.nome = c.nome;
    }
    for (const nomeCol of c.colunas) {
      const cmp = mapa.get(nomeCol.toLowerCase());
      if (!cmp) {
        this.avisos.push('UNIQUE ' + tab.texto + ': coluna não encontrada: ' + nomeCol);
        continue;
      }
      cmp.setUnique(true);
      un.add(cmp, null);
    }
  }

  private cobreColunas(camposConstraint: (MCampo | null)[], refColunas: string[], tabOrigem: MTabela): boolean {
    if (camposConstraint.length !== refColunas.length) return false;
    const mapa = this.camposPorTabela.get(tabOrigem);
    if (!mapa) return false;
    for (let i = 0; i < refColunas.length; i++) {
      const cmp = mapa.get(refColunas[i].toLowerCase());
      if (!cmp || camposConstraint.indexOf(cmp) === -1) return false;
    }
    return true;
  }

  private aplicarFK(tab: MTabela, c: DefConstraint): void {
    const tabOrigem = this.tabelasCriadas.get((c.refTabela as string).toLowerCase());
    if (!tabOrigem) {
      this.avisos.push('FK em ' + tab.texto + ': tabela de origem não encontrada: ' + c.refTabela);
      return;
    }
    const mapaOrigem = this.camposPorTabela.get(tabOrigem)!;
    const mapaDest = this.camposPorTabela.get(tab)!;
    let consOrigem: MConstraint | null = null;
    if (c.refColunas.length > 0) {
      consOrigem = tabOrigem.constraints.find((x) => x.tipo === 'PK' && this.cobreColunas(x.camposOrigem, c.refColunas, tabOrigem)) ?? null;
      if (!consOrigem) {
        consOrigem = tabOrigem.constraints.find((x) => x.tipo === 'UNIQUE' && this.cobreColunas(x.camposOrigem, c.refColunas, tabOrigem)) ?? null;
      }
    }
    if (!consOrigem) consOrigem = tabOrigem.constraints.find((x) => x.tipo === 'PK') ?? null;
    if (!consOrigem) {
      this.avisos.push('FK em ' + tab.texto + ': nenhuma PK/UNIQUE encontrada em ' + c.refTabela);
      return;
    }
    const camposOrigem: MCampo[] = [];
    for (const refCol of c.refColunas) {
      const cmpO = mapaOrigem.get(refCol.toLowerCase());
      if (!cmpO) {
        this.avisos.push('FK em ' + tab.texto + ': coluna de origem não encontrada: ' + c.refTabela + '.' + refCol);
        return;
      }
      camposOrigem.push(cmpO);
    }
    if (camposOrigem.length === 0) {
      for (const cmpO of consOrigem.camposOrigem) if (cmpO) camposOrigem.push(cmpO);
    }
    if (camposOrigem.length === 0) {
      this.avisos.push('FK em ' + tab.texto + ': nenhum campo de origem encontrado em ' + c.refTabela);
      return;
    }

    const linha = {};
    this.saida.ligacoes.push({ de: tabOrigem, para: tab });

    const fk = new MConstraint(tab);
    fk.setTipo('FK');
    if (c.nome !== null && c.nome !== '') {
      fk.nomeada = true;
      fk.nome = c.nome;
    }
    let adicionouAlguma = false;
    for (let i = 0; i < c.colunas.length; i++) {
      const nomeCol = c.colunas[i];
      const cmpD = mapaDest.get(nomeCol.toLowerCase());
      if (!cmpD) {
        this.avisos.push('FK em ' + tab.texto + ': coluna local não encontrada: ' + nomeCol);
        continue;
      }
      cmpD.setFkey(true);
      const cmpO = i < camposOrigem.length ? camposOrigem[i] : camposOrigem[camposOrigem.length - 1];
      fk.addFK(cmpO, cmpD, linha, consOrigem);
      adicionouAlguma = true;
    }
    if (adicionouAlguma) fk.valide();
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

// ---------------------------------------------------------------------------------------------
// Saída no JSON do ModelForge
// ---------------------------------------------------------------------------------------------
function construirDiagrama(imp: Importador, nome: string): Diagrama {
  const s = imp.saida;
  let seq = 0;
  const ids = new Map<object, string>();
  const id = (o: object, p: string): string => {
    let v = ids.get(o);
    if (!v) { v = p + seq++; ids.set(o, v); }
    return v;
  };
  const campoRef = (c: MCampo | null): string | null => (c ? id(c, 'c') : null);

  const formas: Forma[] = [];
  for (const t of s.tabelas) {
    const campos = t.campos.map((c) => ({
      id: id(c, 'c'), nome: c.texto, tipo: c.tipo, complemento: c.complemento, padrao: c.valorDefault,
      dicionario: c.dicionario, observacao: c.observacao, srid: c.srid, subtipoGeometria: c.subtipoGeometria,
      pk: c.key, fk: c.fkey, unique: c.unique, separador: c.separador,
    }));
    const constraints = t.constraints.map((c) => ({
      id: id(c, 'k'), tipo: c.tipo, nomeada: c.nomeada, nome: c.nome, expressao: c.expressao,
      camposOrigem: c.camposOrigem.map(campoRef), camposDestino: c.camposDestino.map(campoRef),
      constraintOrigem: c.constraintOrigem
        ? { tabelaId: id(c.constraintOrigem.tabela, 't'), indice: c.constraintOrigem.tabela.constraints.indexOf(c.constraintOrigem) }
        : null,
      onDelete: '', onUpdate: '',
    }));
    const indices = t.indices.map((i) => ({
      id: id(i, 'i'), nome: i.nome, unico: i.unico, metodo: i.metodo, condicao: i.condicao, campos: i.campos.map(campoRef),
    }));
    const gatilhos = t.gatilhos.map((g) => ({
      id: id(g, 'g'), nome: g.nome, momento: g.momento === '' ? 'BEFORE' : g.momento, eventos: g.eventos,
      porLinha: g.porLinha, condicao: g.condicao, funcao: g.funcao,
    }));
    formas.push({
      id: id(t, 't'), kind: 'tabela', x: t.x, y: t.y, w: 150, h: 100, texto: t.texto,
      props: {
        schema: t.schema, descricao: t.descricao, observacao: t.observacao, estrategiaParticao: t.estrategiaParticao,
        chaveParticao: t.chaveParticao, tabelaPai: t.tabelaPai, limiteParticao: t.limiteParticao,
        campos, constraints, indices, gatilhos,
      },
    });
  }
  for (const { v, x, y } of s.visoes) {
    formas.push({
      id: id(v, 'v'), kind: v.materializada ? 'visaoMaterializada' : 'visao', x, y, w: 180, h: 120, texto: v.nome,
      props: { schema: jtrim(v.schema ?? ''), corpo: v.corpo },
    });
  }
  for (const { s: q, x, y } of s.sequencias) {
    formas.push({
      id: id(q, 's'), kind: 'sequencia', x, y, w: 170, h: 110, texto: q.nome,
      props: {
        schema: jtrim(q.schema ?? ''), inicio: jtrim(q.inicio), incremento: jtrim(q.incremento),
        minimo: jtrim(q.minimo), maximo: jtrim(q.maximo), ciclo: q.ciclo,
      },
    });
  }
  for (const { t, x, y } of s.tipos) {
    const props = t.ehEnum
      ? { schema: jtrim(t.schema ?? ''), rotulos: t.valores.join('\n') }
      : {
        schema: jtrim(t.schema ?? ''), tipoBase: jtrim(t.tipoBase), padrao: jtrim(t.valorDefault),
        naoNulo: t.naoNulo, restricao: jtrim(t.restricao),
      };
    formas.push({ id: id(t, 'd'), kind: t.ehEnum ? 'enum' : 'dominio', x, y, w: 180, h: 120, texto: t.nome, props });
  }
  for (const { r, x, y } of s.rotinas) {
    formas.push({
      id: id(r, 'r'), kind: r.procedure ? 'procedure' : 'funcao', x, y, w: 200, h: 130, texto: r.nome,
      props: {
        schema: jtrim(r.schema ?? ''), parametros: jtrim(r.parametros), retorno: jtrim(r.retorno),
        linguagem: jtrim(r.linguagem), corpo: r.corpo,
      },
    });
  }
  const ligacoes: Ligacao[] = s.ligacoes.map((l, i) => ({
    id: 'l' + i, kind: 'logicoLinha', de: id(l.de, 't'), para: id(l.para, 't'), texto: '', cardDe: '1', cardPara: 'n', props: {},
  }));
  return { nome, tipo: 'logico', prefixo: '', formas, ligacoes };
}

/**
 * Importa um script DDL para um diagrama Lógico, com as listas de `avisos` e `erros` na ordem em que ocorreram.
 */
export function importarDdlLogico(script: string, nome = ''): { diagrama: Diagrama; avisos: string[]; erros: string[] } {
  const imp = new Importador();
  try {
    imp.processarScript(script);
  } catch (e) {
    imp.erros.push('Erro durante a importação: ' + (e instanceof Error ? e.message : String(e)));
  }
  return { diagrama: construirDiagrama(imp, nome), avisos: imp.avisos, erros: imp.erros };
}
