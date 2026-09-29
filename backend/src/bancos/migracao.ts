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
 * Script de migração: compara o schema de um banco (InfoTabela[], o que
 * existe hoje) com o modelo Lógico (o que deveria existir) e gera um script incremental. Só instruções
 * aditivas (CREATE TABLE, ADD COLUMN, ADD CONSTRAINT) saem descomentadas; DROP e mudança de tipo saem
 * comentados. A função é pura: o snapshot vem de introspeccionarEstruturado (ddl-banco.ts).
 */
import { gerarDdlLista } from '../geradores/ddl';
import { escapeSqlIdentifier, trimAscii } from '../geradores/util';
import { CampoTabela, ConstraintTabela, Diagrama, Forma, PropsTabela } from '../modelo/tipos';
import { InfoColuna, InfoFk, InfoTabela } from './tipos';

const s = (v: unknown): string => (v == null ? '' : String(v));
const propsT = (f: Forma): PropsTabela => f.props as PropsTabela;
const normalizarTipo = (t: string | null | undefined): string => (t == null ? '' : t.trim().toLowerCase().replace(/\s+/g, ' '));

/** Cópia rasa do diagrama só com o que a geração de DDL precisa; `alterar` ajusta as props de cada tabela. */
function copiaDdl(d: Diagrama, tabelas: Forma[], alterar: (p: PropsTabela, f: Forma) => PropsTabela): Diagrama {
  return { ...d, formas: tabelas.map((f) => ({ ...f, props: alterar({ ...propsT(f) }, f) })), ligacoes: [] };
}

/** t.DDLGenerate(PEGAR_TABELAS) + t.DDLGenerate(PEGAR_INTEGRIDADE_PK_UN_NOMEADAS) de UMA tabela. */
function ddlNovaTabela(d: Diagrama, t: Forma): string[] {
  //# Sem FKs (apontariam para tabelas fora desta cópia), índices e gatilhos: só corpo + PK/UNIQUE nomeadas/CHECK.
  const solo = copiaDdl(d, [t], (p) => ({ ...p, constraints: (p.constraints ?? []).filter((c) => c.tipo !== 'FK'), indices: [], gatilhos: [] }));
  const linhas = gerarDdlLista(solo).filter((l) => !l.startsWith('CREATE SCHEMA IF NOT EXISTS '));
  //# gerarDdlLista começa cada tabela com uma linha em branco; aqui ela não é repetida.
  if (linhas[0] === '') linhas.shift();
  return linhas;
}

/** DDL das FKs (com origem) de cada tabela, na ordem tabela/constraint. */
function ddlFks(d: Diagrama, tabelas: Forma[]): Map<string, string> {
  const res = new Map<string, string>();
  const marcadas: { chave: string; marca: string; nome: string }[] = [];
  let n = 0;
  const copia = copiaDdl(d, tabelas, (p, f) => ({
    ...p, indices: [], gatilhos: [],
    constraints: (p.constraints ?? []).map((c, i) => {
      if (c.tipo !== 'FK') return c;
      const marca = `zzfk${String(++n).padStart(5, '0')}zz`;
      const nomeReal = c.nomeada && trimAscii(s(c.nome)) !== '' ? escapeSqlIdentifier(s(c.nome)) : escapeSqlIdentifier('FK_' + f.texto + '_' + (i + 1));
      marcadas.push({ chave: f.id + '#' + c.id, marca, nome: nomeReal });
      return { ...c, nomeada: true, nome: marca };
    }),
  }));
  const linhas = gerarDdlLista(copia);
  const sepa = typeof (d as Record<string, unknown>).separadorSql === 'string' ? ((d as Record<string, unknown>).separadorSql as string) : ';';
  for (const m of marcadas) {
    const i = linhas.findIndex((l) => l.includes('ADD CONSTRAINT ' + escapeSqlIdentifier(m.marca)));
    if (i < 0) continue;
    const partes = [linhas[i]];
    let j = i;
    while (!linhas[j].endsWith(sepa) && j + 1 < linhas.length) partes.push(linhas[++j]);
    //# gerarDdlLista indenta as linhas seguintes; o script de migração usa o DDL sem indentação.
    const txt = partes.map((l, k) => (k === 0 ? l : l.replace(/^ {4}/, ''))).join('\n');
    res.set(m.chave, txt.split(escapeSqlIdentifier(m.marca)).join(m.nome));
  }
  return res;
}

function mesmoConjunto(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const na = new Set(a.map((x) => x.toLowerCase()));
  const nb = new Set(b.map((x) => x.toLowerCase()));
  return na.size === nb.size && [...na].every((x) => nb.has(x));
}

function existeFkEquivalente(local: string[], tabelaRef: string, fksBanco: InfoFk[]): boolean {
  return fksBanco.some((f) => f.tabelaRef.toLowerCase() === tabelaRef.toLowerCase() && mesmoConjunto(local, f.colunasLocais));
}

function diffColunas(t: Forma, info: InfoTabela): string[] {
  const res: string[] = [];
  const colunasModelo = new Set<string>();
  for (const c of propsT(t).campos ?? []) {
    const nomeCol = s(c.nome);
    colunasModelo.add(nomeCol.toLowerCase());
    const colBanco: InfoColuna | undefined = info.colunas[nomeCol.toLowerCase()];
    const notNullModelo = s(c.complemento).toUpperCase().includes('NOT NULL');
    if (!colBanco) {
      //# Coluna nova no modelo: ADD COLUMN (aditivo). DEFAULT antes do NOT NULL, senão falha em tabela com linhas.
      let def = escapeSqlIdentifier(nomeCol) + (s(c.tipo) === '' ? '' : ' ' + c.tipo);
      if (s(c.padrao) !== '') def += ' DEFAULT ' + c.padrao;
      if (notNullModelo) def += ' NOT NULL';
      res.push('ALTER TABLE ' + escapeSqlIdentifier(t.texto) + ' ADD COLUMN ' + def + ';');
    } else {
      const tipoMudou = normalizarTipo(s(c.tipo)) !== normalizarTipo(colBanco.tipo);
      //# notNullModelo == nullable significa que a nulidade divergiu.
      const nullMudou = notNullModelo === colBanco.nullable;
      if (tipoMudou || nullMudou) {
        res.push('-- revisar: coluna "' + nomeCol + '" mudou de "' + colBanco.tipo + (colBanco.nullable ? '' : ' NOT NULL') +
          '" para "' + s(c.tipo) + (notNullModelo ? ' NOT NULL' : '') + '" - ajuste o ALTER COLUMN pro seu SGBD.');
      }
    }
  }
  for (const nomeColBanco of Object.keys(info.colunas)) {
    if (!colunasModelo.has(nomeColBanco)) {
      res.push('-- revisar: coluna "' + nomeColBanco + '" existe no banco mas não no modelo atual.');
      res.push('-- ALTER TABLE ' + escapeSqlIdentifier(t.texto) + ' DROP COLUMN ' + escapeSqlIdentifier(nomeColBanco) + ';');
    }
  }
  return res;
}

export function gerarScriptMigracao(modelo: Diagrama, tabelasBanco: InfoTabela[], database: string): string {
  const bancoPorNome = new Map<string, InfoTabela>();
  for (const t of tabelasBanco) bancoPorNome.set(t.nome.toLowerCase(), t);
  const tabelasModelo = (modelo.formas ?? []).filter((f) => f.kind === 'tabela');
  const nomeFormatado = s(modelo.nome) === '' ? '<<Lógico>>' : modelo.nome;

  const saida: string[] = [];
  saida.push('/* Script de migração: ' + nomeFormatado + ' -> ' + database + ' */');
  saida.push('/* Gerado automaticamente - REVISE antes de executar em produção. */');
  saida.push('/* Instruções comentadas (--) são destrutivas ou ambíguas e precisam de revisão manual. */');

  let algumaMudanca = false;

  // 1) Tabelas novas no modelo (não existem no banco): CREATE TABLE completo.
  for (const t of tabelasModelo) {
    if (!bancoPorNome.has(t.texto.toLowerCase())) {
      algumaMudanca = true;
      saida.push('');
      saida.push(...ddlNovaTabela(modelo, t));
    }
  }

  // 2) Tabelas existentes em ambos: diff de colunas.
  for (const t of tabelasModelo) {
    const info = bancoPorNome.get(t.texto.toLowerCase());
    if (!info) continue;
    const mudancas = diffColunas(t, info);
    if (mudancas.length) {
      algumaMudanca = true;
      saida.push('');
      saida.push('-- Tabela ' + t.texto + ':');
      saida.push(...mudancas);
    }
  }

  // 3) FKs novas no modelo (por colunas locais + tabela referenciada).
  const fks = ddlFks(modelo, tabelasModelo);
  const porId = new Map(tabelasModelo.map((t) => [t.id, t]));
  const nomeCampo = new Map<string, string>();
  for (const t of tabelasModelo) for (const c of propsT(t).campos ?? []) nomeCampo.set(c.id, s((c as CampoTabela).nome));
  for (const t of tabelasModelo) {
    const info = bancoPorNome.get(t.texto.toLowerCase());
    const fksBanco = info ? info.fks : [];
    for (const fk of propsT(t).constraints ?? ([] as ConstraintTabela[])) {
      if (fk.tipo !== 'FK' || !fk.constraintOrigem) continue;
      const origem = porId.get(fk.constraintOrigem.tabelaId);
      if (!origem) continue;
      const locais = (fk.camposDestino ?? []).map((id) => (id == null ? 'null' : nomeCampo.get(id) ?? 'null'));
      if (!existeFkEquivalente(locais, origem.texto, fksBanco)) {
        algumaMudanca = true;
        saida.push('');
        saida.push(fks.get(t.id + '#' + fk.id) ?? '');
      }
    }
  }

  // 4) Tabelas removidas do modelo: só aviso.
  for (const info of tabelasBanco) {
    if (!tabelasModelo.some((t) => t.texto.toLowerCase() === info.nome.toLowerCase())) {
      algumaMudanca = true;
      saida.push('');
      saida.push('-- revisar: tabela "' + info.nome + '" existe no banco mas não no modelo atual.');
      saida.push('-- DROP TABLE ' + escapeSqlIdentifier(info.nome) + ';');
    }
  }

  if (!algumaMudanca) {
    saida.push('');
    saida.push('-- Nenhuma diferença encontrada entre o modelo e o banco conectado.');
  }
  return saida.map((l) => l + '\n').join('');
}
