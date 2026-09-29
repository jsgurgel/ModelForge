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

import { CampoTabela, ConstraintTabela, Diagrama, Forma, PropsTabela } from '../modelo/tipos';

/**
 * Gerador de ORM (JPA, SQLAlchemy, Prisma).
 * O texto é estável byte a byte, inclusive as limitações (mapeamento de tipo best-effort, sem inferir 1:1 etc.).
 */
export type LinguagemOrm = 'jpa' | 'sqlalchemy' | 'prisma';

interface Ctx {
  tabelas: { forma: Forma; props: PropsTabela }[];
  campo: Map<string, CampoTabela & { tabela: Forma }>;
}

export function nomeFormatadoDiagrama(d: Diagrama): string {
  if (d.nome) return d.nome;
  const nomes: Record<string, string> = {
    conceitual: 'Conceitual', logico: 'Lógico', fluxo: 'Fluxo', atividade: 'Atividade', eap: 'Eap', livre: 'Livre', nosql: 'NoSQL',
  };
  return `<<${nomes[d.tipo] ?? d.tipo}>>`;
}

function montar(d: Diagrama): Ctx {
  const tabelas = d.formas.filter((f) => f.kind === 'tabela').map((f) => ({ forma: f, props: f.props as PropsTabela }));
  const campo = new Map<string, CampoTabela & { tabela: Forma }>();
  for (const t of tabelas) for (const c of t.props.campos ?? []) campo.set(c.id, { ...c, tabela: t.forma });
  return { tabelas, campo };
}

/** Split que descarta strings vazias no final (exceto quando a entrada é vazia). */
function splitSemVaziosFinais(s: string, sep: string): string[] {
  if (s === '') return [''];
  const r = s.split(sep);
  while (r.length > 0 && r[r.length - 1] === '') r.pop();
  return r;
}

function baseTipo(tipoSql: string | null | undefined): string {
  const t = tipoSql == null ? '' : tipoSql.trim().toLowerCase();
  const p = t.indexOf('(');
  return p > -1 ? t.substring(0, p).trim() : t;
}

function parametrosTipo(tipoSql: string | null | undefined): string[] {
  if (tipoSql == null) return [];
  const p = tipoSql.indexOf('(');
  const q = tipoSql.indexOf(')');
  if (p === -1 || q === -1 || q <= p) return [];
  return splitSemVaziosFinais(tipoSql.substring(p + 1, q), ',');
}

export function paraPascalCase(s: string): string {
  let sb = '';
  for (const parte of s.split(/[^a-zA-Z0-9]+/)) {
    if (parte === '') continue;
    sb += parte.charAt(0).toUpperCase() + parte.substring(1);
  }
  return sb.length > 0 ? sb : s;
}

export function paraCamelCase(s: string): string {
  const pascal = paraPascalCase(s);
  return pascal === '' ? pascal : pascal.charAt(0).toLowerCase() + pascal.substring(1);
}

type CampoR = CampoTabela & { tabela: Forma };

function resolver(ctx: Ctx, ids: (string | null)[] | undefined): (CampoR | null)[] {
  return (ids ?? []).map((i) => (i == null ? null : ctx.campo.get(i) ?? null));
}

function camposDe(ctx: Ctx, t: PropsTabela, tipo: string): (CampoR | null)[] {
  const c = (t.constraints ?? []).find((x) => x.tipo === tipo);
  return c ? resolver(ctx, c.camposOrigem) : [];
}

function uniquesCompostas(ctx: Ctx, t: PropsTabela): (CampoR | null)[][] {
  return (t.constraints ?? [])
    .filter((c) => c.tipo === 'UNIQUE')
    .map((c) => resolver(ctx, c.camposOrigem))
    .filter((cols) => cols.length > 1);
}

function fazParteDeUniqueComposta(ctx: Ctx, t: PropsTabela, c: CampoTabela): boolean {
  return uniquesCompostas(ctx, t).some((cols) => cols.some((x) => x?.id === c.id));
}

function nomesDeColuna(cs: (CampoR | null)[]): string {
  return cs.map((c) => c!.nome).join(', ');
}

function campoReferenciado(ctx: Ctx, t: PropsTabela, c: CampoTabela): CampoR | null {
  if (!c.fk) return null;
  for (const fk of t.constraints ?? []) {
    if (fk.tipo !== 'FK') continue;
    const idx = (fk.camposDestino ?? []).indexOf(c.id);
    const origem = fk.camposOrigem ?? [];
    if (idx > -1 && idx < origem.length) {
      const id = origem[idx];
      return id == null ? null : ctx.campo.get(id) ?? null;
    }
  }
  return null;
}

const notNull = (c: CampoTabela) => (c.complemento ?? '').toUpperCase().includes('NOT NULL');
const textoTabela = (f: Forma) => f.texto;

// ---------------------------------------------------------------- JPA
interface TipoJava { tipo: string; imp: string | null; tamanho: string | null }

function mapearTipoJava(tipoSql: string): TipoJava {
  const base = baseTipo(tipoSql);
  const p = parametrosTipo(tipoSql);
  switch (base) {
    case 'int': case 'integer': case 'serial': return { tipo: 'Integer', imp: null, tamanho: null };
    case 'bigint': case 'bigserial': return { tipo: 'Long', imp: null, tamanho: null };
    case 'smallint': return { tipo: 'Short', imp: null, tamanho: null };
    case 'decimal': case 'numeric': return { tipo: 'BigDecimal', imp: 'java.math.BigDecimal', tamanho: null };
    case 'float': case 'real': return { tipo: 'Float', imp: null, tamanho: null };
    case 'double': case 'double precision': return { tipo: 'Double', imp: null, tamanho: null };
    case 'varchar': case 'character varying': case 'char': case 'character': case 'nvarchar': case 'nchar': case 'text':
      return { tipo: 'String', imp: null, tamanho: p.length >= 1 ? p[0].trim() : null };
    case 'boolean': case 'bool': return { tipo: 'Boolean', imp: null, tamanho: null };
    case 'date': return { tipo: 'LocalDate', imp: 'java.time.LocalDate', tamanho: null };
    case 'timestamp': case 'timestamptz': case 'datetime': return { tipo: 'LocalDateTime', imp: 'java.time.LocalDateTime', tamanho: null };
    case 'time': return { tipo: 'LocalTime', imp: 'java.time.LocalTime', tamanho: null };
    case 'uuid': return { tipo: 'UUID', imp: 'java.util.UUID', tamanho: null };
    default: return { tipo: 'String', imp: null, tamanho: null };
  }
}

function gerarJpa(d: Diagrama, ctx: Ctx): string {
  let sb = `// Código JPA gerado a partir de "${nomeFormatadoDiagrama(d)}" - revise antes de usar em produção.\n\n`;
  for (const { forma, props } of ctx.tabelas) {
    const classe = paraPascalCase(textoTabela(forma));
    const pk = camposDe(ctx, props, 'PK');
    const pkIds = new Set(pk.map((c) => c?.id));
    const imports = new Set<string>();
    const corpo: string[] = [];
    for (const c of props.campos ?? []) {
      const nn = notNull(c);
      const ref = campoReferenciado(ctx, props, c);
      if (ref) {
        const classeRef = paraPascalCase(textoTabela(ref.tabela));
        const nomeCampo = c.nome.toLowerCase().endsWith('_id')
          ? paraCamelCase(c.nome.substring(0, c.nome.length - 3))
          : paraCamelCase(textoTabela(ref.tabela));
        corpo.push('    @ManyToOne');
        corpo.push(`    @JoinColumn(name = "${c.nome}"${nn ? ', nullable = false' : ''})`);
        corpo.push(`    private ${classeRef} ${nomeCampo};`);
        corpo.push('');
        continue;
      }
      const td = mapearTipoJava(c.tipo);
      if (td.imp != null) imports.add(td.imp);
      if (pkIds.has(c.id)) corpo.push('    @Id');
      let attrs = `name = "${c.nome}"`;
      if (nn) attrs += ', nullable = false';
      if (td.tamanho != null) attrs += `, length = ${td.tamanho}`;
      if (c.unique && !fazParteDeUniqueComposta(ctx, props, c)) attrs += ', unique = true';
      corpo.push(`    @Column(${attrs})`);
      corpo.push(`    private ${td.tipo} ${paraCamelCase(c.nome)};`);
      corpo.push('');
    }
    sb += `// ===== ${classe}.java =====\n`;
    sb += 'import javax.persistence.*;\n';
    for (const imp of imports) sb += `import ${imp};\n`;
    sb += `\n@Entity\n@Table(name = "${textoTabela(forma)}")\n`;
    sb += `public class ${classe} {\n\n`;
    if (pk.length > 1) sb += `    // chave composta (${nomesDeColuna(pk)}) - considere @IdClass ou @EmbeddedId.\n\n`;
    for (const linha of corpo) sb += linha + '\n';
    sb += '    // getters/setters omitidos\n';
    sb += '}\n\n';
  }
  return sb;
}

// ---------------------------------------------------------------- SQLAlchemy
function mapearTipoSqlAlchemy(tipoSql: string, usados: Set<string>): string {
  const base = baseTipo(tipoSql);
  const p = parametrosTipo(tipoSql);
  const u = (t: string, r: string = t) => { usados.add(t); return r; };
  switch (base) {
    case 'int': case 'integer': case 'serial': return u('Integer');
    case 'bigint': case 'bigserial': return u('BigInteger');
    case 'smallint': return u('SmallInteger');
    case 'decimal': case 'numeric':
      return u('Numeric', p.length >= 2 ? `Numeric(${p[0].trim()}, ${p[1].trim()})` : p.length === 1 ? `Numeric(${p[0].trim()})` : 'Numeric');
    case 'float': case 'real': case 'double': case 'double precision': return u('Float');
    case 'varchar': case 'character varying': case 'char': case 'character': case 'nvarchar': case 'nchar':
      return u('String', p.length >= 1 ? `String(${p[0].trim()})` : 'String');
    case 'text': return u('Text');
    case 'boolean': case 'bool': return u('Boolean');
    case 'date': return u('Date');
    case 'timestamp': case 'timestamptz': case 'datetime': return u('DateTime');
    case 'time': return u('Time');
    default: return u('String');
  }
}

function gerarSqlAlchemy(d: Diagrama, ctx: Ctx): string {
  const usados = new Set<string>(['Column']);
  let usaRel = false;
  let corpoTotal = '';
  for (const { forma, props } of ctx.tabelas) {
    const classe = paraPascalCase(textoTabela(forma));
    const pk = camposDe(ctx, props, 'PK');
    corpoTotal += `class ${classe}(Base):\n`;
    corpoTotal += `    __tablename__ = "${textoTabela(forma)}"\n\n`;
    const relacoes: string[] = [];
    for (const c of props.campos ?? []) {
      const nn = notNull(c);
      const ehPk = pk.length === 1 && pk[0]?.id === c.id;
      const ref = campoReferenciado(ctx, props, c);
      const tipoBase = mapearTipoSqlAlchemy(c.tipo, usados);
      let linha = `    ${c.nome} = Column(${tipoBase}`;
      if (ehPk) linha += ', primary_key=True';
      if (ref) {
        usados.add('ForeignKey');
        linha += `, ForeignKey("${textoTabela(ref.tabela)}.${ref.nome}")`;
        if (nn) linha += ', nullable=False';
        linha += ')';
        const nomeRel = c.nome.toLowerCase().endsWith('_id') ? c.nome.substring(0, c.nome.length - 3) : textoTabela(ref.tabela);
        relacoes.push(`    ${nomeRel} = relationship("${paraPascalCase(textoTabela(ref.tabela))}")`);
        usaRel = true;
      } else {
        if (nn) linha += ', nullable=False';
        if (c.unique && !fazParteDeUniqueComposta(ctx, props, c)) linha += ', unique=True';
        linha += ')';
      }
      corpoTotal += linha + '\n';
    }
    if (pk.length > 1) corpoTotal += `    # chave composta: ${nomesDeColuna(pk)} (use PrimaryKeyConstraint em __table_args__)\n`;
    if (relacoes.length > 0) {
      corpoTotal += '\n';
      for (const r of relacoes) corpoTotal += r + '\n';
    }
    corpoTotal += '\n\n';
  }
  let sb = `# Código SQLAlchemy gerado a partir de "${nomeFormatadoDiagrama(d)}" - revise antes de usar em produção.\n`;
  sb += `from sqlalchemy import ${[...usados].join(', ')}\n`;
  if (usaRel) sb += 'from sqlalchemy.orm import relationship\n';
  sb += 'from sqlalchemy.ext.declarative import declarative_base\n\n';
  sb += 'Base = declarative_base()\n\n\n';
  sb += corpoTotal;
  return sb;
}

// ---------------------------------------------------------------- Prisma
function mapearTipoPrisma(tipoSql: string): string {
  switch (baseTipo(tipoSql)) {
    case 'int': case 'integer': case 'smallint': case 'serial': return 'Int';
    case 'bigint': case 'bigserial': return 'BigInt';
    case 'decimal': case 'numeric': return 'Decimal';
    case 'float': case 'real': case 'double': case 'double precision': return 'Float';
    case 'boolean': case 'bool': return 'Boolean';
    case 'date': case 'timestamp': case 'timestamptz': case 'datetime': return 'DateTime';
    default: return 'String';
  }
}

function gerarPrisma(d: Diagrama, ctx: Ctx): string {
  const inversos = new Map<string, string[]>();
  for (const t of ctx.tabelas) inversos.set(t.forma.id, []);
  for (const { forma, props } of ctx.tabelas) {
    for (const c of props.campos ?? []) {
      const ref = campoReferenciado(ctx, props, c);
      if (!ref) continue;
      const lst = inversos.get(ref.tabela.id);
      if (lst) lst.push(`${paraCamelCase(textoTabela(forma))}s ${paraPascalCase(textoTabela(forma))}[]`);
    }
  }
  let sb = `// Schema Prisma gerado a partir de "${nomeFormatadoDiagrama(d)}" - revise antes de usar em produção.\n\n`;
  for (const { forma, props } of ctx.tabelas) {
    const classe = paraPascalCase(textoTabela(forma));
    const pk = camposDe(ctx, props, 'PK');
    sb += `model ${classe} {\n`;
    for (const c of props.campos ?? []) {
      const ehPk = pk.length === 1 && pk[0]?.id === c.id;
      const nomeCampo = paraCamelCase(c.nome);
      const opcional = !notNull(c) && !ehPk;
      sb += `  ${nomeCampo} ${mapearTipoPrisma(c.tipo)}${opcional ? '?' : ''}`;
      if (ehPk) sb += ' @id';
      if (c.unique && !fazParteDeUniqueComposta(ctx, props, c)) sb += ' @unique';
      if (nomeCampo !== c.nome) sb += ` @map("${c.nome}")`;
      sb += '\n';
    }
    for (const c of props.campos ?? []) {
      const ref = campoReferenciado(ctx, props, c);
      if (!ref) continue;
      const classeRef = paraPascalCase(textoTabela(ref.tabela));
      const local = c.nome.toLowerCase().endsWith('_id')
        ? paraCamelCase(c.nome.substring(0, c.nome.length - 3))
        : paraCamelCase(textoTabela(ref.tabela));
      sb += `  ${local} ${classeRef} @relation(fields: [${paraCamelCase(c.nome)}], references: [${paraCamelCase(ref.nome)}])\n`;
    }
    for (const inv of inversos.get(forma.id) ?? []) sb += `  ${inv}\n`;
    if (pk.length > 1) sb += `\n  @@id([${pk.map((p) => paraCamelCase(p!.nome)).join(', ')}])\n`;
    for (const un of uniquesCompostas(ctx, props)) sb += `  @@unique([${un.map((p) => paraCamelCase(p!.nome)).join(', ')}])\n`;
    if (classe.toLowerCase() !== textoTabela(forma).toLowerCase()) sb += `  @@map("${textoTabela(forma)}")\n`;
    sb += '}\n\n';
  }
  return sb;
}

export function gerarOrm(diagrama: Diagrama, linguagem: LinguagemOrm): string {
  const ctx = montar(diagrama);
  switch (linguagem) {
    case 'jpa': return gerarJpa(diagrama, ctx);
    case 'sqlalchemy': return gerarSqlAlchemy(diagrama, ctx);
    case 'prisma': return gerarPrisma(diagrama, ctx);
  }
}
