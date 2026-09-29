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

import { Diagrama, Forma } from './editor/types';

// ---- Token de acesso (API_TOKEN do backend) -------------------------------------------------------------------

const CHAVE_TOKEN = 'modelforge.token';

/** Token guardado só na sessão do navegador (sessionStorage); some ao fechar a aba. */
export function lerToken(): string {
  try { return sessionStorage.getItem(CHAVE_TOKEN) ?? ''; } catch { return ''; }
}

export function gravarToken(token: string): void {
  try {
    if (token) sessionStorage.setItem(CHAVE_TOKEN, token);
    else sessionStorage.removeItem(CHAVE_TOKEN);
  } catch { /* navegação privada / armazenamento bloqueado: o token vale só até recarregar */ memoria = token; }
  memoria = token;
}

let memoria = '';

/** Cabeçalhos de autenticação para qualquer chamada à API (inclusive downloads feitos com fetch). */
export function cabecalhoAuth(): Record<string, string> {
  const t = lerToken() || memoria;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

let pedirToken: (() => Promise<boolean>) | null = null;
let pedindo: Promise<boolean> | null = null;

/** O diálogo de login se registra aqui; devolve true quando o usuário informou um token. */
export function registrarPedidoDeToken(fn: () => Promise<boolean>): void {
  pedirToken = fn;
}

/** `fetch` para a API com o token; num 401 pede o token (uma vez, compartilhado entre chamadas paralelas) e repete. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const enviar = () => fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...cabecalhoAuth(), ...(init.headers as Record<string, string> | undefined) } });
  let r = await enviar();
  if (r.status === 401 && pedirToken) {
    pedindo ??= pedirToken().finally(() => { pedindo = null; });
    if (await pedindo) r = await enviar();
  }
  return r;
}

async function chamar<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await apiFetch(url, init);
  if (!r.ok) {
    const corpo = await r.json().catch(() => null);
    const msg = Array.isArray(corpo?.message) ? corpo.message.join('\n') : corpo?.message ?? r.statusText;
    throw new Error(msg);
  }
  return r.status === 204 ? (undefined as T) : r.json();
}

export type RespostaConversao = { opcao: number } | { todos: true };

export interface PerguntaConversao {
  indice: number;
  tipo: string;
  forma?: string;
  padrao: number;
  desabilitadas: number[];
  textos: string[];
  opcoes: string[];
  observacoes: string[];
}

export type ResultadoConversaoInterativa =
  | { pendente: PerguntaConversao }
  | { concluido: { diagrama: Diagrama; avisos: string[]; erros: string[] } };

export interface ResumoDiagrama { id: string; nome: string; tipo: string }

export const api = {
  listar: () => chamar<ResumoDiagrama[]>('/api/diagramas'),
  obter: (id: string) => chamar<Diagrama>(`/api/diagramas/${encodeURIComponent(id)}`),
  salvar: (d: Diagrama) =>
    d.id
      ? chamar<Diagrama>(`/api/diagramas/${encodeURIComponent(d.id)}`, { method: 'PUT', body: JSON.stringify(d) })
      : chamar<Diagrama>('/api/diagramas', { method: 'POST', body: JSON.stringify(d) }),
  remover: (id: string) => chamar<void>(`/api/diagramas/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** Geradores/conversores do backend: ddl, orm/<linguagem>, doc, validar, dsl, converter/... */
  gerar: <T = { texto: string }>(caminho: string, corpo: unknown) =>
    chamar<T>(`/api/geradores/${caminho}`, { method: 'POST', body: JSON.stringify(corpo) }),
  /** Diz se a API exige token (rota pública de saúde). */
  saude: () => fetch('/api/saude').then((r) => (r.ok ? (r.json() as Promise<{ ok: boolean; autenticacao: boolean }>) : { ok: false, autenticacao: false })).catch(() => ({ ok: false, autenticacao: false })),
  /** Conversão Conceitual -> Lógico com as perguntas do diálogo (duas fases; ver PerguntasConversao). */
  converterInterativo: (diagrama: unknown, respostas: RespostaConversao[]) =>
    chamar<ResultadoConversaoInterativa>('/api/geradores/converter/logico/interativo', { method: 'POST', body: JSON.stringify({ diagrama, respostas }) }),
};

// ---- Bancos de dados (backend/src/bancos) -----------------------------------------------------

export type TipoBanco = 'postgresql' | 'mysql' | 'sqlserver' | 'sqlite';
export type TipoObjetoBanco = 'TABELA' | 'VIEW' | 'VIEW_MATERIALIZADA' | 'SEQUENCIA' | 'ROTINA';

/** Dados de conexão SQL. Com `id` (conexão salva) o servidor usa os dados salvos; só a senha pode ser acrescentada. */
export interface ConexaoSql {
  id?: string;
  tipo: TipoBanco;
  host: string;
  porta: number;
  database: string;
  usuario: string;
  senha: string;
  confiarCertificado: boolean;
  tls: boolean;
  schema?: string;
}

export interface ConexaoNoSqlDados { id?: string; uri: string; database: string; amostra?: number }

export interface ConexaoSalva {
  id: string;
  kind: 'sql' | 'nosql';
  nome: string;
  tipo: string;
  host?: string;
  porta?: number;
  database: string;
  schema?: string;
  usuario?: string;
  uri?: string;
  salvarSenha?: boolean;
  salvarCredenciais?: boolean;
  temSenha?: boolean;
  temCredenciais?: boolean;
  confiarCertificado?: boolean;
  tls?: boolean;
  amostra?: number;
}

export interface ColunaBanco { nome: string; tipo: string; nullable: boolean; padrao: string | null; chavePrimaria: boolean }
export interface ObjetoBanco { nome: string; tipo: TipoObjetoBanco; colunas?: ColunaBanco[] }
export interface FkBanco { nome: string | null; tabelaLocal: string; schemaLocal: string | null; colunaLocal: string; tabelaRef: string; schemaRef: string | null; colunaRef: string }
export interface TipoBancoInfo { id: TipoBanco; nome: string; portaPadrao: number; usaSchema: boolean; disponivel: boolean }

export interface ResultadoComandoSql {
  sql: string; colunas: string[]; linhas: unknown[][]; afetadas: number | null; truncado: boolean; ms: number; erro?: string;
}

export interface EntradaCatalogo {
  tipo: string;
  nome: string;
  schema: string | null;
  tipoColuna?: string;
  tabela?: string;
  /** Nome a inserir no editor ("schema.tabela" quando o schema é relevante). */
  inserir?: string;
}
export interface CatalogoAutocomplete { schemas: string[]; objetos: EntradaCatalogo[] }

const post = <T>(caminho: string, corpo: unknown) => chamar<T>(`/api/bancos/${caminho}`, { method: 'POST', body: JSON.stringify(corpo) });

export const bancoApi = {
  tipos: () => chamar<{ tipos: TipoBancoInfo[]; hostsRestritos: boolean }>('/api/bancos/tipos'),
  conexoes: () => chamar<ConexaoSalva[]>('/api/bancos/conexoes'),
  salvarSql: (c: ConexaoSql & { nome: string; salvarSenha: boolean }) => post<ConexaoSalva>('conexoes/sql', c),
  salvarNoSql: (c: ConexaoNoSqlDados & { nome: string; salvarCredenciais: boolean }) => post<ConexaoSalva>('conexoes/nosql', c),
  removerConexao: (id: string) => chamar<void>(`/api/bancos/conexoes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  testar: (conexao: ConexaoSql) => post<{ ok: boolean; erro?: string; schemas: string[] }>('testar', { conexao }),
  objetos: (conexao: ConexaoSql, schema: string) =>
    post<{ schema: string; objetos: ObjetoBanco[]; sequencias: ObjetoBanco[]; rotinas: ObjetoBanco[]; colunasCarregadas: boolean }>('objetos', { conexao, schema }),
  colunas: (conexao: ConexaoSql, schema: string, objeto: string) => post<{ colunas: ColunaBanco[] }>('colunas', { conexao, schema, objeto }),
  detalhes: (conexao: ConexaoSql, schema: string, objeto: string, tipo: TipoObjetoBanco) =>
    post<{ ddl: string; avisos: string[]; chavePrimaria: string[]; fks: FkBanco[]; fksExportadas: FkBanco[]; indices: unknown[] }>('detalhes', { conexao, schema, objeto, tipo }),
  objeto: (corpo: { conexao: ConexaoSql; schema?: string; objeto: string; tipo: TipoObjetoBanco; tabelasNoDiagrama: string[]; modo?: 'logico' | 'conceitual' }) =>
    post<{ ddl: string; avisosCatalogo: string[]; diagrama: Diagrama; avisos: string[]; erros: string[] }>('objeto', corpo),
  importar: (corpo: { conexao: ConexaoSql; schema?: string; selecao?: { schema: string; nome: string; tipo: TipoObjetoBanco }[]; modo: 'logico' | 'conceitual' | 'ambos'; nome?: string }) =>
    post<{ ddl: string; avisosCatalogo: string[]; logico?: { diagrama: Diagrama; avisos: string[]; erros: string[] }; conceitual?: { diagrama: Diagrama; avisos: string[]; erros: string[] } }>('importar', corpo),
  migracao: (conexao: ConexaoSql, schema: string, diagrama: Diagrama) => post<{ texto: string }>('migracao', { conexao, schema, diagrama }),
  catalogo: (conexao: ConexaoSql, schema: string) => post<CatalogoAutocomplete>('catalogo', { conexao, schema }),
  //# Data Grid: consulta paginada e CRUD por PK (backend/src/bancos/dados.ts).
  dados: (conexao: ConexaoSql, schema: string, tabela: string, filtro: { coluna: string; valor: string }[], ordenar: { coluna: string; desc?: boolean }[], pagina: number, porPagina: number) =>
    post<{ colunas: string[]; linhas: unknown[][]; total: number; pagina: number; porPagina: number }>('dados', { conexao, schema, tabela, filtro, ordenar, pagina, porPagina }),
  dadosInserir: (conexao: ConexaoSql, schema: string, tabela: string, colunas: string[], valores: string[]) =>
    post<{ ok: boolean; afetadas: number | null }>('dados/inserir', { conexao, schema, tabela, colunas, valores }),
  dadosAtualizar: (conexao: ConexaoSql, schema: string, tabela: string, colunas: string[], pk: string[], valores: string[], pkValores: string[]) =>
    post<{ ok: boolean; afetadas: number | null }>('dados/atualizar', { conexao, schema, tabela, colunas, pk, valores, pkValores }),
  dadosExcluir: (conexao: ConexaoSql, schema: string, tabela: string, pk: string[], pkValores: string[]) =>
    post<{ ok: boolean; afetadas: number | null }>('dados/excluir', { conexao, schema, tabela, pk, pkValores }),
  dadosDuplicar: (conexao: ConexaoSql, schema: string, tabela: string, colunas: string[], pk: string[], pkValores: string[]) =>
    post<{ ok: boolean; afetadas: number | null }>('dados/duplicar', { conexao, schema, tabela, colunas, pk, pkValores }),
  executar: (corpo: { conexao: ConexaoSql; sql: string; params?: string[]; confirmar: boolean; continuarNoErro?: boolean }) =>
    post<{ resultados: ResultadoComandoSql[]; total: number; parou: boolean }>('executar', corpo),
  nosqlTestar: (conexao: ConexaoNoSqlDados) => post<{ ok: boolean; erro?: string; colecoes: string[] }>('nosql/testar', { conexao }),
  nosqlImportar: (conexao: ConexaoNoSqlDados, amostra?: number) =>
    post<{ colecoes: { nome: string; campos: unknown[] }[]; formas: Forma[] }>('nosql/importar', { conexao, amostra }),
  nosqlScript: (d: Diagrama) => post<{ texto: string }>('nosql/script', d),
};
