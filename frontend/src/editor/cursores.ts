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
 * Cursor por ferramenta: triângulo cinza/preto no canto e o ícone do comando ao lado, ponto quente em (1,1).
 * Gera um PNG num canvas e devolve o valor CSS de `cursor`; se algo falhar, cai no cursor de mira.
 */
const cache = new Map<string, Promise<string>>();

export const CURSOR_PADRAO = 'crosshair';

export function cursorDaFerramenta(icone: string): Promise<string> {
  let p = cache.get(icone);
  if (!p) {
    p = new Promise<string>((ok) => {
      if (typeof document === 'undefined' || typeof Image === 'undefined') { ok(CURSOR_PADRAO); return; }
      const img = new Image();
      img.onload = () => {
        try {
          const cv = document.createElement('canvas');
          cv.width = 32;
          cv.height = 32;
          const g = cv.getContext('2d');
          if (!g) { ok(CURSOR_PADRAO); return; }
          g.fillStyle = '#808080';
          g.beginPath(); g.moveTo(0, 0); g.lineTo(10, 0); g.lineTo(0, 10); g.closePath(); g.fill();
          g.fillStyle = '#000000';
          g.beginPath(); g.moveTo(2, 2); g.lineTo(8, 2); g.lineTo(2, 8); g.closePath(); g.fill();
          g.drawImage(img, 9, 9, 18, 18);
          ok(`url("${cv.toDataURL('image/png')}") 1 1, ${CURSOR_PADRAO}`);
        } catch { ok(CURSOR_PADRAO); }
      };
      img.onerror = () => ok(CURSOR_PADRAO);
      img.src = `/icons/${icone}`;
    });
    cache.set(icone, p);
  }
  return p;
}
