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

import { ConstraintTabela, Diagrama, Forma, PropsTabela } from './types';

/**
 * Integridade entre tabelas do Lógico (mudança de tipo, exclusão de campo, alteração e exclusão de IR, exclusão de tabela):
 *  - mudar o tipo de um campo propaga aos campos que ele referencia / que o referenciam;
 *  - apagar uma coluna referenciada anula a coluna de origem das FKs (o campo local fica);
 *  - apagar uma IR ou uma tabela solta a FK (constraintOrigem = null e colunas de origem anuladas);
 *  - reordenar/inserir/excluir constraints reaponta `constraintOrigem.indice` das FKs (o contrato guarda o índice).
 * Uma única função pura, `sincronizarDocumento(doc, antes)`, compara o documento novo com o anterior e é chamada
 * por `mutar` (store) para todo diagrama lógico, então vale para qualquer caminho de edição.
 */

const ehTabela = (f: Forma): boolean => Array.isArray(f.props.campos) && Array.isArray(f.props.constraints);
const pt = (f: Forma) => f.props as unknown as PropsTabela;

/** Solta a FK: sem IR de origem e com as colunas de origem anuladas. */
export function soltarFk(c: ConstraintTabela): ConstraintTabela {
  return { ...c, constraintOrigem: null, camposOrigem: c.camposOrigem.map(() => null) };
}

export function sincronizarDocumento(doc: Diagrama, antes: Diagrama): Diagrama {
  if (doc.tipo !== 'logico' || doc === antes || doc.formas === antes.formas) return doc;

  const antTab = new Map(antes.formas.filter(ehTabela).map((f) => [f.id, f]));
  const tabelas = doc.formas.filter(ehTabela);
  const ids = new Set(tabelas.map((t) => t.id));
  const removidas = [...antTab.keys()].filter((id) => !ids.has(id));
  const alteradas = tabelas.filter((t) => antTab.get(t.id)?.props !== t.props);
  if (!removidas.length && !alteradas.length) return doc;

  const trab = new Map<string, PropsTabela>(tabelas.map((t) => [t.id, pt(t)]));
  const sujas = new Set<string>();
  const trocarConstraints = (tid: string, fn: (c: ConstraintTabela) => ConstraintTabela) => {
    const p = trab.get(tid)!;
    let mudou = false;
    const constraints = p.constraints.map((c) => {
      const n = fn(c);
      if (n !== c) mudou = true;
      return n;
    });
    if (mudou) { trab.set(tid, { ...p, constraints }); sujas.add(tid); }
  };
  const todasFk = (fn: (c: ConstraintTabela, tid: string) => ConstraintTabela) => {
    for (const tid of trab.keys()) trocarConstraints(tid, (c) => (c.tipo === 'FK' ? fn(c, tid) : c));
  };

  // A: FK apontando para tabela que não existe (apagada ou nunca houve) fica solta.
  const varrerTudo = removidas.length > 0;
  for (const tid of trab.keys()) {
    if (!varrerTudo && !alteradas.some((t) => t.id === tid)) continue;
    trocarConstraints(tid, (c) => (c.tipo === 'FK' && c.constraintOrigem && !ids.has(c.constraintOrigem.tabelaId) ? soltarFk(c) : c));
  }

  // B: reindexar constraintOrigem quando a lista de constraints de uma tabela mudou de ordem/tamanho.
  for (const t of alteradas) {
    const ant = antTab.get(t.id);
    if (!ant) continue;
    const velhas = pt(ant).constraints;
    const novas = trab.get(t.id)!.constraints;
    if (velhas.length === novas.length && velhas.every((c, i) => c.id === novas[i].id)) continue;
    const novoIndice = (i: number) => {
      const c = velhas[i];
      return c ? novas.findIndex((n) => n.id === c.id) : -1;
    };
    todasFk((c, tid) => {
      const o = c.constraintOrigem;
      if (!o || o.tabelaId !== t.id) return c;
      //# Só reaponta FK que já existia igual antes; uma FK nova/editada nesta mesma alteração já vem com o índice certo.
      const anterior = antTab.get(tid) && pt(antTab.get(tid)!).constraints.find((x) => x.id === c.id);
      const igual = anterior?.constraintOrigem && anterior.constraintOrigem.tabelaId === o.tabelaId && anterior.constraintOrigem.indice === o.indice;
      if (!igual || o.indice >= velhas.length) return c;
      const j = novoIndice(o.indice);
      if (j < 0) return soltarFk(c);
      return j === o.indice ? c : { ...c, constraintOrigem: { ...o, indice: j } };
    });
  }

  // C: a IR de origem perdeu uma coluna -> a coluna correspondente da FK é anulada.
  for (const t of alteradas) {
    const ant = antTab.get(t.id);
    if (!ant) continue;
    const velhas = pt(ant).constraints;
    trab.get(t.id)!.constraints.forEach((nova, indice) => {
      const velha = velhas.find((v) => v.id === nova.id);
      if (!velha || velha.tipo === 'FK') return;
      const perdidas = velha.camposOrigem.filter((x): x is string => !!x && !nova.camposOrigem.includes(x));
      if (!perdidas.length) return;
      todasFk((c) => {
        if (!c.constraintOrigem || c.constraintOrigem.tabelaId !== t.id || c.constraintOrigem.indice !== indice) return c;
        if (!c.camposOrigem.some((x) => x && perdidas.includes(x))) return c;
        return { ...c, camposOrigem: c.camposOrigem.map((x) => (x && perdidas.includes(x) ? null : x)) };
      });
    });
  }

  // D: campo apagado -> FKs que o referenciavam guardam null naquela posição.
  const apagados = new Set<string>();
  for (const t of alteradas) {
    const ant = antTab.get(t.id);
    if (!ant) continue;
    const vivos = new Set(trab.get(t.id)!.campos.map((c) => c.id));
    pt(ant).campos.forEach((c) => { if (!vivos.has(c.id)) apagados.add(c.id); });
  }
  for (const id of removidas) pt(antTab.get(id)!).campos.forEach((c) => apagados.add(c.id));
  if (apagados.size) {
    todasFk((c) => (c.camposOrigem.some((x) => x && apagados.has(x))
      ? { ...c, camposOrigem: c.camposOrigem.map((x) => (x && apagados.has(x) ? null : x)) }
      : c));
  }

  // E: tipo alterado propaga às contrapartes (cadeia até estabilizar).
  const tipoAtual = new Map<string, string>();
  for (const p of trab.values()) for (const c of p.campos) tipoAtual.set(c.id, c.tipo);
  const fila: string[] = [];
  for (const t of alteradas) {
    const ant = antTab.get(t.id);
    if (!ant) continue;
    for (const c of trab.get(t.id)!.campos) {
      const velho = pt(ant).campos.find((x) => x.id === c.id);
      if (velho && velho.tipo !== c.tipo) fila.push(c.id);
    }
  }
  const novoTipo = new Map<string, string>();
  let guarda = 0;
  while (fila.length && guarda++ < 10000) {
    const id = fila.shift()!;
    const tipo = tipoAtual.get(id)!;
    for (const p of trab.values()) {
      for (const c of p.constraints) {
        let par: string | null | undefined;
        const io = c.camposOrigem.indexOf(id);
        if (io > -1) par = c.camposDestino[io];
        else {
          const idd = c.camposDestino.indexOf(id);
          if (idd > -1) par = c.camposOrigem[idd];
        }
        if (par && tipoAtual.has(par) && tipoAtual.get(par) !== tipo) {
          tipoAtual.set(par, tipo);
          novoTipo.set(par, tipo);
          fila.push(par);
        }
      }
    }
  }
  if (novoTipo.size) {
    for (const [tid, p] of trab) {
      if (!p.campos.some((c) => novoTipo.has(c.id))) continue;
      trab.set(tid, { ...p, campos: p.campos.map((c) => (novoTipo.has(c.id) ? { ...c, tipo: novoTipo.get(c.id)! } : c)) });
      sujas.add(tid);
    }
  }

  if (!sujas.size) return doc;
  return { ...doc, formas: doc.formas.map((f) => (sujas.has(f.id) ? { ...f, props: { ...f.props, ...trab.get(f.id)! } } : f)) };
}

/**
 * Para editores que trabalham numa cópia da tabela: quando a lista de constraints muda (remoção/inserção/ordem), as FKs
 * desta mesma tabela que apontam para as próprias IR seguem a IR pelo id (as FKs de outras tabelas são tratadas por
 * `sincronizarDocumento` ao aplicar).
 */
export function reapontarAutoFk(tabelaId: string, velhas: ConstraintTabela[], novas: ConstraintTabela[]): ConstraintTabela[] {
  return novas.map((c) => {
    const o = c.tipo === 'FK' ? c.constraintOrigem : null;
    if (!o || o.tabelaId !== tabelaId) return c;
    const alvo = velhas[o.indice];
    if (!alvo) return c;
    const j = novas.findIndex((x) => x.id === alvo.id);
    if (j < 0) return soltarFk(c);
    return j === o.indice ? c : { ...c, constraintOrigem: { ...o, indice: j } };
  });
}
