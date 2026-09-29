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
 * Modelo do ModelForge - o mesmo JSON que o front (frontend/src/editor/types.ts) grava.
 * Mantenha os dois em sincronia.
 */
export type TipoDiagrama = 'conceitual' | 'logico' | 'eap' | 'fluxo' | 'atividade' | 'livre' | 'nosql';

export interface Forma {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  texto: string;
  cor?: string;
  corBorda?: string;
  corTexto?: string;
  props: Record<string, any>;
}

/** Pontas soltas (opcional): props.pontaA/pontaB {x,y} quando de/para é '' ou id de outra ligação; props.conexaoA/B (0-7) escolhe o ponto de ligação. */
export interface Ligacao {
  id: string;
  kind: string;
  de: string;
  para: string;
  texto: string;
  cardDe: string;
  cardPara: string;
  props: Record<string, any>;
}

export interface Diagrama {
  id?: string;
  nome: string;
  tipo: TipoDiagrama;
  /** Prefixo dos nomes de objeto (Lógico): "App_" -> App_tabela. */
  prefixo?: string;
  formas: Forma[];
  ligacoes: Ligacao[];
  [outro: string]: unknown;
}

// ---- Lógico (props das formas) -----------------------------------------------

/** Campo de tabela. pk/fk/unique marcam chave primária, estrangeira e única. */
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
 * Constraint de tabela:
 * - PK/UNIQUE: camposOrigem = colunas da própria constraint.
 * - FK: camposDestino = colunas locais (FOREIGN KEY (...)); camposOrigem = colunas referenciadas
 *   (REFERENCES tabela (...)); constraintOrigem = a PK/UNIQUE referenciada.
 * - CHECK: só `expressao`.
 * Entradas null = coluna ainda não escolhida (o DDL imprime "???").
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
  /** Opcionais; não entram no dicionário de dados nem na documentação. */
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

/** Kinds de forma do diagrama Lógico. */
export const KINDS_LOGICO = ['tabela', 'visao', 'visaoMaterializada', 'sequencia', 'dominio', 'enum', 'funcao', 'procedure'] as const;
