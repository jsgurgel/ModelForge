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

export type TipoDiagrama = 'conceitual' | 'logico' | 'eap' | 'fluxo' | 'atividade' | 'livre' | 'nosql';

export const TIPOS: TipoDiagrama[] = ['conceitual', 'logico', 'fluxo', 'atividade', 'eap', 'livre', 'nosql'];

export const NOME_TIPO: Record<TipoDiagrama, string> = {
  conceitual: 'Conceitual',
  logico: 'Lógico',
  fluxo: 'Fluxo',
  atividade: 'Atividade',
  eap: 'EAP',
  livre: 'Livre',
  nosql: 'NoSQL',
};

export const ICONE_TIPO: Record<TipoDiagrama, string> = {
  conceitual: 'mer.png',
  logico: 'logico.png',
  fluxo: 'fluxo.png',
  atividade: 'atividade.png',
  eap: 'eap.png',
  livre: 'diagrama.png',
  nosql: 'NoSql.png',
};

/** Atalho de "Novo diagrama" (Ctrl+Shift+letra) -. */
export const ATALHO_TIPO: Record<TipoDiagrama, string> = {
  conceitual: 'C',
  logico: 'L',
  fluxo: 'F',
  atividade: 'A',
  eap: 'E',
  livre: 'I',
  nosql: 'N',
};

export interface Fonte {
  nome: string;
  tamanho: number;
  negrito: boolean;
  italico: boolean;
}

/** Campo de tabela. pk/fk/unique são os flags, mantidos em sincronia com as constraints (ver logico.ts). */
export interface CampoTabela {
  id: string;
  nome: string;
  tipo: string;
  complemento: string;
  padrao: string;
  dicionario: string;
  observacao: string;
  srid: string;
  subtipoGeometria: string;
  pk: boolean;
  fk: boolean;
  unique: boolean;
  separador: boolean;
}

export type TipoConstraint = 'PK' | 'UNIQUE' | 'FK' | 'CHECK';

/**
 * Constraint com a semântica: PK/UNIQUE usam camposOrigem; FK usa camposDestino
 * (colunas locais) e camposOrigem (colunas referenciadas) + constraintOrigem; CHECK usa `expressao`.
 * Entradas null = coluna ainda não escolhida.
 */
export interface ConstraintTabela {
  id: string;
  tipo: TipoConstraint;
  nomeada: boolean;
  nome: string;
  expressao: string;
  camposOrigem: (string | null)[];
  camposDestino: (string | null)[];
  constraintOrigem: { tabelaId: string; indice: number } | null;
  onDelete: string;
  onUpdate: string;
  /** Opcionais. */
  dicionario?: string;
  observacao?: string;
}

export interface IndiceTabela {
  id: string;
  nome: string;
  unico: boolean;
  metodo: string;
  condicao: string;
  campos: (string | null)[];
}

export interface GatilhoTabela {
  id: string;
  nome: string;
  momento: string;
  eventos: string;
  porLinha: boolean;
  condicao: string;
  funcao: string;
}

export interface PropsTabela {
  schema: string;
  descricao: string;
  observacao: string;
  estrategiaParticao: string;
  chaveParticao: string;
  tabelaPai: string;
  limiteParticao: string;
  campos: CampoTabela[];
  constraints: ConstraintTabela[];
  indices: IndiceTabela[];
  gatilhos: GatilhoTabela[];
}

export type TipoCampoNoSql =
  | 'string' | 'number' | 'boolean' | 'date' | 'objectid' | 'array' | 'embedded' | 'array_embedded' | 'reference';

export interface CampoNoSql {
  nome: string;
  tipo: TipoCampoNoSql;
  colecaoReferenciada?: string;
  subCampos?: CampoNoSql[];
}

/** Propriedades livres por tipo de forma (campos de tabela, DSL de coleção, etc.). */
export type PropsForma = Record<string, unknown>;

export interface Forma {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  texto: string;
  /** Preenchimento; vazio = padrão da forma. */
  cor?: string;
  corBorda?: string;
  corTexto?: string;
  fonte?: Partial<Fonte>;
  props: PropsForma;
}

export interface Ligacao {
  id: string;
  kind: string;
  de: string;
  para: string;
  texto: string;
  /** Cardinalidade em cada ponta (ex.: "(0,n)"). */
  cardDe: string;
  cardPara: string;
  corBorda?: string;
  props: PropsForma;
}

export interface Diagrama {
  id?: string;
  versao: string;
  nome: string;
  tipo: TipoDiagrama;
  arquivo: string;
  autores: string;
  observacoes: string;
  largura: number;
  altura: number;
  zoom: number;
  espacoH: number;
  espacoV: number;
  /** Prefixo dos nomes de objeto do Lógico ("App_" -> App_tabela). */
  prefixo: string;
  /** Separador de comandos SQL do DDL gerado (padrão ";"). */
  separadorSql: string;
  fonte: Fonte;
  formas: Forma[];
  ligacoes: Ligacao[];
}

export const VERSAO_DIAGRAMA = '3.34.0';

export const FONTE_PADRAO: Fonte = { nome: 'Arial', tamanho: 12, negrito: true, italico: false };

let contador = 0;
export const novoId = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id${Date.now()}${contador++}`);

export function diagramaVazio(tipo: TipoDiagrama, nome: string): Diagrama {
  return {
    versao: VERSAO_DIAGRAMA,
    nome,
    tipo,
    arquivo: '',
    autores: '',
    observacoes: '',
    largura: 4096,
    altura: 4096,
    zoom: 1,
    espacoH: 60,
    espacoV: 50,
    prefixo: '',
    separadorSql: ';',
    fonte: { ...FONTE_PADRAO },
    formas: [],
    ligacoes: [],
  };
}

export function campoVazio(nome: string, tipo = 'VARCHAR(80)'): CampoTabela {
  return {
    id: novoId(), nome, tipo, complemento: '', padrao: '', dicionario: '', observacao: '', srid: '', subtipoGeometria: '',
    pk: false, fk: false, unique: false, separador: false,
  };
}

export function propsTabelaVazias(): PropsTabela {
  return {
    schema: '', descricao: '', observacao: '', estrategiaParticao: '', chaveParticao: '', tabelaPai: '', limiteParticao: '',
    campos: [], constraints: [], indices: [], gatilhos: [],
  };
}
