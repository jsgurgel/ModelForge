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

import { api } from '../api';
import { abrirDialogo, aviso } from '../ui/dialogos';
import { baixar } from './exportar';
import { guardar, obter } from './armazem';
import { EXTENSAO } from './arquivo';
import { registrarRecente } from './recentes';
import { marcarSalvo, obterEstado, setMensagem } from './store';
import { Diagrama, novoId } from './types';

/**
 * Salvar de verdade: "Salvar" grava no MESMO arquivo/servidor de onde o diagrama veio;
 * "Salvar como" escolhe outro. Com a File System Access API (Chrome/Edge) o arquivo é regravado no lugar; sem ela, baixa.
 */

/** Diagrama com a chave do arquivo local (o handle mora no IndexedDB, ver `armazem.ts`); a chave viaja no JSON como texto inofensivo. */
export type DiagramaComArquivo = Diagrama & { chaveArquivo?: string };

/** "<nome>: o arquivo já existe. Deseja sobrescrevê-lo?" */
export const msgSobrescrever = (nome: string): string => `${nome}: o arquivo já existe. Deseja sobrescrevê-lo?`;

interface HandleGravavel {
  name: string;
  createWritable(): Promise<{ write(d: BlobPart): Promise<void>; close(): Promise<void> }>;
  queryPermission?(o: { mode: string }): Promise<string>;
  requestPermission?(o: { mode: string }): Promise<string>;
  getFile?(): Promise<File>;
}
type Janela = typeof window & {
  showSaveFilePicker?: (o: unknown) => Promise<HandleGravavel>;
  showOpenFilePicker?: (o: unknown) => Promise<HandleGravavel[]>;
};

export const temSelecionadorDeArquivo = (): boolean => typeof window !== 'undefined' && typeof (window as Janela).showSaveFilePicker === 'function';

export const chaveDoHandle = (chave: string): string => `handle:${chave}`;

export const nomeSugerido = (doc: Diagrama, extensao = EXTENSAO): string => `${doc.nome.replace(/[\\/:*?"<>|]+/g, '_') || 'diagrama'}.${extensao}`;

export const conteudoDoDiagrama = (doc: Diagrama): string => JSON.stringify(doc, null, 2);

async function comPermissao(h: HandleGravavel): Promise<boolean> {
  try {
    if (!h.queryPermission) return true;
    if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    return (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted';
  } catch { return false; }
}

async function gravarNoHandle(h: HandleGravavel, conteudo: string): Promise<void> {
  const w = await h.createWritable();
  await w.write(conteudo);
  await w.close();
}

const cancelou = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

/** Pergunta (Sim/Não) e devolve a resposta; usa o slot de diálogo, então quem chama não pode ter outro diálogo aberto. */
export function perguntar(titulo: string, mensagem: string): Promise<boolean> {
  return new Promise((ok) => {
    abrirDialogo({ tipo: 'confirmar', titulo, mensagem, aoConfirmar: () => ok(true), aoRecusar: () => ok(false) });
  });
}

export interface ResultadoSalvar { ok: boolean; doc?: DiagramaComArquivo }

/** Grava o diagrama em arquivo local. `escolher` força o "Salvar como". Cancelar o seletor devolve `{ok:false}`. */
export async function salvarEmArquivo(doc: DiagramaComArquivo, escolher: boolean): Promise<ResultadoSalvar> {
  const conteudo = conteudoDoDiagrama(doc);
  if (!temSelecionadorDeArquivo()) {
    baixar(nomeSugerido(doc), conteudo, 'application/json');
    return { ok: true, doc };
  }
  let handle: HandleGravavel | undefined;
  let chave = doc.chaveArquivo;
  if (!escolher && chave) {
    const h = await obter<HandleGravavel>(chaveDoHandle(chave));
    if (h && (await comPermissao(h))) handle = h;
  }
  try {
    if (!handle) {
      handle = await (window as Janela).showSaveFilePicker!({
        suggestedName: nomeSugerido(doc), types: [{ description: 'Diagrama ModelForge', accept: { 'application/json': ['.json'] } }],
      });
      chave = novoId();
      await guardar(chaveDoHandle(chave), handle);
    }
    await gravarNoHandle(handle, conteudo);
  } catch (e) {
    if (cancelou(e)) return { ok: false };
    throw e;
  }
  return { ok: true, doc: { ...doc, chaveArquivo: chave, arquivo: handle.name } };
}

/** Salva o diagrama da aba `i` onde ele mora (servidor, se veio de lá; senão arquivo). Devolve false se cancelado/falhou. */
export async function salvarAba(i: number, opcoes: { escolher?: boolean; servidor?: boolean } = {}): Promise<boolean> {
  const aba = obterEstado().abas[i];
  if (!aba) return false;
  const doc = aba.doc as DiagramaComArquivo;
  try {
    if (opcoes.servidor || (!opcoes.escolher && doc.id && !doc.chaveArquivo)) {
      if (!doc.id) {
        const existentes = await api.listar().catch(() => []);
        if (existentes.some((x) => x.nome === doc.nome && !!x.id)) {
          if (!(await perguntar('Salvar no servidor', msgSobrescrever(doc.nome)))) return false;
        }
      }
      const salvo = await api.salvar(doc);
      marcarSalvo(i, { ...doc, id: salvo.id });
      setMensagem(`"${doc.nome}" salvo no servidor`);
      return true;
    }
    const r = await salvarEmArquivo(doc, !!opcoes.escolher);
    if (!r.ok || !r.doc) return false;
    marcarSalvo(i, r.doc);
    if (r.doc.chaveArquivo) registrarRecente(r.doc.nome, r.doc.id, r.doc.tipo);
    setMensagem(temSelecionadorDeArquivo() ? `"${r.doc.nome}" salvo em ${r.doc.arquivo}` : `"${r.doc.nome}" baixado (o navegador não permite regravar o arquivo)`);
    return true;
  } catch (e) {
    aviso('Salvar', e instanceof Error ? e.message : String(e));
    return false;
  }
}

/**
 * Salva um texto qualquer (SQL, DDL, CSV...) como o "Salvar como": com o seletor de arquivo do navegador (que já
 * pergunta se o arquivo existente deve ser sobrescrito); sem ele, baixa.
 */
export async function salvarTexto(nome: string, texto: string, mime = 'text/plain;charset=utf-8'): Promise<boolean> {
  if (!temSelecionadorDeArquivo()) { baixar(nome, texto, mime); return true; }
  try {
    const ext = /\.[^.]+$/.exec(nome)?.[0];
    const h = await (window as Janela).showSaveFilePicker!({ suggestedName: nome, types: ext ? [{ description: nome, accept: { [mime.split(';')[0]]: [ext] } }] : undefined });
    await gravarNoHandle(h, texto);
    return true;
  } catch (e) {
    if (cancelou(e)) return false;
    throw e;
  }
}
