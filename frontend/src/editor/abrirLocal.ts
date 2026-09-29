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

import { aviso } from '../ui/dialogos';
import { abrirArquivo, ACEITA_ABRIR, escolherArquivo } from './arquivo';
import { guardar, obter } from './armazem';
import { Recente, registrarRecente } from './recentes';
import { chaveDoHandle, DiagramaComArquivo } from './salvar';
import { abrirDiagrama, setMensagem } from './store';
import { Diagrama, novoId } from './types';

/**
 * Abrir arquivo local com memória para "Recentes": com a File System Access API guarda o handle (reabre com um clique, pedindo
 * permissão se preciso); sem ela guarda uma cópia do diagrama lido (reabre a cópia, avisando que é um instantâneo).
 */
interface HandleLeitura { name: string; getFile(): Promise<File>; queryPermission?(o: { mode: string }): Promise<string>; requestPermission?(o: { mode: string }): Promise<string> }
type J = typeof window & { showOpenFilePicker?: (o: unknown) => Promise<HandleLeitura[]> };

export const chaveSnapshot = (chave: string): string => `snap:${chave}`;

async function registrar(docs: Diagrama[], nomeArquivo: string, chave: string): Promise<DiagramaComArquivo[]> {
  const com = docs.map((d) => ({ ...d, arquivo: nomeArquivo, chaveArquivo: chave }));
  com.forEach((d, i) => { if (i === 0) registrarRecente(d.nome, d.id, d.tipo, chave); });
  return com;
}

export async function abrirDeArquivoLocal(): Promise<number> {
  const w = window as J;
  let file: File | null;
  const chave = novoId();
  if (typeof w.showOpenFilePicker === 'function') {
    try {
      const [h] = await w.showOpenFilePicker({ multiple: false, types: [{ description: 'Diagramas ModelForge', accept: { 'application/json': ['.json'] } }] });
      await guardar(chaveDoHandle(chave), h);
      file = await h.getFile();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 0;
      throw e;
    }
  } else file = await escolherArquivo(ACEITA_ABRIR);
  if (!file) return 0;
  const docs = await abrirArquivo(file);
  if (!docs.length) return 0;
  const com = await registrar(docs, file.name, chave);
  await guardar(chaveSnapshot(chave), docs);
  com.forEach(abrirDiagrama);
  return com.length;
}

export async function reabrirRecente(r: Recente): Promise<void> {
  try {
    if (r.chave) {
      const h = await obter<HandleLeitura>(chaveDoHandle(r.chave));
      if (h) {
        let ok = true;
        if (h.queryPermission && (await h.queryPermission({ mode: 'read' })) !== 'granted') ok = (await h.requestPermission?.({ mode: 'read' })) === 'granted';
        if (ok) {
          const docs = await abrirArquivo(await h.getFile());
          (await registrar(docs, h.name, r.chave)).forEach(abrirDiagrama);
          setMensagem(`"${r.nome}" reaberto`);
          return;
        }
      }
      const snap = await obter<Diagrama[]>(chaveSnapshot(r.chave));
      if (snap?.length) {
        snap.forEach((d) => abrirDiagrama({ ...d }));
        setMensagem(`"${r.nome}": aberta a cópia guardada (o arquivo original não está acessível)`);
        return;
      }
    }
    if (r.id) {
      const { api } = await import('../api');
      abrirDiagrama(await api.obter(r.id));
      return;
    }
    aviso('Recentes', `Não foi possível reabrir "${r.nome}". Use Arquivo > Abrir para escolher o arquivo de novo.`);
  } catch (e) {
    aviso('Recentes', `Não foi possível abrir "${r.nome}": ${e instanceof Error ? e.message : String(e)}`);
  }
}
