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

import { CampoTabela, ConstraintTabela, Forma, PropsTabela, TipoConstraint, novoId } from './types';

/**
 * Regras do modelo Lógico (chave, unique, FK, remoção de campo e limpeza de constraints): os flags pk/unique/fk dos campos e as constraints andam juntos.
 * Todas as funções são puras: recebem a tabela (Forma) e devolvem a nova.
 */

export const propsTabela = (t: Forma): PropsTabela => t.props as unknown as PropsTabela;

const com = (t: Forma, p: Partial<PropsTabela>): Forma => ({ ...t, props: { ...t.props, ...p } });

export const constraintVazia = (tipo: TipoConstraint): ConstraintTabela => ({
  id: novoId(), tipo, nomeada: false, nome: '', expressao: '', camposOrigem: [], camposDestino: [],
  constraintOrigem: null, onDelete: '', onUpdate: '',
});

/** PK/UNIQUE guardam camposDestino em paralelo, com null. */
const poeOrigem = (c: ConstraintTabela, campoId: string): ConstraintTabela =>
  c.camposOrigem.includes(campoId) ? c : { ...c, camposOrigem: [...c.camposOrigem, campoId], camposDestino: [...c.camposDestino, null] };

const tiraOrigem = (c: ConstraintTabela, campoId: string): ConstraintTabela => {
  const i = c.camposOrigem.indexOf(campoId);
  if (i < 0) return c;
  return { ...c, camposOrigem: c.camposOrigem.filter((_, k) => k !== i), camposDestino: c.camposDestino.filter((_, k) => k !== i) };
};

/** Constraint sem nenhuma coluna some (AnaliseAndRemove); as de tipo CHECK vivem só da expressão. */
function limpar(constraints: ConstraintTabela[]): ConstraintTabela[] {
  return constraints.filter((c) => c.tipo === 'CHECK' || c.camposOrigem.length > 0 || c.camposDestino.length > 0);
}

export function alternarPk(t: Forma, campoId: string, valor: boolean): Forma {
  const p = propsTabela(t);
  const campos = p.campos.map((c) => (c.id === campoId ? { ...c, pk: valor } : c));
  let constraints = p.constraints;
  const pk = constraints.find((c) => c.tipo === 'PK');
  if (!pk) {
    if (valor) constraints = [...constraints, poeOrigem(constraintVazia('PK'), campoId)];
  } else if (valor && !pk.camposOrigem.includes(campoId)) {
    constraints = constraints.map((c) => (c === pk ? poeOrigem(c, campoId) : c));
  } else if (!valor) {
    constraints = limpar(constraints.map((c) => (c === pk ? tiraOrigem(c, campoId) : c)));
  }
  return com(t, { campos, constraints });
}

/** UNIQUE: o campo entra na PRIMEIRA constraint UNIQUE; ao desmarcar, tira de todas. */
export function alternarUnique(t: Forma, campoId: string, valor: boolean): Forma {
  const p = propsTabela(t);
  const campos = p.campos.map((c) => (c.id === campoId ? { ...c, unique: valor } : c));
  let constraints = p.constraints;
  const un = constraints.find((c) => c.tipo === 'UNIQUE');
  if (!un) {
    if (valor) constraints = [...constraints, poeOrigem(constraintVazia('UNIQUE'), campoId)];
  } else if (valor) {
    constraints = constraints.map((c) => (c === un ? poeOrigem(c, campoId) : c));
  } else {
    constraints = limpar(constraints.map((c) => (c.tipo === 'UNIQUE' ? tiraOrigem(c, campoId) : c)));
  }
  return com(t, { campos, constraints });
}

/** FK marcada à mão: entra numa FK ainda sem origem (não validada) ou cria uma nova; ao desmarcar, sai dela. */
export function alternarFk(t: Forma, campoId: string, valor: boolean): Forma {
  const p = propsTabela(t);
  const campos = p.campos.map((c) => (c.id === campoId ? { ...c, fk: valor } : c));
  let constraints = p.constraints;
  const aberta = constraints.find((c) => c.tipo === 'FK' && !c.constraintOrigem);
  if (!aberta) {
    if (valor) constraints = [...constraints, { ...constraintVazia('FK'), camposOrigem: [null], camposDestino: [campoId] }];
  } else if (valor) {
    if (!aberta.camposDestino.includes(campoId)) {
      constraints = constraints.map((c) => (c === aberta ? { ...c, camposOrigem: [...c.camposOrigem, null], camposDestino: [...c.camposDestino, campoId] } : c));
    }
  } else {
    constraints = limpar(constraints.map((c) => {
      if (c !== aberta) return c;
      const i = c.camposDestino.indexOf(campoId);
      if (i < 0) return c;
      return { ...c, camposOrigem: c.camposOrigem.filter((_, k) => k !== i), camposDestino: c.camposDestino.filter((_, k) => k !== i) };
    }));
  }
  return com(t, { campos, constraints });
}

/** Remove o campo da tabela e de tudo que o referencia (constraints locais, índices). */
export function removerCampo(t: Forma, campoId: string): Forma {
  const p = propsTabela(t);
  const constraints = limpar(p.constraints.map((c) => {
    if (c.tipo === 'FK') {
      const idx = c.camposDestino.map((x, i) => (x === campoId ? i : -1)).filter((i) => i >= 0);
      if (!idx.length) return { ...c, camposOrigem: c.camposOrigem.filter((x) => x !== campoId) };
      return {
        ...c,
        camposOrigem: c.camposOrigem.filter((_, i) => !idx.includes(i)),
        camposDestino: c.camposDestino.filter((_, i) => !idx.includes(i)),
      };
    }
    return tiraOrigem(c, campoId);
  }));
  const indices = p.indices.map((i) => ({ ...i, campos: i.campos.filter((x) => x !== campoId) })).filter((i) => i.campos.length > 0);
  return com(t, { campos: p.campos.filter((c) => c.id !== campoId), constraints, indices });
}

/** O nome livre é o próprio ("Campo") e, se já existe, "Campo_1", "Campo_2"... */
export function nomeieCampo(campos: { nome: string }[], nome: string): string {
  if (nome === '_') return nome;
  const usados = new Set(campos.map((c) => c.nome));
  let i = 0;
  let tmp = nome;
  while (usados.has(tmp)) tmp = `${nome}_${++i}`;
  return tmp;
}

/** ConverterParaFisico: há algum campo sem tipo em alguma tabela?. */
export const temCampoSemTipo = (formas: Forma[]): boolean =>
  formas.some((f) => Array.isArray(f.props.campos) && (f.props.campos as CampoTabela[]).some((c) => !c.separador && !c.tipo.trim()));

export const campoPorId = (t: Forma, id: string | null): CampoTabela | undefined =>
  id ? propsTabela(t).campos.find((c) => c.id === id) : undefined;

/** Constraint PK ou UNIQUE (ou a chave de um campo unique) que cobre `campoId`; é a "origem" de uma FK. */
export function constraintChave(t: Forma, campoId: string): { indice: number; c: ConstraintTabela } | undefined {
  const cs = propsTabela(t).constraints;
  const campo = campoPorId(t, campoId);
  if (!campo) return undefined;
  const i = campo.unique
    ? cs.findIndex((c) => c.tipo === 'UNIQUE' && c.camposOrigem.includes(campoId))
    : cs.findIndex((c) => c.tipo === 'PK');
  return i >= 0 ? { indice: i, c: cs[i] } : undefined;
}

/** Recalcula pk/unique/fk dos campos a partir das constraints (usado depois de editar constraints à mão). */
export function sincronizarFlags(t: Forma): Forma {
  const p = propsTabela(t);
  const pk = new Set<string>();
  const un = new Set<string>();
  const fk = new Set<string>();
  for (const c of p.constraints) {
    if (c.tipo === 'PK') c.camposOrigem.forEach((x) => x && pk.add(x));
    if (c.tipo === 'UNIQUE') c.camposOrigem.forEach((x) => x && un.add(x));
    if (c.tipo === 'FK') c.camposDestino.forEach((x) => x && fk.add(x));
  }
  return com(t, { campos: p.campos.map((c) => ({ ...c, pk: pk.has(c.id), unique: un.has(c.id), fk: fk.has(c.id) })) });
}

// ---------------------------------------------------------------------------------------------
// Exibição da Tabela, validação por IR e DDL desenhado na tabela.
// ---------------------------------------------------------------------------------------------

export interface OpcoesTabela {
  autosize: boolean;
  /** "Forma simples": os campos aparecem como `Tabela { a, b, c }`. */
  plain: boolean;
  showDDL: boolean;
  mostrarConstraints: boolean;
  /** "IR simplificada": as constraints viram uma fileira de ícones. */
  plainIR: boolean;
}

export const opcoesDaTabela = (t: Forma): OpcoesTabela => ({
  autosize: t.props.autosize !== false,
  plain: !!t.props.showInPlain,
  showDDL: !!t.props.showDDL,
  mostrarConstraints: t.props.mostrarConstraints !== false,
  plainIR: t.props.plainIR !== false,
});

export type MotivoValidade = 'ok' | 'consOrigem' | 'qtdCmp' | 'tipo' | 'rep' | 'ligacao' | 'ku' | 'expr';

/** Textos de validação das constraints. */
export const TEXTO_VALIDADE: Record<MotivoValidade, string> = {
  ok: 'Validada',
  consOrigem: '* sem IR de origem',
  qtdCmp: '* qtd. campos',
  tipo: '* tipos de dados',
  rep: '* repetição de campo',
  ligacao: '* informar ligação',
  ku: '* PK é sempre ÚNICO',
  expr: '* expressão vazia',
};

interface DocMinimo { formas: Forma[]; ligacoes: { kind: string; de: string; para: string }[] }

/** Por que uma IR não está validada (ou 'ok'). Sem `doc`, a FK só exige a IR de origem. */
export function validarConstraint(t: Forma, c: ConstraintTabela, doc?: DocMinimo): MotivoValidade {
  const p = propsTabela(t);
  if (c.tipo === 'CHECK') return c.expressao.trim() ? 'ok' : 'expr';
  if (c.tipo !== 'FK') {
    const so = c.camposOrigem.filter((x): x is string => !!x);
    if (so.length === 1) {
      const cx = p.campos.find((k) => k.id === so[0]);
      if (cx?.pk && cx.unique) return 'ku';
    }
    return 'ok';
  }
  const org = c.constraintOrigem;
  if (doc && org && org.tabelaId !== t.id && !doc.ligacoes.some((l) => l.kind === 'logicoLinha' && ((l.de === t.id && l.para === org.tabelaId) || (l.para === t.id && l.de === org.tabelaId)))) return 'ligacao';
  if (!org) return 'consOrigem';
  if (!doc) return 'ok';
  const tabOrg = doc.formas.find((f) => f.id === org.tabelaId);
  const cOrg = tabOrg ? propsTabela(tabOrg).constraints[org.indice] : undefined;
  if (!tabOrg || !cOrg) return 'consOrigem';
  if (cOrg.camposOrigem.length !== c.camposOrigem.length) return 'qtdCmp';
  for (let i = 0; i < c.camposOrigem.length; i++) {
    const ref = c.camposOrigem[i];
    const local = campoPorId(t, c.camposDestino[i] ?? null);
    const remoto = tabOrg ? propsTabela(tabOrg).campos.find((k) => k.id === ref) : undefined;
    if (!remoto || !local || remoto.tipo !== local.tipo) return 'tipo';
  }
  const refs = c.camposOrigem.filter((x): x is string => !!x);
  if (new Set(refs).size !== refs.length) return 'rep';
  return 'ok';
}

/** Nome mostrado da IR. */
export const nomeDaConstraint = (c: ConstraintTabela): string =>
  c.nomeada && c.nome ? c.nome : ({ PK: 'Chave primária', UNIQUE: 'Único', FK: 'Chave estrangeira', CHECK: 'Verificação' } as const)[c.tipo];

const nomesDosCampos = (t: Forma, ids: (string | null)[]) =>
  ids.map((x) => (x === null ? '[]' : propsTabela(t).campos.find((c) => c.id === x)?.nome || '?')).join(', ');

/** DDL resumido de uma tabela para exibir no desenho (o DDL oficial é gerado no backend). */
export function ddlDaTabela(t: Forma, doc?: DocMinimo, prefixo = ''): string[] {
  const p = propsTabela(t);
  const nome = `${p.schema ? `${p.schema}.` : ''}${prefixo}${t.texto}`;
  const cols = p.campos.filter((c) => !c.separador).map((c) => `  ${c.nome} ${c.tipo}${c.complemento ? ` ${c.complemento}` : ''}${c.padrao ? ` DEFAULT ${c.padrao}` : ''}`);
  const irs = p.constraints.map((c) => {
    const pre = c.nomeada && c.nome ? `CONSTRAINT ${c.nome} ` : '';
    if (c.tipo === 'CHECK') return `  ${pre}CHECK (${c.expressao})`;
    if (c.tipo === 'PK') return `  ${pre}PRIMARY KEY (${nomesDosCampos(t, c.camposOrigem)})`;
    if (c.tipo === 'UNIQUE') return `  ${pre}UNIQUE (${nomesDosCampos(t, c.camposOrigem)})`;
    const tab = c.constraintOrigem ? doc?.formas.find((f) => f.id === c.constraintOrigem!.tabelaId) : undefined;
    const ref = tab ? `${prefixo}${tab.texto} (${nomesDosCampos(tab, c.camposOrigem)})` : '?';
    return `  ${pre}FOREIGN KEY (${nomesDosCampos(t, c.camposDestino)}) REFERENCES ${ref}${c.onDelete ? ` ON DELETE ${c.onDelete}` : ''}${c.onUpdate ? ` ON UPDATE ${c.onUpdate}` : ''}`;
  });
  const corpo = [...cols, ...irs];
  const linhas = [`CREATE TABLE ${nome} (`, ...corpo.map((l, i) => (i < corpo.length - 1 ? `${l},` : l)), ');'];
  for (const ix of p.indices) {
    linhas.push(`CREATE ${ix.unico ? 'UNIQUE ' : ''}INDEX ${ix.nome || 'idx'} ON ${nome}${ix.metodo ? ` USING ${ix.metodo}` : ''} (${nomesDosCampos(t, ix.campos)});`);
  }
  return linhas;
}

export interface ItemPlain { texto: string; x: number; campoId: string; largura: number }
export interface LayoutTabela {
  /** Y do primeiro campo e altura ocupada pelos campos. */
  yCampos: number;
  hCampos: number;
  plain: { titulo: string; linhas: { y: number; itens: ItemPlain[] }[]; fecha: { x: number; y: number }; rowH: number } | null;
  yIR: number | null;
  hIR: number;
  yIndices: number | null;
  yGatilhos: number | null;
  yDDL: number | null;
  ddl: string[];
  altura: number;
  rowIR: number;
}

const ALT_TIT = 24;
const ALT_LIN = 18;
const LINHA_IR = 22;
const PISO = 6;

/** Largura aproximada de um texto (mesma régua de geometry.larguraTexto; duplicada para evitar ciclo de módulos). */
const larg = (s: string, tam: number) => Math.ceil(s.length * tam * 0.62);

/**
 * Disposição vertical do conteúdo da tabela: campos (lista ou "forma simples"), IR (ícones ou linhas), índices,
 * gatilhos e DDL, e a altura total resultante (usada quando "Altura automática" está ligada).
 */
export function layoutTabela(t: Forma, tamFonte = 12, doc?: DocMinimo): LayoutTabela {
  const p = propsTabela(t);
  const o = opcoesDaTabela(t);
  const campos = p.campos ?? [];
  let y = ALT_TIT;
  let plain: LayoutTabela['plain'] = null;
  const yCampos = y;
  let hCampos: number;
  if (!o.plain) {
    hCampos = Math.max(campos.length, 1) * ALT_LIN;
  } else {
    const fs = tamFonte - 1;
    const rowH = Math.round(fs * 1.25) + 6;
    const tit = `${t.texto} {`;
    const linhas: { y: number; itens: ItemPlain[] }[] = [{ y: yCampos + rowH, itens: [] }];
    let x = larg(tit, fs) + 4;
    campos.forEach((c, i) => {
      const s = c.nome + (i < campos.length - 1 ? ', ' : '');
      const w = larg(s, fs);
      if (x + w > t.w - 4 && linhas[linhas.length - 1].itens.length) {
        linhas.push({ y: linhas[linhas.length - 1].y + rowH, itens: [] });
        x = 20;
      }
      linhas[linhas.length - 1].itens.push({ texto: s, x, campoId: c.id, largura: w });
      x += w;
    });
    let yFecha = linhas[linhas.length - 1].y;
    let xFecha = x;
    if (x + larg('}', fs) >= t.w) { yFecha += rowH; xFecha = 20; }
    plain = { titulo: tit, linhas, fecha: { x: xFecha, y: yFecha }, rowH };
    hCampos = yFecha - yCampos + Math.round(rowH / 3);
  }
  y += hCampos;
  let yIR: number | null = null;
  let hIR = 0;
  let yIndices: number | null = null;
  let yGatilhos: number | null = null;
  if (o.mostrarConstraints) {
    if (p.constraints.length) {
      yIR = y + 4;
      hIR = o.plainIR ? LINHA_IR : p.constraints.length * LINHA_IR;
      y = yIR + hIR;
    }
    if (p.indices.length) { yIndices = y + 4; y = yIndices + p.indices.length * LINHA_IR; }
    if (p.gatilhos.length) { yGatilhos = y + 4; y = yGatilhos + p.gatilhos.length * LINHA_IR; }
  }
  let yDDL: number | null = null;
  let ddl: string[] = [];
  if (o.showDDL) {
    ddl = ddlDaTabela(t, doc);
    yDDL = y + 4;
    y = yDDL + ddl.length * (tamFonte + 2) + 8;
  }
  return { yCampos, hCampos, plain, yIR, hIR, yIndices, yGatilhos, yDDL, ddl, altura: Math.max(y + PISO, 50), rowIR: LINHA_IR };
}

/** Altura que a tabela precisa. */
export const alturaDaTabela = (t: Forma, tamFonte?: number): number => layoutTabela(t, tamFonte ?? t.fonte?.tamanho ?? 12).altura;

/** Move um item de uma lista (campos, constraints, índices, gatilhos) uma posição para cima/baixo. */
export function moverItem<T>(lista: T[], idx: number, delta: -1 | 1): T[] {
  const j = idx + delta;
  if (idx < 0 || j < 0 || j >= lista.length) return lista;
  const n = lista.slice();
  [n[idx], n[j]] = [n[j], n[idx]];
  return n;
}

/** Alterna view <-> view materializada, função <-> procedure e enum <-> domain mantendo o que for comum. */
export function alternarVariante(f: Forma): Forma {
  switch (f.kind) {
    //# A borda vira roxa (0x7B1FA2) na materializada e volta ao padrão (preto) na comum.
    case 'visao': return { ...f, kind: 'visaoMaterializada', corBorda: '#7b1fa2' };
    case 'visaoMaterializada': return { ...f, kind: 'visao', corBorda: undefined };
    case 'funcao': return { ...f, kind: 'procedure', props: { ...f.props, retorno: '' } };
    case 'procedure': return { ...f, kind: 'funcao' };
    case 'enum': return { ...f, kind: 'dominio', props: { tipoBase: '', padrao: '', naoNulo: false, restricao: '', ...f.props } };
    case 'dominio': return { ...f, kind: 'enum', props: { rotulos: '', ...f.props } };
    default: return f;
  }
}

export const VARIANTE_ALTERNATIVA: Record<string, string> = {
  visao: 'View materializada', visaoMaterializada: 'View', funcao: 'Procedure', procedure: 'Function', enum: 'Domain', dominio: 'Enum',
};
