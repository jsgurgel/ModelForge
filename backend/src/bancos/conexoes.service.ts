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
 * Conexões salvas (SQL e NoSQL): arquivo JSON no diretório de dados (como DiagramasService).
 *
 * Senhas e connection strings com credenciais são cifradas com AES-256-GCM. A chave vem de CONEXOES_KEY
 * (64 caracteres hexadecimais, ou uma frase qualquer, derivada com scrypt); sem a variável, uma chave aleatória
 * é gerada uma vez em `conexoes.key` (modo 0600) ao lado do arquivo. Quem lê o disco do servidor com a chave
 * lê as senhas: é conveniência, não cofre. Depois de salvas, NUNCA voltam ao cliente (só `temSenha`).
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from 'crypto';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { tirarCredenciais, temCredenciais, validarNomeBanco, validarUriMongo } from './nosql';
import { validarParams } from './seguranca';
import { ParamsConexao, TIPOS_BANCO } from './tipos';

interface RegistroSql {
  id: string;
  kind: 'sql';
  nome: string;
  tipo: string;
  host: string;
  porta: number;
  database: string;
  schema: string;
  usuario: string;
  salvarSenha: boolean;
  senhaCifrada: string;
  confiarCertificado: boolean;
  tls: boolean;
}

interface RegistroNoSql {
  id: string;
  kind: 'nosql';
  nome: string;
  tipo: 'mongodb';
  /** Sempre sem credenciais quando `salvarCredenciais` é falso. */
  uri: string;
  uriCifrada: string;
  database: string;
  salvarCredenciais: boolean;
  amostra: number;
}

type Registro = RegistroSql | RegistroNoSql;

export function cifrar(chave: Buffer, texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave, iv);
  const ct = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

export function decifrar(chave: Buffer, valor: string): string {
  const [v, iv, tag, ct] = valor.split(':');
  if (v !== 'v1' || !iv || !tag || ct == null) throw new Error('segredo em formato desconhecido');
  const d = createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}

export function derivarChave(env: string): Buffer {
  return /^[0-9a-fA-F]{64}$/.test(env) ? Buffer.from(env, 'hex') : scryptSync(env, 'modelforge-conexoes-v1', 32);
}

const texto = (v: unknown, campo: string, max = 200): string => {
  if (v == null) return '';
  if (typeof v !== 'string' || v.length > max) throw new BadRequestException(`${campo} inválido`);
  return v.trim();
};

@Injectable()
export class ConexoesService {
  private readonly dirDados = dirname(process.env.DIAGRAMAS_FILE ?? join(process.cwd(), 'data', 'diagramas.json'));
  private readonly arquivo = process.env.CONEXOES_FILE ?? join(this.dirDados, 'conexoes.json');
  private fila: Promise<unknown> = Promise.resolve();
  private chaveCache?: Buffer;

  private async chave(): Promise<Buffer> {
    if (this.chaveCache) return this.chaveCache;
    if (process.env.CONEXOES_KEY) return (this.chaveCache = derivarChave(process.env.CONEXOES_KEY));
    const arq = process.env.CONEXOES_KEY_FILE ?? join(this.dirDados, 'conexoes.key');
    try {
      this.chaveCache = Buffer.from((await fs.readFile(arq, 'utf8')).trim(), 'hex');
    } catch {
      await fs.mkdir(dirname(arq), { recursive: true });
      const nova = randomBytes(32);
      try {
        await fs.writeFile(arq, nova.toString('hex'), { mode: 0o600, flag: 'wx' });
        this.chaveCache = nova;
      } catch {
        //# Outra requisição criou a chave entre a leitura e a escrita.
        this.chaveCache = Buffer.from((await fs.readFile(arq, 'utf8')).trim(), 'hex');
      }
    }
    if (this.chaveCache.length !== 32) throw new Error('chave de conexões inválida (esperado 32 bytes)');
    return this.chaveCache;
  }

  /** Visão pública: nada de senha nem de URI com credenciais. */
  private publico(r: Registro) {
    if (r.kind === 'sql') {
      const { senhaCifrada, ...resto } = r;
      return { ...resto, temSenha: !!senhaCifrada };
    }
    const { uriCifrada, ...resto } = r;
    return { ...resto, temCredenciais: !!uriCifrada };
  }

  async listar() {
    return (await this.ler()).map((r) => this.publico(r));
  }

  /** Salva (cria ou, com o mesmo nome, sobrescreve). Sem `senha` numa edição, mantém a senha antiga se `salvarSenha`. */
  async salvarSql(corpo: Record<string, unknown>) {
    const nome = texto(corpo.nome, 'nome', 100);
    if (!nome) throw new BadRequestException('Informe um nome pra conexão.');
    const p = validarParams({ ...corpo, senha: typeof corpo.senha === 'string' ? corpo.senha : '' });
    const schema = texto(corpo.schema, 'schema');
    const salvarSenha = corpo.salvarSenha === true;
    const chave = await this.chave();
    return this.serializar(async () => {
      const todos = await this.ler();
      const ex = todos.find((r): r is RegistroSql => r.kind === 'sql' && r.nome.toLowerCase() === nome.toLowerCase());
      let senhaCifrada = '';
      if (salvarSenha) senhaCifrada = p.senha ? cifrar(chave, p.senha) : ex?.senhaCifrada ?? '';
      const novo: RegistroSql = {
        id: ex?.id ?? randomUUID(), kind: 'sql', nome, tipo: p.tipo, host: p.host, porta: p.porta, database: p.database, schema,
        usuario: p.usuario, salvarSenha, senhaCifrada, confiarCertificado: p.confiarCertificado, tls: p.tls,
      };
      if (ex) todos[todos.indexOf(ex)] = novo; else todos.push(novo);
      await this.gravar(todos);
      return this.publico(novo);
    });
  }

  async salvarNoSql(corpo: Record<string, unknown>) {
    const nome = texto(corpo.nome, 'nome', 100);
    if (!nome) throw new BadRequestException('Informe um nome pra conexão.');
    const uri = validarUriMongo(corpo.uri ?? corpo.connectionString);
    const database = validarNomeBanco(corpo.database);
    const salvarCredenciais = corpo.salvarCredenciais === true;
    const amostra = Math.min(Math.max(1, Number(corpo.amostra) || 50), 1000);
    const chave = await this.chave();
    return this.serializar(async () => {
      const todos = await this.ler();
      const ex = todos.find((r): r is RegistroNoSql => r.kind === 'nosql' && r.nome.toLowerCase() === nome.toLowerCase());
      const novo: RegistroNoSql = {
        id: ex?.id ?? randomUUID(), kind: 'nosql', nome, tipo: 'mongodb', uri: tirarCredenciais(uri),
        uriCifrada: salvarCredenciais && temCredenciais(uri) ? cifrar(chave, uri) : '', database, salvarCredenciais, amostra,
      };
      if (ex) todos[todos.indexOf(ex)] = novo; else todos.push(novo);
      await this.gravar(todos);
      return this.publico(novo);
    });
  }

  async remover(id: string): Promise<void> {
    await this.serializar(async () => {
      const todos = await this.ler();
      const resto = todos.filter((r) => r.id !== id);
      if (resto.length === todos.length) throw new NotFoundException('conexão não encontrada');
      await this.gravar(resto);
    });
  }

  /**
   * Resolve o corpo de uma requisição em parâmetros de conexão SQL. Com `id`, os dados de rede vêm SEMPRE do que foi
   * salvo (o cliente só pode acrescentar a senha): impede mandar a senha guardada para outro host.
   */
  async resolverSql(bruto: unknown): Promise<{ params: ParamsConexao; schema: string }> {
    const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
    if (typeof b.id !== 'string' || !b.id) return { params: validarParams(b), schema: texto(b.schema, 'schema') };
    const r = (await this.ler()).find((x) => x.id === b.id);
    if (!r || r.kind !== 'sql') throw new NotFoundException('conexão salva não encontrada');
    const chave = await this.chave();
    const digitada = typeof b.senha === 'string' ? b.senha : '';
    let senha = digitada;
    if (!senha && r.senhaCifrada) {
      try { senha = decifrar(chave, r.senhaCifrada); } catch { throw new BadRequestException('não foi possível ler a senha salva (a chave mudou?): informe a senha de novo'); }
    }
    const params = validarParams({ ...r, senha });
    return { params, schema: b.schema === undefined ? r.schema : texto(b.schema, 'schema') };
  }

  /** Resolve uma conexão NoSQL: connection string + database (+ amostra). */
  async resolverNoSql(bruto: unknown): Promise<{ uri: string; database: string; amostra: number }> {
    const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
    if (typeof b.id !== 'string' || !b.id) {
      return { uri: validarUriMongo(b.uri ?? b.connectionString), database: validarNomeBanco(b.database), amostra: Number(b.amostra) || 50 };
    }
    const r = (await this.ler()).find((x) => x.id === b.id);
    if (!r || r.kind !== 'nosql') throw new NotFoundException('conexão salva não encontrada');
    let uri = r.uri;
    if (r.uriCifrada) {
      try { uri = decifrar(await this.chave(), r.uriCifrada); } catch { throw new BadRequestException('não foi possível ler as credenciais salvas: informe a string de conexão de novo'); }
    } else if (typeof b.uri === 'string' && b.uri) {
      //# Sem credenciais salvas o usuário digita a string completa; o host tem de ser o mesmo da conexão salva.
      const nova = validarUriMongo(b.uri);
      if (tirarCredenciais(nova) !== r.uri) throw new BadRequestException('a string de conexão não confere com a conexão salva');
      uri = nova;
    }
    return { uri: validarUriMongo(uri), database: r.database, amostra: r.amostra };
  }

  /** Escritas em fila: duas requisições simultâneas não se sobrescrevem. */
  private serializar<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.fila.then(fn, fn);
    this.fila = p.catch(() => undefined);
    return p;
  }

  private async ler(): Promise<Registro[]> {
    try {
      const dados = JSON.parse(await fs.readFile(this.arquivo, 'utf8'));
      return Array.isArray(dados) ? dados : [];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  private async gravar(todos: Registro[]): Promise<void> {
    await fs.mkdir(dirname(this.arquivo), { recursive: true });
    const tmp = this.arquivo + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(todos, null, 2), { mode: 0o600 });
    await fs.rename(tmp, this.arquivo);
  }
}

