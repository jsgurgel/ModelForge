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

import type { ColunaBanco, ConexaoSql, TipoObjetoBanco } from '../api';
import { alternarUnique, constraintVazia, propsTabela } from './logico';
import { Doc, ligacaoLogica } from './ops';
import { campoVazio, Forma, novoId, propsTabelaVazias } from './types';

/** Tipo de dado do arrastar-e-soltar (HTML5 dnd) usado pelo explorador de banco (aba "Banco"). */
export const TIPO_DND_TABELA = 'application/x-modelforge-tabela';

/** Conteúdo (JSON) do dataTransfer 'application/x-modelforge-tabela'. */
export interface TabelaDoBanco {
  nome: string;
  tipo: TipoObjetoBanco;
  schema: string;
  colunas: ColunaBanco[];
  /** Conexão ativa do explorador (para que o drop busque FKs no servidor). */
  conexao?: ConexaoSql;
}

/** Lê o payload do dnd; devolve null se não for uma tabela do banco válida. */
export function lerTabelaDoBanco(dt: Pick<DataTransfer, 'getData'>): TabelaDoBanco | null {
  try {
    const t = JSON.parse(dt.getData(TIPO_DND_TABELA)) as TabelaDoBanco;
    return t && typeof t.nome === 'string' && Array.isArray(t.colunas) ? t : null;
  } catch {
    return null;
  }
}

/**
 * Cria a forma Lógico (tabela, ou visão/visão materializada) a partir do que o explorador arrastou, com o canto
 * superior esquerdo em (x, y). Pura: o chamador (drop do Canvas) só a adiciona ao diagrama. As FKs não vêm
 * daqui; para trazê-las use o endpoint POST /api/bancos/objeto (bancoApi não o expõe: é DDL -> importador).
 */
export function tabelaDoBancoParaForma(t: TabelaDoBanco, x: number, y: number): Forma {
  if (t.tipo === 'VIEW' || t.tipo === 'VIEW_MATERIALIZADA') {
    return {
      id: novoId(), kind: t.tipo === 'VIEW' ? 'visao' : 'visaoMaterializada', x, y, w: 160, h: 60, texto: t.nome,
      props: { schema: t.schema ?? '', corpo: '' },
    };
  }
  const props = propsTabelaVazias();
  props.schema = t.schema ?? '';
  props.campos = t.colunas.map((c) => {
    const campo = campoVazio(c.nome, c.tipo);
    campo.pk = c.chavePrimaria;
    campo.complemento = c.nullable ? '' : 'NOT NULL';
    campo.padrao = c.padrao ?? '';
    return campo;
  });
  const pk = props.campos.filter((c) => c.pk);
  if (pk.length) props.constraints = [{ ...constraintVazia('PK'), camposOrigem: pk.map((c) => c.id), camposDestino: pk.map(() => null) }];
  const larg = Math.max(160, ...[t.nome, ...t.colunas.map((c) => `${c.nome}: ${c.tipo}`)].map((s) => s.length * 7 + 34));
  return { id: novoId(), kind: 'tabela', x, y, w: larg, h: 28 + Math.max(1, t.colunas.length) * 20, texto: t.nome, props: props as unknown as Record<string, unknown> };
}

/** FK como o backend entrega (uma linha por coluna). */
export interface FkDoBanco { nome: string | null; tabelaLocal: string; schemaLocal?: string | null; colunaLocal: string; tabelaRef: string; schemaRef?: string | null; colunaRef: string }

export interface ResultadoLigacoes { doc: Doc; criadas: number; ausentes: string[]; diagnostico: string[] }

const igual = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const ehTabela = (f: Forma) => f.kind === 'tabela';

/** Tabela do diagrama com esse nome; havendo mais de uma (schemas diferentes), prefere a do schema informado. */
function acharTabela(doc: Doc, nome: string, schema?: string | null): Forma | undefined {
  const cand = doc.formas.filter((f) => ehTabela(f) && igual(f.texto, nome));
  if (cand.length <= 1) return cand[0];
  return cand.find((f) => igual(String(f.props.schema ?? ''), schema ?? '')) ?? cand[0];
}

/** Agrupa as linhas por constraint (FK composta = várias linhas com o mesmo nome; sem nome, por tabela de destino). */
function agrupar(fks: FkDoBanco[]): FkDoBanco[][] {
  const m = new Map<string, FkDoBanco[]>();
  for (const fk of fks) {
    const chave = fk.nome ? `n:${fk.nome}` : `t:${fk.tabelaLocal}>${fk.tabelaRef}`;
    m.set(chave, [...(m.get(chave) ?? []), fk]);
  }
  return [...m.values()];
}

/**
 * Liga a tabela recém-solta (já adicionada a `doc`) às tabelas que já estão no diagrama, nos dois sentidos, como o
 * SoltarTabelaDoBanco: `fks` são as FKs que ela possui e `fksExportadas` as de outras tabelas que a apontam.
 * Cada constraint vira UMA linha (mesmo com colunas compostas ou várias FKs para a mesma tabela) e a coluna
 * referenciada, se ainda não for chave, passa a ser única (o banco já garante isso). `ausentes` lista as tabelas
 * relacionadas que não estão desenhadas (a ligação só existe entre tabelas presentes).
 */
export function ligarFksDaTabelaSolta(doc: Doc, formaId: string, fks: FkDoBanco[], fksExportadas: FkDoBanco[]): ResultadoLigacoes {
  let res = doc;
  let criadas = 0;
  const ausentes = new Set<string>();
  const diagnostico: string[] = [];

  const ligar = (grupo: FkDoBanco[], donaDaFk: 'nova' | 'existente') => {
    const primeira = grupo[0];
    const nomeOutra = donaDaFk === 'nova' ? primeira.tabelaRef : primeira.tabelaLocal;
    const schemaOutra = donaDaFk === 'nova' ? primeira.schemaRef : primeira.schemaLocal;
    const outra = acharTabela(res, nomeOutra, schemaOutra);
    if (!outra) { ausentes.add(nomeOutra); diagnostico.push(`FK ${primeira.nome ?? ''}: a tabela "${nomeOutra}" não está no diagrama`); return; }
    const nova = res.formas.find((f) => f.id === formaId)!;
    //# Origem = a tabela referenciada (tem a chave); destino = a que possui a FK.
    const origemId = donaDaFk === 'nova' ? outra.id : nova.id;
    const destinoId = donaDaFk === 'nova' ? nova.id : outra.id;
    let primeiraColuna = true;
    for (const fk of grupo) {
      const origem = res.formas.find((f) => f.id === origemId)!;
      const destino = res.formas.find((f) => f.id === destinoId)!;
      const cmpRef = propsTabela(origem).campos.find((c) => igual(c.nome, fk.colunaRef));
      const cmpLocal = propsTabela(destino).campos.find((c) => igual(c.nome, fk.colunaLocal));
      if (!cmpRef || !cmpLocal) {
        diagnostico.push(`FK ${fk.nome ?? ''}: ${!cmpRef ? `coluna "${fk.colunaRef}" não existe em "${origem.texto}" (colunas: ${propsTabela(origem).campos.map((c) => c.nome).join(', ')})` : `coluna "${fk.colunaLocal}" não existe em "${destino.texto}" (colunas: ${propsTabela(destino).campos.map((c) => c.nome).join(', ')})`}`);
        continue;
      }
      if (!cmpRef.pk && !cmpRef.unique) {
        const t = alternarUnique(origem, cmpRef.id, true);
        res = { ...res, formas: res.formas.map((f) => (f.id === t.id ? t : f)) };
      }
      res = ligacaoLogica(res, origemId, destinoId, cmpRef.id, cmpLocal.id, primeiraColuna, primeiraColuna);
      if (primeiraColuna) criadas++;
      primeiraColuna = false;
    }
  };

  for (const g of agrupar(fks)) ligar(g, 'nova');
  for (const g of agrupar(fksExportadas)) ligar(g, 'existente');
  return { doc: res, criadas, ausentes: [...ausentes], diagnostico };
}
