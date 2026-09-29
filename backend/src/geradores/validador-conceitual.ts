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
 * Validador do modelo CONCEITUAL: regras, mensagens e ordem estáveis.
 * (A parte lógica fica em validador.ts; `formatarRelatorio` também.)
 *
 * Forma sem nome aparece como "(sem nome, id N)", com o id (string) da forma.
 */
import type { Diagrama } from '../modelo/tipos';
import { GrafoConceitual, str } from '../modelo/conceitual';
import { trimAscii } from './util';

/** Hash de 32 bits da string (h = 31*h + unidade UTF-16). */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Ordem determinística de relatório (simula uma tabela hash), dadas as chaves na ordem de inserção:
 * por posição no vetor de buckets (capacidade 16, dobra quando passa de 75%); dentro do bucket, o mais recente primeiro
 * (a inserção é no INÍCIO da lista do bucket).
 * Os nomes duplicados são reportados nessa ordem.
 */
export function ordemTabelaHash(chaves: string[]): string[] {
  let cap = 16;
  while (chaves.length > cap * 0.75) cap *= 2;
  const idx = (k: string): number => {
    const h = hashString(k);
    return ((h ^ (h >>> 16)) & (cap - 1)) >>> 0;
  };
  return chaves
    .map((k, i) => ({ k, i, b: idx(k) }))
    .sort((a, b) => a.b - b.b || b.i - a.i)
    .map((x) => x.k);
}

/** Maiúsculas como `String.toUpperCase()` (a versão do JS já cobre o caso comum, inclusive ß -> SS). */
const maiusc = (s: string): string => s.toUpperCase();

export function validarConceitual(d: Diagrama): string[] {
  const problemas: string[] = [];
  const g = new GrafoConceitual(d);

  const entidades = d.formas.filter((f) => f.kind === 'entidade');
  for (const ent of entidades) {
    const nome = ent.texto;
    const semNome = nome == null || trimAscii(nome) === '';
    const rotulo = semNome ? `(sem nome, id ${ent.id})` : nome;
    if (semNome) problemas.push(`Entidade ${rotulo}: sem nome definido.`);

    const atributos = g.atributos(ent);
    if (atributos.length === 0) {
      problemas.push(`Entidade "${rotulo}": sem nenhum atributo.`);
    } else if (!atributos.some((a) => a.props?.identificador === true)) {
      problemas.push(`Entidade "${rotulo}": sem atributo identificador (PK).`);
    }
    for (const a of atributos) {
      if (trimAscii(str(a.props?.tipo)) === '') {
        problemas.push(`Entidade "${rotulo}", atributo "${a.texto}": sem tipo/domínio definido.`);
      }
    }
    const vistos = new Set<string>();
    for (const a of atributos) {
      const nomeAtr = a.texto;
      if (nomeAtr == null || trimAscii(nomeAtr) === '') continue;
      const chave = maiusc(trimAscii(nomeAtr));
      if (vistos.has(chave)) problemas.push(`Entidade "${rotulo}": atributo "${nomeAtr}" duplicado.`);
      else vistos.add(chave);
    }
  }

  const grupos = new Map<string, string[]>();
  for (const ent of entidades) {
    const nome = ent.texto;
    if (nome == null || trimAscii(nome) === '') continue;
    const k = maiusc(trimAscii(nome));
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(nome);
  }
  for (const k of ordemTabelaHash([...grupos.keys()])) {
    const grupo = grupos.get(k)!;
    if (grupo.length > 1) problemas.push(`Nome de entidade duplicado: "${grupo[0]}" (${grupo.length} ocorrências).`);
  }

  for (const r of d.formas) {
    if (r.kind !== 'relacionamento' && r.kind !== 'autorelacionamento') continue;
    if (r.texto == null || trimAscii(r.texto) === '') problemas.push(`Relacionamento sem nome (id ${r.id}).`);
  }

  return problemas;
}
