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
 * Armazém chave/valor em IndexedDB (aceita objetos estruturados, como FileSystemFileHandle). Sem IndexedDB (testes, navegação
 * privada em alguns navegadores) cai numa memória da sessão, para o resto do código não precisar tratar a ausência.
 */
const BANCO = 'modelforge';
const LOJA = 'arquivos';
const memoria = new Map<string, unknown>();
let abertura: Promise<IDBDatabase | null> | null = null;

function abrir(): Promise<IDBDatabase | null> {
  if (abertura) return abertura;
  abertura = new Promise((ok) => {
    try {
      if (typeof indexedDB === 'undefined') return ok(null);
      const r = indexedDB.open(BANCO, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(LOJA); };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
      r.onblocked = () => ok(null);
    } catch { ok(null); }
  });
  return abertura;
}

function pedido<T>(fn: (loja: IDBObjectStore) => IDBRequest<T>, modo: IDBTransactionMode): Promise<T | undefined> {
  return abrir().then((db) => new Promise<T | undefined>((ok) => {
    if (!db) return ok(undefined);
    try {
      const r = fn(db.transaction(LOJA, modo).objectStore(LOJA));
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(undefined);
    } catch { ok(undefined); }
  }));
}

export async function guardar(chave: string, valor: unknown): Promise<void> {
  memoria.set(chave, valor);
  await pedido((l) => l.put(valor, chave), 'readwrite');
}

export async function obter<T = unknown>(chave: string): Promise<T | undefined> {
  if (memoria.has(chave)) return memoria.get(chave) as T;
  const v = await pedido((l) => l.get(chave), 'readonly');
  if (v !== undefined) memoria.set(chave, v);
  return v as T | undefined;
}

export async function remover(chave: string): Promise<void> {
  memoria.delete(chave);
  await pedido((l) => l.delete(chave), 'readwrite');
}
