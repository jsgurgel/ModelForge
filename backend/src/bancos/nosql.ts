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
 * NoSQL (MongoDB): inferência de campos por amostragem, script mongosh de criação
 * e conexão. Os tipos de campo são os do front (frontend/src/editor/types.ts).
 */
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Diagrama, Forma } from '../modelo/tipos';
import { LIMITES, hostPermitido } from './seguranca';

export type TipoCampoNoSql = 'string' | 'number' | 'boolean' | 'date' | 'objectid' | 'array' | 'embedded' | 'array_embedded' | 'reference';

export interface CampoNoSql {
  nome: string;
  tipo: TipoCampoNoSql;
  colecaoReferenciada?: string;
  subCampos?: CampoNoSql[];
}

export interface InfoColecaoNoSql {
  nome: string;
  campos: CampoNoSql[];
}

// ---- Script mongosh -------------------------------------------------------------------------

const ref = (c: CampoNoSql) => (c.colecaoReferenciada ? c.colecaoReferenciada : '?');

function construirTipo(c: CampoNoSql, ind: string): string {
  switch (c.tipo) {
    case 'string': return '{ bsonType: "string" }';
    case 'number': return '{ bsonType: "number" }';
    case 'boolean': return '{ bsonType: "bool" }';
    case 'date': return '{ bsonType: "date" }';
    case 'objectid':
    case 'reference': return '{ bsonType: "objectId" }';
    case 'array': return '{ bsonType: "array" }';
    case 'embedded':
      return '{\n' + ind + '  bsonType: "object",\n' + ind + '  properties: {\n' + construirPropriedades(c.subCampos ?? [], ind + '    ') + ind + '  }\n' + ind + '}';
    case 'array_embedded':
      return '{\n' + ind + '  bsonType: "array",\n' + ind + '  items: {\n' + ind + '    bsonType: "object",\n' + ind + '    properties: {\n' +
        construirPropriedades(c.subCampos ?? [], ind + '      ') + ind + '    }\n' + ind + '  }\n' + ind + '}';
    default: return '{ bsonType: "string" }';
  }
}

function construirPropriedades(campos: CampoNoSql[], ind: string): string {
  let sb = '';
  campos.forEach((c, i) => {
    sb += ind + '"' + c.nome + '": ' + construirTipo(c, ind);
    if (i < campos.length - 1) sb += ',';
    if (c.tipo === 'reference') sb += '  // referência -> ' + ref(c);
    sb += '\n';
  });
  return sb;
}

/** Validador $jsonSchema por coleção + índice nas referências de topo. */
export function gerarScriptMongosh(d: Diagrama): string {
  const nome = d.nome === '' || d.nome == null ? '<<NoSQL>>' : d.nome;
  let sb = '// Script de criação (MongoDB) gerado pelo ModelForge a partir do modelo "' + nome + '".\n' +
    '// Os tipos vêm do que foi modelado - confira antes de rodar contra um banco real.\n\n';
  for (const f of (d.formas ?? []).filter((x) => x.kind === 'colecao')) {
    const campos = ((f.props?.campos as CampoNoSql[] | undefined) ?? []);
    sb += 'db.createCollection("' + f.texto + '", {\n';
    sb += '  validator: {\n    $jsonSchema: {\n      bsonType: "object",\n      properties: {\n';
    sb += construirPropriedades(campos, '        ');
    sb += '      }\n    }\n  }\n});\n';
    for (const c of campos) {
      if (c.tipo === 'reference') sb += 'db.' + f.texto + '.createIndex({ "' + c.nome + '": 1 }); // referência -> ' + ref(c) + '\n';
    }
    sb += '\n';
  }
  return sb;
}

// ---- Inferência de campos ---------------------------------------------------------------------

type Doc = Record<string, unknown>;
const bson = (v: unknown): string | undefined => (v && typeof v === 'object' ? (v as { _bsontype?: string })._bsontype : undefined);
const ehDoc = (v: unknown): v is Doc => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && bson(v) === undefined && !Buffer.isBuffer(v);
const ehDbRefLiteral = (d: Doc) => '$ref' in d && '$id' in d;
/** O driver decodifica {$ref,$id} para DBRef (classe com `collection` e `oid`). */
const ehDbRef = (v: unknown): v is { collection: string } =>
  !!v && typeof v === 'object' && (bson(v) === 'DBRef' || (v.constructor?.name === 'DBRef' && 'collection' in (v as object)));

/**
 * Mescla os campos de todos os documentos da amostra: cada nome entra na ordem da primeira aparição e o TIPO vem do
 * primeiro valor não nulo daquele campo. Documentos embutidos (objeto ou dentro de array) são recolhidos de TODA a
 * amostra antes de recursar.
 */
export function inferirCampos(amostra: Doc[]): CampoNoSql[] {
  const representante = new Map<string, unknown>();
  const subDocs = new Map<string, Doc[]>();
  const subDocsArray = new Map<string, Doc[]>();
  const push = (m: Map<string, Doc[]>, k: string, d: Doc) => { if (!m.has(k)) m.set(k, []); m.get(k)!.push(d); };
  for (const doc of amostra) {
    for (const chave of Object.keys(doc)) {
      const valor = doc[chave];
      if (valor == null) continue;
      if (!representante.has(chave)) representante.set(chave, valor);
      if (ehDoc(valor) && !ehDbRefLiteral(valor)) push(subDocs, chave, valor);
      else if (Array.isArray(valor)) for (const item of valor) if (ehDoc(item)) push(subDocsArray, chave, item);
    }
  }
  const res: CampoNoSql[] = [];
  for (const [nome, valor] of representante) {
    if (ehDbRef(valor)) res.push({ nome, tipo: 'reference', colecaoReferenciada: String(valor.collection) });
    else if (ehDoc(valor) && ehDbRefLiteral(valor)) res.push({ nome, tipo: 'reference', colecaoReferenciada: String(valor.$ref) });
    else if (ehDoc(valor)) res.push({ nome, tipo: 'embedded', subCampos: inferirCampos(subDocs.get(nome) ?? []) });
    else if (Array.isArray(valor)) {
      const el = subDocsArray.get(nome);
      res.push(el && el.length ? { nome, tipo: 'array_embedded', subCampos: inferirCampos(el) } : { nome, tipo: 'array' });
    } else if (bson(valor) === 'ObjectId' || bson(valor) === 'ObjectID') res.push({ nome, tipo: 'objectid' });
    else if (typeof valor === 'boolean') res.push({ nome, tipo: 'boolean' });
    else if (valor instanceof Date) res.push({ nome, tipo: 'date' });
    else if (typeof valor === 'number' || typeof valor === 'bigint' || ['Int32', 'Long', 'Double', 'Decimal128'].includes(bson(valor) ?? '')) res.push({ nome, tipo: 'number' });
    else res.push({ nome, tipo: 'string' });
  }
  return res;
}

/** ImportarDoBancoNoSql: uma Coleção por coleção, em grade a partir de (40,40), 240x200 de passo, até 6 por linha. */
export function colecoesParaFormas(colecoes: InfoColecaoNoSql[]): Forma[] {
  const total = colecoes.length;
  const maxPorLinha = Math.min(Math.max(2, Math.ceil(Math.sqrt(total))), 6);
  let coluna = 0;
  let linha = 0;
  return colecoes.map((c) => {
    const f: Forma = { id: randomUUID(), kind: 'colecao', x: 40 + coluna * 240, y: 40 + linha * 200, w: 200, h: 100, texto: c.nome, props: { campos: c.campos } };
    if (++coluna >= maxPorLinha) { coluna = 0; linha++; }
    return f;
  });
}

// ---- Conexão -----------------------------------------------------------------------------------

const CREDENCIAIS = /:\/\/[^@/]+@/;

/** Tira "usuario:senha@" da connection string (para guardar/mostrar sem credenciais). */
export function tirarCredenciais(uri: string): string {
  return uri.replace(CREDENCIAIS, '://');
}

export function temCredenciais(uri: string): boolean {
  return CREDENCIAIS.test(uri);
}

/** Valida o esquema e cada host da connection string contra BANCO_HOSTS_PERMITIDOS. */
export function validarUriMongo(uri: unknown): string {
  if (typeof uri !== 'string' || !uri.trim()) throw new BadRequestException('Preencha a string de conexão e o database.');
  const u = uri.trim();
  if (u.length > 2048 || /\s/.test(u)) throw new BadRequestException('string de conexão inválida');
  const m = /^(mongodb(?:\+srv)?):\/\/(?:[^@/]*@)?([^/?]+)/i.exec(u);
  if (!m) throw new BadRequestException('a string de conexão deve começar com mongodb:// ou mongodb+srv://');
  for (const h of m[2].split(',')) {
    const host = h.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    if (!host) throw new BadRequestException('string de conexão sem host');
    if (!hostPermitido(host)) throw new BadRequestException('host não permitido pela configuração do servidor (BANCO_HOSTS_PERMITIDOS)');
  }
  return u;
}

export function validarNomeBanco(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) throw new BadRequestException('Preencha a string de conexão e o database.');
  if (v.length > 64 || /[\/\\. "$*<>:|?\0]/.test(v)) throw new BadRequestException('nome de database inválido');
  return v.trim();
}

export async function comCliente<T>(uri: string, fn: (cli: any) => Promise<T>): Promise<T> {
  const { MongoClient } = require('mongodb');
  const cli = new MongoClient(uri, {
    serverSelectionTimeoutMS: LIMITES.timeoutConexaoMs, connectTimeoutMS: LIMITES.timeoutConexaoMs,
    socketTimeoutMS: LIMITES.timeoutConsultaMs, maxPoolSize: 1, appName: 'modelforge',
  });
  try {
    return await fn(cli);
  } finally {
    await cli.close().catch(() => undefined);
  }
}

export function listarColecoes(uri: string, database: string): Promise<string[]> {
  return comCliente(uri, async (cli) => {
    const nomes: string[] = (await cli.db(database).listCollections({}, { nameOnly: true }).toArray()).map((c: { name: string }) => c.name);
    return nomes.sort();
  });
}

/** Amostra até `amostra` documentos por coleção (limitado) e infere os campos. `so` restringe a coleções escolhidas. */
export function introspeccionarNoSql(uri: string, database: string, amostra: number, so?: string[]): Promise<InfoColecaoNoSql[]> {
  const n = Math.min(Math.max(1, Math.floor(amostra) || 50), LIMITES.maxAmostraNoSql);
  return comCliente(uri, async (cli) => {
    const db = cli.db(database);
    let nomes: string[] = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c: { name: string }) => c.name);
    nomes = nomes.filter((x) => !x.startsWith('system.')).sort();
    if (so) nomes = nomes.filter((x) => so.includes(x));
    const res: InfoColecaoNoSql[] = [];
    for (const nome of nomes) {
      const docs = await db.collection(nome).find({}).limit(n).toArray();
      res.push({ nome, campos: inferirCampos(docs) });
    }
    return res;
  });
}
