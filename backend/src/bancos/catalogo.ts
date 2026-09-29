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
 * Catálogo para autocomplete do SQL Studio.
 * Reaproveita a introspecção existente (Dialeto) e devolve uma estrutura plana
 * que o frontend usa para sugerir schemas, tabelas, views, colunas, functions e procedures.
 *
 * Sem schema escolhido (PostgreSQL/SQL Server), o catálogo percorre um schema de usuário
 * por vez e registra o schema REAL de cada objeto — o autocomplete insere "schema.tabela"
 * qualificado, evitando o erro "não existe a relação" quando a tabela está fora do search_path.
 */
import { Dialeto } from './tipos';

export interface EntradaCatalogo {
  /** "schema" | "tabela" | "view" | "view_materializada" | "sequencia" | "rotina" | "coluna" */
  tipo: string;
  /** Nome do objeto (ou do schema quando tipo === "schema"). */
  nome: string;
  /** Schema do objeto (nulo para bancos sem schema). */
  schema: string | null;
  /** Para colunas: tipo SQL já formatado. */
  tipoColuna?: string;
  /** Para colunas: nome da tabela a que pertence. */
  tabela?: string;
  /** Para tabelas/views/colunas: nome a inserir no editor ("schema.tabela" quando o schema é relevante). */
  inserir?: string;
}

export interface CatalogoAutocomplete {
  schemas: string[];
  objetos: EntradaCatalogo[];
}

/**
 * Lê o catálogo de um schema (ou de todos os schemas de usuário) e devolve uma lista plana
 * de entradas para autocomplete. Reaproveita os métodos existentes do `Dialeto`.
 * Falhas em leituras acessórias (sequences, rotinas) viram avisos, não derrubam o catálogo.
 */
export async function lerCatalogo(d: Dialeto, schema: string): Promise<CatalogoAutocomplete> {
  const schemas = d.usaSchema ? (await d.schemas()) : [];
  const entradas: EntradaCatalogo[] = [];

  if (d.usaSchema) for (const s of schemas) entradas.push({ tipo: 'schema', nome: s, schema: null });

  //# Com schema escolhido: introspecta só ele. Sem schema (todos): um schema por vez,
  //# para cada objeto sair com o schema real a que pertence.
  const alvos: (string | null)[] = d.usaSchema ? (schema ? [schema] : schemas) : [null];
  const seg = async <T>(p: Promise<T[]>, aoFalhar: T[] = [] as T[]): Promise<T[]> => p.catch(() => aoFalhar);

  for (const sc of alvos) {
    const objetos = await d.objetos(sc);
    for (const o of objetos) {
      const tipoEntrada =
        o.tipo === 'TABELA' ? 'tabela' :
        o.tipo === 'VIEW' ? 'view' :
        o.tipo === 'VIEW_MATERIALIZADA' ? 'view_materializada' :
        o.tipo === 'SEQUENCIA' ? 'sequencia' : 'rotina';
      //# Nome a inserir no editor: qualificado com o schema quando ele existe.
      entradas.push({ tipo: tipoEntrada, nome: o.nome, schema: sc, inserir: sc ? `${sc}.${o.nome}` : o.nome });

      if (o.tipo === 'TABELA' || o.tipo === 'VIEW' || o.tipo === 'VIEW_MATERIALIZADA') {
        const colunas = await d.colunas(sc, o.nome);
        for (const c of colunas) {
          entradas.push({ tipo: 'coluna', nome: c.nome, schema: sc, tabela: o.nome, tipoColuna: c.tipo });
        }
      }
    }

    const seqs = await seg(d.sequencias(sc));
    for (const s of seqs) if (!entradas.some((e) => e.nome === s.nome && e.tipo === 'sequencia' && e.schema === sc)) {
      entradas.push({ tipo: 'sequencia', nome: s.nome, schema: sc, inserir: sc ? `${sc}.${s.nome}` : s.nome });
    }

    const rotinas = await seg(d.rotinasNomes(sc));
    for (const r of rotinas) if (!entradas.some((e) => e.nome === r.nome && e.tipo === 'rotina' && e.schema === sc)) {
      entradas.push({ tipo: 'rotina', nome: r.nome, schema: sc, inserir: sc ? `${sc}.${r.nome}` : r.nome });
    }
  }

  return { schemas, objetos: entradas };
}