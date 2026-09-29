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
 * Geração de DDL ("Converter para físico") do diagrama Lógico: tabelas, campos, constraints, índices,
 * gatilhos, rotinas, sequências, tipos customizados e visões. A saída é conferida, byte a byte, com as
 * fixtures de `backend/test/fixtures`.
 */
import { CampoTabela, ConstraintTabela, Diagrama, Forma, GatilhoTabela, IndiceTabela, PropsTabela } from '../modelo/tipos';
import {
  equalsIgnoreCase,
  escapeSqlIdentifier,
  splitSemVaziosFinais,
  trimAscii,
  qualificarNome,
  QUEBRA_R,
  removerClausulaDefault,
  TIPO_NAO_DEFINIDO,
} from './util';

const EM_BRANCO = '    ';

const s = (v: unknown): string => (v == null ? '' : String(v));

/** Contexto de geração: prefixo, separador e índices de campos por id. */
interface Ctx {
  prefixo: string;
  sepa: string;
  campos: Map<string, CampoTabela>;
  tabelas: Map<string, Forma>;
}

const propsT = (f: Forma): PropsTabela => f.props as PropsTabela;

// ---- Campo -------------------------------------------------------------------

function isEspacial(c: CampoTabela): boolean {
  let t = trimAscii(s(c.tipo)).toUpperCase();
  const par = t.indexOf('(');
  if (par > -1) t = trimAscii(t.substring(0, par));
  return t === 'GEOMETRY' || t === 'GEOGRAPHY';
}

/** Acrescenta o modificador do PostGIS em coluna espacial. */
function getTipoDDL(c: CampoTabela): string {
  const t = s(c.tipo);
  if (!isEspacial(c) || t.indexOf('(') > -1) return t;
  let sub = s(c.subtipoGeometria);
  const sr = s(c.srid);
  if (sub === '' && sr === '') return t;
  if (sub === '') sub = 'Geometry';
  return t + '(' + sub + (sr === '' ? '' : ',' + sr) + ')';
}

/** Complemento do campo sem a cláusula DEFAULT. */
function getComplementoSemDefault(c: CampoTabela): string {
  const compl = s(c.complemento);
  if (compl === '' || s(c.padrao) === '') return compl;
  return removerClausulaDefault(compl);
}

// ---- Tabela ------------------------------------------------------------------

function nomeQualificado(ctx: Ctx, f: Forma): string {
  return qualificarNome(propsT(f).schema, ctx.prefixo, f.texto);
}

function textoCampo(ctx: Ctx, id: string | null): string | null {
  if (id == null) return null;
  return s(ctx.campos.get(id)?.nome);
}

/** Colunas da constraint, separadas por vírgula. */
function getCamposStr(ctx: Ctx, lst: (string | null)[]): string {
  if (!lst || lst.length === 0) return '()';
  const partes = lst.map((id) => {
    const t = textoCampo(ctx, id);
    return t == null ? '[]' : trimAscii(t) === '' ? '?' : t;
  });
  return '(' + partes.join(', ') + ')';
}

/** Expressão do CHECK. */
function getCamposStrCheck(ctx: Ctx, c: ConstraintTabela, lst: (string | null)[]): string {
  if (!lst || lst.length === 0) return '()';
  const partes = lst.map((id) => {
    const t = textoCampo(ctx, id);
    if (t == null) return '[]';
    const idx = c.camposDestino.indexOf(id);
    const origem = idx > -1 ? (c.camposOrigem[idx] ?? null) : null;
    return (trimAscii(t) === '' ? '?' : t) + (origem == null ? '???' : '');
  });
  return '(' + partes.join(', ') + ')';
}

/** DDL da constraint. */
function getDdlConstraint(ctx: Ctx, tab: Forma, c: ConstraintTabela): string {
  const tp = propsT(tab);
  const tabNome = nomeQualificado(ctx, tab);
  const nomeada = !!c.nomeada && trimAscii(s(c.nome)) !== '';
  const sepa = ctx.sepa;
  let txt = '';
  switch (c.tipo) {
    case 'PK':
      if (nomeada) {
        txt = 'ALTER TABLE ' + tabNome + ' ADD CONSTRAINT ' + escapeSqlIdentifier(trimAscii(c.nome)) + ' PRIMARY KEY ' + getCamposStr(ctx, c.camposOrigem);
        txt += sepa;
      } else {
        txt = 'PRIMARY KEY ' + getCamposStr(ctx, c.camposOrigem);
      }
      break;
    case 'UNIQUE':
      if (nomeada) {
        txt = 'ALTER TABLE ' + tabNome + ' ADD CONSTRAINT ' + escapeSqlIdentifier(trimAscii(c.nome)) + ' UNIQUE ' + getCamposStr(ctx, c.camposOrigem);
        txt += sepa;
      } else {
        txt = 'UNIQUE ' + getCamposStr(ctx, c.camposOrigem);
      }
      break;
    case 'CHECK': {
      let expr = trimAscii(s(c.expressao));
      if (expr === '') expr = '???';
      txt = 'ALTER TABLE ' + tabNome + ' ADD ';
      if (nomeada) txt += 'CONSTRAINT ' + escapeSqlIdentifier(trimAscii(c.nome)) + ' ';
      txt += 'CHECK (' + expr + ')' + sepa;
      break;
    }
    case 'FK': {
      let nome: string;
      if (nomeada) {
        nome = escapeSqlIdentifier(s(c.nome));
      } else {
        nome = escapeSqlIdentifier('FK_' + tab.texto + '_' + (tp.constraints.indexOf(c) + 1));
      }
      let tmpCD = getCamposStr(ctx, c.camposOrigem).replace(/\[\]/g, '???');
      let tmpCO = getCamposStrCheck(ctx, c, c.camposDestino);
      const co = origemDe(ctx, c);
      if (co) {
        if (co.constraint.camposOrigem.length > c.camposOrigem.length) {
          tmpCO = tmpCO.substring(0, tmpCO.length - 1) + (c.camposOrigem.length > 0 ? ', ' : '') + '???)';
        }
        if (co.constraint.camposOrigem.length > c.camposDestino.length) {
          tmpCD = tmpCD.substring(0, tmpCD.length - 1) + (c.camposDestino.length > 0 ? ', ' : '') + '???)';
        }
      }
      txt = 'ALTER TABLE ' + tabNome + ' ADD CONSTRAINT ' + nome + '\nFOREIGN KEY ' + tmpCO + '\n';
      txt += 'REFERENCES ' + (co == null ? '??? (???)' : nomeQualificado(ctx, co.tabela) + ' ' + tmpCD);
      const del = s(c.onDelete);
      const upd = s(c.onUpdate);
      if (del !== '' && upd !== '') {
        txt += '\nON DELETE ' + del + ' ON UPDATE ' + upd;
      } else if (del !== '' || upd !== '') {
        txt += '\n';
        txt += del !== '' ? 'ON DELETE ' + del : '';
        txt += upd !== '' ? 'ON UPDATE ' + upd : '';
      }
      txt += sepa;
      break;
    }
  }
  return txt;
}

function origemDe(ctx: Ctx, c: ConstraintTabela): { tabela: Forma; constraint: ConstraintTabela } | null {
  const o = c.constraintOrigem;
  if (!o) return null;
  const tabela = ctx.tabelas.get(o.tabelaId);
  const constraint = tabela ? propsT(tabela).constraints[o.indice] : undefined;
  return tabela && constraint ? { tabela, constraint } : null;
}

/** DDL do índice. */
function getDdlIndice(ctx: Ctx, tab: Forma, ind: IndiceTabela): string {
  const tp = propsT(tab);
  const nomeFormatado = s(ind.nome) !== '' ? s(ind.nome) : 'idx_' + tab.texto + '_' + (tp.indices.indexOf(ind) + 1);
  let sb = ind.unico ? 'CREATE UNIQUE INDEX ' : 'CREATE INDEX ';
  sb += ctx.prefixo + escapeSqlIdentifier(nomeFormatado);
  sb += ' ON ' + nomeQualificado(ctx, tab);
  if (s(ind.metodo) !== '') sb += ' USING ' + ind.metodo;
  sb += ' (';
  const campos = ind.campos ?? [];
  if (campos.length === 0) {
    sb += '???';
  } else {
    sb += campos.map((id) => escapeSqlIdentifier(textoCampo(ctx, id) ?? '')).join(', ');
  }
  sb += ')';
  if (s(ind.condicao) !== '') sb += ' WHERE ' + ind.condicao;
  sb += ctx.sepa;
  return sb;
}

/** DDL do gatilho. */
function getDdlGatilho(ctx: Ctx, tab: Forma, g: GatilhoTabela): string {
  const tp = propsT(tab);
  const nomeFormatado = s(g.nome) === '' ? 'trg_' + tab.texto + '_' + (tp.gatilhos.indexOf(g) + 1) : s(g.nome);
  let sb = 'CREATE TRIGGER ' + escapeSqlIdentifier(nomeFormatado);
  sb += ' ' + s(g.momento);
  sb += ' ' + (s(g.eventos) === '' ? '???' : g.eventos);
  sb += ' ON ' + nomeQualificado(ctx, tab);
  sb += g.porLinha ? ' FOR EACH ROW' : ' FOR EACH STATEMENT';
  if (s(g.condicao) !== '') sb += ' WHEN (' + g.condicao + ')';
  sb += ' EXECUTE FUNCTION ' + (s(g.funcao) === '' ? '???()' : g.funcao);
  sb += ctx.sepa;
  return sb;
}

enum Modo {
  TABELAS,
  INTEGRIDADE_PK_UN_NOMEADAS,
  INTEGRIDADE_FK,
  INDICES,
  GATILHOS,
}

function addSubsDDL(texto: string[], valor: string): void {
  let ax = '';
  for (const a of splitSemVaziosFinais(valor, /\n/)) {
    texto.push(ax + a);
    ax = EM_BRANCO;
  }
}

/** DDL da tabela, nos modos usados pelo DDL completo. */
function ddlTabela(ctx: Ctx, tab: Forma, texto: string[], modo: Modo): void {
  const tp = propsT(tab);
  const tabelaPai = s(tp.tabelaPai);
  const limite = s(tp.limiteParticao);
  const particao = tabelaPai !== '' && limite !== '';
  const herdada = tabelaPai !== '' && limite === '';
  const particionada = s(tp.estrategiaParticao) !== '';
  const constraints = tp.constraints ?? [];

  if (modo === Modo.TABELAS && particao) {
    texto.push(
      'CREATE TABLE ' + nomeQualificado(ctx, tab) + ' PARTITION OF ' + qualificarNome(tp.schema, ctx.prefixo, tabelaPai) +
        (equalsIgnoreCase('DEFAULT', limite) ? ' DEFAULT' : ' FOR VALUES ' + limite) + ctx.sepa,
    );
  }

  if (modo === Modo.TABELAS && !particao) {
    let tmp = 'CREATE TABLE ' + nomeQualificado(ctx, tab) + ' (';
    texto.push(tmp);
    const campos = tp.campos ?? [];
    const totalCampos = campos.length - 1;
    const pk = constraints.find((c) => c.tipo === 'PK') ?? null;
    const nomeada = pk != null && !!pk.nomeada;
    const chaveSimples = pk != null && pk.camposOrigem.length === 1 && !nomeada;
    const pkNoNomeSimples = pk != null && !nomeada && !chaveSimples;
    const uniaoNoNomeComplex = constraints.filter((c) => c.tipo === 'UNIQUE' && !c.nomeada && c.camposOrigem.length > 1);
    const uNoNomeaComplex = uniaoNoNomeComplex.length > 0;

    let contador = 0;
    for (const c of campos) {
      const ehUltimo = contador === totalCampos;
      const compl = getComplementoSemDefault(c);
      let tipoCampo = getTipoDDL(c);
      if (tipoCampo === '') tipoCampo = TIPO_NAO_DEFINIDO;
      tmp = escapeSqlIdentifier(c.nome) + ' ' + tipoCampo + (compl !== '' ? ' ' + compl : '');
      if (s(c.padrao) !== '') tmp += ' DEFAULT ' + c.padrao;
      if (c.pk && chaveSimples) tmp += ' PRIMARY KEY';
      if (c.unique) {
        for (const u of constraints) {
          if (u.tipo === 'UNIQUE' && u.camposOrigem.indexOf(c.id) > -1 && !u.nomeada && u.camposOrigem.length === 1) tmp += ' UNIQUE';
        }
      }
      if (ehUltimo) {
        if (pkNoNomeSimples || uNoNomeaComplex) tmp += ',';
      } else {
        tmp += ',';
      }
      texto.push(EM_BRANCO + tmp);
      contador++;
    }
    if (pkNoNomeSimples) texto.push(EM_BRANCO + getDdlConstraint(ctx, tab, pk!) + (uNoNomeaComplex ? ',' : ''));
    if (uNoNomeaComplex) {
      const total = uniaoNoNomeComplex.length;
      let cont = 0;
      for (const c of uniaoNoNomeComplex) {
        cont++;
        texto.push(EM_BRANCO + getDdlConstraint(ctx, tab, c) + (cont !== total ? ',' : ''));
      }
    }
    if (texto.length === 1) texto.push(' ');
    let fecho = ')';
    if (particionada) fecho += ' PARTITION BY ' + tp.estrategiaParticao + ' (' + (s(tp.chaveParticao) === '' ? '???' : tp.chaveParticao) + ')';
    if (herdada) fecho += ' INHERITS (' + qualificarNome(tp.schema, ctx.prefixo, tabelaPai) + ')';
    texto.push(fecho + ctx.sepa);
  }

  if (modo === Modo.INTEGRIDADE_PK_UN_NOMEADAS) {
    for (const c of constraints) {
      if (c.tipo !== 'FK' && c.tipo !== 'CHECK' && c.nomeada) {
        texto.push(' ');
        addSubsDDL(texto, getDdlConstraint(ctx, tab, c));
      }
    }
    for (const c of constraints) {
      if (c.tipo === 'CHECK') {
        texto.push(' ');
        addSubsDDL(texto, getDdlConstraint(ctx, tab, c));
      }
    }
  }
  if (modo === Modo.INTEGRIDADE_FK) {
    for (const c of constraints) {
      if (c.tipo === 'FK') {
        texto.push(' ');
        addSubsDDL(texto, getDdlConstraint(ctx, tab, c));
      }
    }
  }
  if (modo === Modo.INDICES) {
    for (const ind of tp.indices ?? []) {
      texto.push(' ');
      addSubsDDL(texto, getDdlIndice(ctx, tab, ind));
    }
  }
  if (modo === Modo.GATILHOS) {
    for (const g of tp.gatilhos ?? []) {
      texto.push(' ');
      addSubsDDL(texto, getDdlGatilho(ctx, tab, g));
    }
  }
}

// ---- Demais objetos ------------------------------------------------------------

function ddlSequencia(ctx: Ctx, f: Forma, texto: string[]): void {
  const p = f.props;
  let sb = 'CREATE SEQUENCE ' + qualificarNome(p.schema, ctx.prefixo, f.texto);
  if (s(p.incremento) !== '') sb += ' INCREMENT BY ' + p.incremento;
  if (s(p.inicio) !== '') sb += ' START WITH ' + p.inicio;
  if (s(p.minimo) !== '') sb += ' MINVALUE ' + p.minimo;
  if (s(p.maximo) !== '') sb += ' MAXVALUE ' + p.maximo;
  if (p.ciclo) sb += ' CYCLE';
  texto.push(sb + ctx.sepa);
}

function comoLiteral(v: string): string {
  if (v.length > 1 && v.startsWith("'") && v.endsWith("'")) return v;
  return "'" + v.split("'").join("''") + "'";
}

function ddlTipoCustomizado(ctx: Ctx, f: Forma, texto: string[]): void {
  const p = f.props;
  const nome = qualificarNome(p.schema, ctx.prefixo, f.texto);
  let sb = '';
  if (f.kind === 'enum') {
    sb += 'CREATE TYPE ' + nome + ' AS ENUM (';
    const vals = splitSemVaziosFinais(s(p.rotulos), QUEBRA_R)
      .map((l) => trimAscii(l))
      .filter((v) => v !== '');
    sb += vals.map(comoLiteral).join(', ');
    sb += ')';
  } else {
    sb += 'CREATE DOMAIN ' + nome + ' AS ' + (s(p.tipoBase) === '' ? '???' : p.tipoBase);
    if (s(p.padrao) !== '') sb += ' DEFAULT ' + p.padrao;
    if (p.naoNulo) sb += ' NOT NULL';
    if (s(p.restricao) !== '') sb += ' CHECK (' + p.restricao + ')';
  }
  texto.push(sb + ctx.sepa);
}

/** Escolhe um delimitador de dollar-quoting que não ocorra no corpo. */
export function delimitadorPara(corpo: string | null | undefined): string {
  const texto = corpo ?? '';
  if (!texto.includes('$$')) return '$$';
  for (let i = 1; i < 100; i++) {
    const tag = '$corpo' + i + '$';
    if (!texto.includes(tag)) return tag;
  }
  return '$corpo_modelforge$';
}

function ddlRotina(ctx: Ctx, f: Forma, texto: string[]): void {
  const p = f.props;
  const proc = f.kind === 'procedure';
  const corpo = s(p.corpo);
  const delim = delimitadorPara(corpo);
  let cab = proc ? 'CREATE OR REPLACE PROCEDURE ' : 'CREATE OR REPLACE FUNCTION ';
  cab += qualificarNome(p.schema, ctx.prefixo, f.texto) + '(' + s(p.parametros) + ')';
  if (!proc) cab += ' RETURNS ' + (s(p.retorno) === '' ? '???' : p.retorno);
  cab += ' AS ' + delim;
  texto.push(cab);
  texto.push(corpo);
  texto.push(delim + ' LANGUAGE ' + s(p.linguagem) + ctx.sepa);
}

function ddlVisao(ctx: Ctx, f: Forma, texto: string[]): void {
  texto.push((f.kind === 'visaoMaterializada' ? 'CREATE MATERIALIZED VIEW ' : 'CREATE VIEW ') + qualificarNome(f.props.schema, ctx.prefixo, f.texto) + ' AS');
  texto.push(s(f.props.corpo));
  texto.push(ctx.sepa);
}

// ---- Diagrama ---------------------------------------------------------------------

/** A tabela mãe (partição/herança) vem antes da filha. */
function ordenarPorDependencia(tabelas: Forma[]): Forma[] {
  const pendentes = [...tabelas];
  const ordenadas: Forma[] = [];
  const nomesColocados = new Set<string>();
  let progrediu = true;
  while (progrediu && pendentes.length > 0) {
    progrediu = false;
    for (let i = 0; i < pendentes.length; ) {
      const t = pendentes[i];
      const pai = trimAscii(propsT(t).tabelaPai);
      const paiNoModelo = pai !== '' && tabelas.some((x) => equalsIgnoreCase(x.texto, pai));
      if (pai === '' || !paiNoModelo || nomesColocados.has(pai.toLowerCase())) {
        ordenadas.push(t);
        nomesColocados.add(t.texto.toLowerCase());
        pendentes.splice(i, 1);
        progrediu = true;
      } else {
        i++;
      }
    }
  }
  ordenadas.push(...pendentes);
  return ordenadas;
}

/** Schemas de todos os objetos, em ordem de aparição e sem repetição. */
function getSchemasUsados(ordem: Forma[]): string[] {
  const res = new Set<string>();
  for (const f of ordem) {
    const sc = s(f.props?.schema);
    if (trimAscii(sc) !== '') res.add(trimAscii(sc));
  }
  return [...res];
}

/** Lista de trechos de DDL, na ordem executável. */
export function gerarDdlLista(diagrama: Diagrama): string[] {
  const formas = diagrama.formas ?? [];
  const tabelas = formas.filter((f) => f.kind === 'tabela');
  const visoes = formas.filter((f) => f.kind === 'visao' || f.kind === 'visaoMaterializada');
  const sequencias = formas.filter((f) => f.kind === 'sequencia');
  const tipos = formas.filter((f) => f.kind === 'dominio' || f.kind === 'enum');
  const rotinas = formas.filter((f) => f.kind === 'funcao' || f.kind === 'procedure');

  const sepaModelo = (diagrama as Record<string, unknown>).separadorSql ?? (diagrama as Record<string, unknown>).separatorSQL;
  const ctx: Ctx = {
    prefixo: s(diagrama.prefixo),
    sepa: typeof sepaModelo === 'string' ? sepaModelo : ';',
    campos: new Map(),
    tabelas: new Map(),
  };
  for (const t of tabelas) {
    ctx.tabelas.set(t.id, t);
    for (const c of propsT(t).campos ?? []) ctx.campos.set(c.id, c);
  }

  const ddl: string[] = [];
  // Ordem dos schemas usados: tabelas, visões, sequências, tipos, rotinas.
  for (const esq of getSchemasUsados([...tabelas, ...visoes, ...sequencias, ...tipos, ...rotinas])) {
    ddl.push('CREATE SCHEMA IF NOT EXISTS ' + escapeSqlIdentifier(esq) + ctx.sepa);
  }
  for (const t of tipos) {
    ddl.push('');
    ddlTipoCustomizado(ctx, t, ddl);
  }
  for (const q of sequencias) {
    ddl.push('');
    ddlSequencia(ctx, q, ddl);
  }
  const ordenadas = ordenarPorDependencia(tabelas);
  for (const t of ordenadas) {
    ddl.push('');
    ddlTabela(ctx, t, ddl, Modo.TABELAS);
    ddlTabela(ctx, t, ddl, Modo.INTEGRIDADE_PK_UN_NOMEADAS);
  }
  for (const t of ordenadas) ddlTabela(ctx, t, ddl, Modo.INTEGRIDADE_FK);
  for (const t of ordenadas) ddlTabela(ctx, t, ddl, Modo.INDICES);
  for (const r of rotinas) {
    ddl.push('');
    ddlRotina(ctx, r, ddl);
  }
  for (const v of visoes) {
    ddl.push('');
    ddlVisao(ctx, v, ddl);
  }
  for (const t of ordenadas) ddlTabela(ctx, t, ddl, Modo.GATILHOS);
  return ddl;
}

/**
 * Texto completo do "Converter para físico": `/* nome: *\/` seguido de cada trecho precedido de "\n".
 * Diagrama sem nome usa `<<Lógico>>`.
 */
export function gerarDdl(diagrama: Diagrama): string {
  const nome = s(diagrama.nome) === '' ? '<<Lógico>>' : diagrama.nome;
  return gerarDdlLista(diagrama).reduce((acc, trecho) => acc + '\n' + trecho, '/* ' + nome + ': */');
}
