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
 * Validação de parâmetros de conexão e limites de segurança.
 *
 * Superfície SSRF: o backend abre conexões de rede para o host que o usuário digitar. Regras:
 *  - só conecta ao que o usuário digita explicitamente (nada é inferido/redirecionado);
 *  - lista de hosts permitidos configurável em BANCO_HOSTS_PERMITIDOS (separada por vírgula; aceita
 *    "*.dominio.com"; "*" ou vazio = qualquer host, o padrão - documentado no README/PARIDADE);
 *  - SQLite: BANCO_SQLITE_DIR restringe os arquivos a um diretório (padrão: sem restrição);
 *  - senhas nunca entram em mensagens de erro nem em log;
 *  - tempos de conexão/consulta e tamanho de resultado limitados.
 */
import { BadRequestException } from '@nestjs/common';
import { isAbsolute, relative, resolve } from 'path';
import { ParamsConexao, TIPOS_BANCO, TipoBanco } from './tipos';

export const LIMITES = {
  timeoutConexaoMs: Number(process.env.BANCO_TIMEOUT_CONEXAO_MS ?? 8000),
  timeoutConsultaMs: Number(process.env.BANCO_TIMEOUT_CONSULTA_MS ?? 30000),
  maxLinhas: Number(process.env.BANCO_MAX_LINHAS ?? 1000),
  maxLinhasAbsoluto: 10000,
  maxCelulaChars: 10000,
  maxSql: 1_000_000,
  maxComandos: 200,
  maxAmostraNoSql: 1000,
};

export function hostsPermitidos(): string[] {
  return (process.env.BANCO_HOSTS_PERMITIDOS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function hostPermitido(host: string, lista = hostsPermitidos()): boolean {
  if (!lista.length || lista.includes('*')) return true;
  const h = host.toLowerCase();
  return lista.some((p) => (p.startsWith('*.') ? h.endsWith(p.slice(1)) && h.length > p.length - 1 : p === h));
}

const HOST_VALIDO = /^[A-Za-z0-9._:\-\[\]]+$/;

function texto(v: unknown, campo: string, max = 512): string {
  if (v == null) return '';
  if (typeof v !== 'string') throw new BadRequestException(`${campo} deve ser um texto`);
  if (v.length > max) throw new BadRequestException(`${campo} é longo demais`);
  if (v.includes('\0')) throw new BadRequestException(`${campo} contém caractere inválido`);
  return v;
}

/** Valida e normaliza o objeto de conexão vindo do cliente. Lança 400 em qualquer problema. */
export function validarParams(bruto: unknown): ParamsConexao {
  if (!bruto || typeof bruto !== 'object') throw new BadRequestException('informe os dados da conexão');
  const b = bruto as Record<string, unknown>;
  const tipo = b.tipo as TipoBanco;
  if (typeof tipo !== 'string' || !(tipo in TIPOS_BANCO)) {
    throw new BadRequestException(`tipo de banco inválido (use ${Object.keys(TIPOS_BANCO).join(', ')})`);
  }
  const database = texto(b.database, 'database', 1024).trim();
  const senha = texto(b.senha, 'senha', 1024);
  const confiarCertificado = b.confiarCertificado === true;
  const tls = typeof b.tls === 'boolean' ? b.tls : tipo !== 'postgresql';
  if (tipo === 'sqlite') {
    if (!database) throw new BadRequestException('Escolha o arquivo SQLite.');
    return { tipo, host: '', porta: 0, database: validarCaminhoSqlite(database), usuario: '', senha: '', confiarCertificado: false, tls: false };
  }
  const host = texto(b.host, 'host', 255).trim();
  const usuario = texto(b.usuario, 'usuário', 255).trim();
  if (!host || !database || !usuario) throw new BadRequestException('Preencha host, database e usuário.');
  if (!HOST_VALIDO.test(host)) throw new BadRequestException('host inválido');
  const portaBruta = b.porta == null || b.porta === '' ? TIPOS_BANCO[tipo].portaPadrao : Number(b.porta);
  if (!Number.isInteger(portaBruta) || portaBruta < 1 || portaBruta > 65535) throw new BadRequestException('Porta inválida.');
  if (!hostPermitido(host)) throw new BadRequestException('host não permitido pela configuração do servidor (BANCO_HOSTS_PERMITIDOS)');
  return { tipo, host, porta: portaBruta, database, usuario, senha, confiarCertificado, tls };
}

/** SQLite: aceita ":memory:" ou um caminho; com BANCO_SQLITE_DIR, só arquivos dentro dele. */
export function validarCaminhoSqlite(caminho: string): string {
  if (caminho === ':memory:') return caminho;
  if (/^[a-z]+:/i.test(caminho) && !/^[A-Za-z]:[\\/]/.test(caminho)) throw new BadRequestException('caminho SQLite inválido');
  const dir = process.env.BANCO_SQLITE_DIR;
  if (!dir) return caminho;
  const base = resolve(dir);
  const alvo = resolve(base, caminho);
  const rel = relative(base, alvo);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new BadRequestException('arquivo SQLite fora do diretório permitido (BANCO_SQLITE_DIR)');
  return alvo;
}

/** Parâmetros de comando SQL: só strings (sem objetos/arrays que alterariam a semântica do driver). */
export function validarParamsSql(v: unknown): string[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new BadRequestException('params deve ser uma lista de textos');
  if (v.length > 1000) throw new BadRequestException('parâmetros demais');
  for (const p of v) if (typeof p !== 'string') throw new BadRequestException('params aceita apenas textos');
  return v as string[];
}

/** Remove a senha (e a connection string) de mensagens de erro de driver antes de devolver ao cliente. */
export function mensagemSegura(e: unknown, segredos: string[] = []): string {
  let m = e instanceof Error ? e.message : String(e);
  for (const s of segredos) if (s && s.length >= 3) m = m.split(s).join('***');
  m = m.replace(/(mongodb(?:\+srv)?:\/\/)[^@/\s]+@/gi, '$1***@');
  return m.length > 600 ? m.slice(0, 600) + '...' : m;
}

/** Limita o texto de uma célula devolvida ao cliente. */
export function celula(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return `<binário ${v.length} bytes>`;
  if (typeof v === 'object') {
    let s: string;
    try { s = JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)); } catch { s = String(v); }
    return s.length > LIMITES.maxCelulaChars ? s.slice(0, LIMITES.maxCelulaChars) + '...' : s;
  }
  if (typeof v === 'string' && v.length > LIMITES.maxCelulaChars) return v.slice(0, LIMITES.maxCelulaChars) + '...';
  return v;
}
