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

/** Tipos compartilhados do módulo de bancos (conexão SQL/NoSQL, introspecção, migração). */

export type TipoBanco = 'postgresql' | 'mysql' | 'sqlserver' | 'sqlite';

export const TIPOS_BANCO: Record<TipoBanco, { nome: string; portaPadrao: number; usaSchema: boolean }> = {
  postgresql: { nome: 'PostgreSQL', portaPadrao: 5432, usaSchema: true },
  mysql: { nome: 'MySQL / MariaDB', portaPadrao: 3306, usaSchema: false },
  sqlserver: { nome: 'SQL Server', portaPadrao: 1433, usaSchema: true },
  sqlite: { nome: 'SQLite (arquivo no servidor)', portaPadrao: 0, usaSchema: false },
};

/** Parâmetros de conexão SQL, já validados (ver seguranca.ts). Para SQLite, `database` é o caminho do arquivo. */
export interface ParamsConexao {
  tipo: TipoBanco;
  host: string;
  porta: number;
  database: string;
  usuario: string;
  senha: string;
  /** Mantém a criptografia mas não valida o certificado (só para rede interna confiável). */
  confiarCertificado: boolean;
  /** Usar TLS/SSL. Padrão: PostgreSQL desligado, MySQL e SQL Server ligados. */
  tls: boolean;
}

export type TipoObjeto = 'TABELA' | 'VIEW' | 'VIEW_MATERIALIZADA' | 'SEQUENCIA' | 'ROTINA';

export interface ItemBanco {
  nome: string;
  tipo: TipoObjeto;
}

export interface ColunaInfo {
  nome: string;
  /** Tipo já formatado ("varchar(50)", "integer"). */
  tipo: string;
  nullable: boolean;
  /** DEFAULT cru do catálogo (nextval('s'::regclass), 0, 'abc'). */
  padrao: string | null;
}

/** Uma linha de coluna de FK (FKs importadas ou exportadas de uma tabela). */
export interface FkLinha {
  nome: string | null;
  tabelaLocal: string;
  schemaLocal: string | null;
  colunaLocal: string;
  tabelaRef: string;
  schemaRef: string | null;
  colunaRef: string;
}

export interface IndiceLinha {
  nome: string;
  unico: boolean;
  /** Coluna na ordem da posição no índice; nula para índice de expressão. */
  coluna: string | null;
}

export interface SequenciaInfo {
  nome: string;
  incremento: string | null;
  inicio: string | null;
  minimo: string | null;
  maximo: string | null;
  ciclo: string | null;
}

export interface DominioInfo {
  nome: string;
  tipoBase: string;
  tamanho: number | null;
  padrao: string | null;
}

export interface EnumInfo {
  nome: string;
  valores: string[];
}

export interface RotinaInfo {
  nome: string;
  tipo: string | null;
  retorno: string | null;
  corpo: string | null;
  linguagem: string | null;
}

export interface GatilhoLinha {
  nome: string;
  evento: string;
  momento: string | null;
  orientacao: string | null;
  acao: string | null;
  condicao: string | null;
}

export interface Particionamento {
  /** Cláusula a colar no fim do CREATE TABLE (PARTITION BY / INHERITS). */
  cauda: string;
  /** Comando completo quando a tabela é PARTITION OF (substitui o CREATE TABLE). */
  comando: string;
}

/**
 * Leitura do catálogo de um banco (tabelas, colunas, chaves, índices...) por consultas ao catálogo. Um `schema` vazio/nulo significa "sem filtro" (ou banco sem schemas).
 */
export interface Dialeto {
  readonly tipo: TipoBanco;
  readonly usaSchema: boolean;
  schemas(): Promise<string[]>;
  /** Tabelas, views e views materializadas. */
  objetos(schema: string | null): Promise<ItemBanco[]>;
  sequencias(schema: string | null): Promise<ItemBanco[]>;
  rotinasNomes(schema: string | null): Promise<ItemBanco[]>;
  colunas(schema: string | null, tabela: string): Promise<ColunaInfo[]>;
  chavePrimaria(schema: string | null, tabela: string): Promise<string[]>;
  fksImportadas(schema: string | null, tabela: string): Promise<FkLinha[]>;
  fksExportadas(schema: string | null, tabela: string): Promise<FkLinha[]>;
  indices(schema: string | null, tabela: string): Promise<IndiceLinha[]>;
  definicaoView(schema: string | null, nome: string): Promise<string | null>;
  sequenciasDetalhe(schema: string | null): Promise<SequenciaInfo[]>;
  dominios(schema: string | null): Promise<DominioInfo[]>;
  enums(schema: string | null): Promise<EnumInfo[]>;
  rotinas(schema: string | null): Promise<RotinaInfo[]>;
  gatilhos(schema: string | null, tabela: string): Promise<GatilhoLinha[]>;
  particionamento(schema: string | null, tabela: string): Promise<Particionamento>;
  /** Tipo espacial completo por coluna (minúscula): geometry(Point,4326). */
  tiposEspaciais(schema: string | null, tabela: string): Promise<Record<string, string>>;
}

export interface ResultadoSql {
  colunas: string[];
  linhas: unknown[][];
  /** Linhas afetadas quando o comando não devolve linhas; nulo se o driver não informa. */
  afetadas: number | null;
  /** true se o resultado foi cortado no limite de linhas. */
  truncado: boolean;
}

/** Conexão viva com um banco SQL: catálogo (Dialeto) + execução de SQL. */
export interface Conexao extends Dialeto {
  /** Executa UM comando (parametrizado por `params`, sempre strings) e devolve linhas/afetadas. */
  executar(sql: string, params: string[], limiteLinhas: number): Promise<ResultadoSql>;
  fechar(): Promise<void>;
}

// ---- Catálogo estruturado (usado pelo diff de migração) -------------------------------

export interface InfoColuna {
  nome: string;
  tipo: string;
  nullable: boolean;
}

export interface InfoFk {
  colunasLocais: string[];
  tabelaRef: string;
  colunasRef: string[];
}

export interface InfoTabela {
  nome: string;
  /** chave = nome da coluna em minúsculas (ordem de declaração preservada). */
  colunas: Record<string, InfoColuna>;
  /** colunas da PK em minúsculas. */
  pk: string[];
  fks: InfoFk[];
}
