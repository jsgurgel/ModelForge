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
 * Validador de modelo ("Validar Modelo").
 * Este arquivo também guarda os helpers compartilhados com o gerador de documentação (doc.ts).
 */

/** Maior identificador aceito (63 bytes do PostgreSQL). */
export const LIMITE_IDENTIFICADOR = 63;

// ---- helpers compartilhados -------------------------------------------------------------

/** Trim ASCII: remove todo caractere <= U+0020 (diferente do trim do JS). */
export function jtrim(s: string): string {
  let i = 0;
  let f = s.length;
  while (i < f && s.charCodeAt(i) <= 0x20) i++;
  while (f > i && s.charCodeAt(f - 1) <= 0x20) f--;
  return s.substring(i, f);
}

/** Hash de 32 bits da string (h = 31*h + unidade UTF-16). */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Ordem determinística de relatório: simula uma tabela hash preenchida com as chaves na ordem de
 * inserção dada. Cada bin é uma lista encadeada; o nó novo entra na CABEÇA do bin e o crescimento da
 * tabela preserva a ordem relativa; logo, dentro de um bin a ordem é a inversa da inserção.
 */
export function ordemTabelaHash(chaves: string[]): string[] {
  let cap = 16;
  while (chaves.length > cap * 0.75) cap *= 2;
  const idx = (k: string) => {
    const h = hashString(k);
    return ((h ^ (h >>> 16)) >>> 0) & (cap - 1);
  };
  return chaves
    .map((k, i) => ({ k, i, b: idx(k) }))
    .sort((a, b) => a.b - b.b || b.i - a.i)
    .map((x) => x.k);
}

export function formasTabela(d: Diagrama): Forma[] {
  return d.formas.filter((f) => f.kind === 'tabela');
}

export function propsTabela(f: Forma): PropsTabela {
  const p = (f.props ?? {}) as Partial<PropsTabela>;
  return {
    schema: p.schema ?? '',
    descricao: p.descricao ?? '',
    observacao: p.observacao ?? '',
    estrategiaParticao: p.estrategiaParticao ?? '',
    chaveParticao: p.chaveParticao ?? '',
    tabelaPai: p.tabelaPai ?? '',
    limiteParticao: p.limiteParticao ?? '',
    campos: p.campos ?? [],
    constraints: p.constraints ?? [],
    indices: p.indices ?? [],
    gatilhos: p.gatilhos ?? [],
  };
}

/** Tabela particionada? */
export const ehParticionada = (p: PropsTabela) => p.estrategiaParticao !== '';
/** Tabela é partição? */
export const ehParticao = (p: PropsTabela) => p.tabelaPai !== '' && p.limiteParticao !== '';
/** Tabela herdada? */
export const ehHerdada = (p: PropsTabela) => p.tabelaPai !== '' && p.limiteParticao === '';

/** Só GEOMETRY e GEOGRAPHY (com ou sem modificador). */
export function ehEspacial(c: CampoTabela): boolean {
  let t = jtrim(c.tipo ?? '').toUpperCase();
  const par = t.indexOf('(');
  if (par > -1) t = jtrim(t.substring(0, par));
  return t === 'GEOMETRY' || t === 'GEOGRAPHY';
}

/** Colunas da chave de partição. */
function colunasDaChaveParticao(p: PropsTabela): string[] {
  return p.chaveParticao
    .split(',')
    .map((x) => jtrim(x))
    .filter((x) => x !== '');
}

// ---- Lógico -----------------------------------------------------------------------------

const excedeLimite = (nome: string | null | undefined): boolean => nome != null && jtrim(nome).length > LIMITE_IDENTIFICADOR;

export function validarLogico(diagrama: Diagrama): string[] {
  const problemas: string[] = [];
  const tabelas = formasTabela(diagrama);

  for (const t of tabelas) {
    const p = propsTabela(t);
    const nome = t.texto;
    const semNome = nome == null || jtrim(nome) === '';
    const rotulo = semNome ? `(sem nome, id ${t.id})` : nome;
    if (semNome) problemas.push(`Tabela ${rotulo}: sem nome definido.`);
    if (excedeLimite(nome)) {
      problemas.push(`Tabela "${rotulo}": nome com ${jtrim(nome).length} caracteres, acima do limite de ${LIMITE_IDENTIFICADOR}.`);
    }
    const herdaEstrutura = ehParticao(p) || ehHerdada(p);
    if (p.campos.length === 0 && !herdaEstrutura) problemas.push(`Tabela "${rotulo}": sem nenhum campo.`);
    const temPK = p.constraints.some((c) => c.tipo === 'PK');
    if (!temPK && !ehParticao(p)) problemas.push(`Tabela "${rotulo}": sem chave primária (PK).`);
    problemas.push(...validarParticionamento(p, rotulo));
    for (const c of p.campos) {
      if (c.tipo == null || jtrim(c.tipo) === '') problemas.push(`Tabela "${rotulo}", campo "${c.nome}": sem tipo definido.`);
      if (excedeLimite(c.nome)) {
        problemas.push(
          `Tabela "${rotulo}", campo "${c.nome}": nome com ${jtrim(c.nome).length} caracteres, acima do limite de ${LIMITE_IDENTIFICADOR}.`,
        );
      }
      if (ehEspacial(c) && (c.srid ?? '') === '') {
        problemas.push(`Tabela "${rotulo}", campo "${c.nome}": coluna espacial sem SRID definido.`);
      }
    }
    const vistos = new Set<string>();
    for (const c of p.campos) {
      const n = c.nome;
      if (n == null || jtrim(n) === '') continue;
      const k = jtrim(n).toUpperCase();
      if (vistos.has(k)) problemas.push(`Tabela "${rotulo}": campo "${n}" duplicado.`);
      else vistos.add(k);
    }
  }

  const nomes = new Map<string, string[]>();
  for (const t of tabelas) {
    const nome = t.texto;
    if (nome == null || jtrim(nome) === '') continue;
    const k = jtrim(nome).toUpperCase();
    if (!nomes.has(k)) nomes.set(k, []);
    nomes.get(k)!.push(nome);
  }
  for (const k of ordemTabelaHash([...nomes.keys()])) {
    const grupo = nomes.get(k)!;
    if (grupo.length > 1) problemas.push(`Nome de tabela duplicado: "${grupo[0]}" (${grupo.length} ocorrências).`);
  }

  problemas.push(...encontrarCiclosDeFK(tabelas));
  return problemas;
}

function encontrarCiclosDeFK(tabelas: Forma[]): string[] {
  const porId = new Map<string, Forma>(tabelas.map((t) => [t.id, t]));
  const grafo = new Map<string, Set<string>>();
  for (const t of tabelas) {
    const refs = new Set<string>();
    for (const c of propsTabela(t).constraints) {
      if (c.tipo !== 'FK' || c.constraintOrigem == null) continue;
      const alvo = porId.get(c.constraintOrigem.tabelaId);
      if (alvo && alvo !== t) refs.add(alvo.id);
    }
    grafo.set(t.id, refs);
  }

  const ciclos: string[] = [];
  const jaReportados = new Set<string>();
  const visitadas = new Set<string>();
  const nomeDe = (id: string) => porId.get(id)!.texto;

  const detectar = (atual: string, pilha: string[], naPilha: Set<string>) => {
    visitadas.add(atual);
    pilha.push(atual);
    naPilha.add(atual);
    for (const viz of grafo.get(atual) ?? []) {
      if (naPilha.has(viz)) {
        const ciclo = pilha.slice(pilha.indexOf(viz));
        const chave = [...new Set(ciclo.map(nomeDe))].sort().join('|');
        if (!jaReportados.has(chave)) {
          jaReportados.add(chave);
          ciclos.push(`Dependência circular de FK: ${ciclo.map(nomeDe).join(' → ')} → ${nomeDe(viz)}.`);
        }
      } else if (!visitadas.has(viz)) {
        detectar(viz, pilha, naPilha);
      }
    }
    pilha.pop();
    naPilha.delete(atual);
  };

  for (const t of tabelas) {
    if (visitadas.has(t.id)) continue;
    detectar(t.id, [], new Set<string>());
  }
  return ciclos;
}

function validarParticionamento(t: PropsTabela, rotulo: string): string[] {
  const problemas: string[] = [];
  const prefixo = `Tabela "${rotulo}": `;

  if (ehParticionada(t) && t.chaveParticao === '') {
    problemas.push(`${prefixo}particionada por ${t.estrategiaParticao} mas sem chave de partição.`);
  }
  if (t.estrategiaParticao !== '') {
    const e = t.estrategiaParticao;
    if (e !== 'RANGE' && e !== 'LIST' && e !== 'HASH') {
      problemas.push(`${prefixo}estratégia de partição desconhecida: "${e}" (use RANGE, LIST ou HASH).`);
    }
  }

  const colunas = colunasDaChaveParticao(t);
  if (ehParticionada(t) && colunas.length > 0) {
    const nomeCampo = (id: string | null): string | null => {
      if (id == null) return null;
      const c = t.campos.find((x) => x.id === id);
      return c ? c.nome : null;
    };
    for (const c of t.constraints as ConstraintTabela[]) {
      const unica = c.tipo === 'PK' || c.tipo === 'UNIQUE';
      if (!unica || c.camposOrigem.length === 0) continue;
      const nomesDaConstraint = new Set<string>();
      for (const id of c.camposOrigem) {
        const n = nomeCampo(id);
        if (id != null && n != null) nomesDaConstraint.add(jtrim(n).toLowerCase());
      }
      for (const col of colunas) {
        if (!nomesDaConstraint.has(jtrim(col).toLowerCase())) {
          problemas.push(
            `${prefixo}${c.tipo === 'PK' ? 'PK' : 'UNIQUE'} não inclui a coluna de partição "${col}" - o PostgreSQL exige que toda chave única contenha a chave de partição.`,
          );
          break;
        }
      }
    }
  }

  if (ehParticao(t) && ehParticionada(t)) {
    problemas.push(`${prefixo}é partição de "${t.tabelaPai}" e também declara PARTITION BY - confirme se o subparticionamento é intencional.`);
  }
  return problemas;
}

export function formatarRelatorio(problemas: string[], nomeModelo: string): string {
  if (problemas.length === 0) return `Nenhum problema encontrado em ${nomeModelo}.`;
  let sb = `${problemas.length} problema(s) encontrado(s) em ${nomeModelo}:\n\n`;
  for (const p of problemas) sb += `- ${p}\n`;
  return sb;
}
