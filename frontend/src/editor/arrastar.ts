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
import { abrirArquivo, ehArquivoAbrivel } from './arquivo';
import { abrirDiagrama, setMensagem } from './store';

/**
 * Arrastar arquivos para a janela abre os diagramas (.mfd.json, pacote .mfp.json ou .json).
 * Instalado ao importar o módulo (App.tsx só faz `import './editor/arrastar'`).
 */
const temArquivos = (e: DragEvent): boolean => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

export async function abrirArquivosSoltos(arquivos: File[]): Promise<number> {
  const abriveis = arquivos.filter((f) => ehArquivoAbrivel(f.name));
  const ignorados = arquivos.filter((f) => !ehArquivoAbrivel(f.name));
  let total = 0;
  for (const f of abriveis) {
    try {
      const docs = await abrirArquivo(f);
      docs.forEach(abrirDiagrama);
      total += docs.length;
    } catch (e) {
      aviso('Abrir arquivo', `"${f.name}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (total) setMensagem(`${total} diagrama(s) aberto(s)`);
  else if (ignorados.length && !abriveis.length) setMensagem(`"${ignorados[0].name}" não é um arquivo do ModelForge (.mfd.json, .mfp.json ou .json)`);
  return total;
}

declare global { interface Window { __mfArrastarInstalado?: boolean } }

if (typeof window !== 'undefined' && !window.__mfArrastarInstalado) {
  window.__mfArrastarInstalado = true;
  window.addEventListener('dragover', (e) => {
    //# Sem preventDefault o navegador não aceita o "soltar" (e abriria o arquivo na aba).
    if (temArquivos(e)) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    if (e.defaultPrevented || !temArquivos(e)) return;
    e.preventDefault();
    void abrirArquivosSoltos(Array.from(e.dataTransfer!.files));
  });
}
