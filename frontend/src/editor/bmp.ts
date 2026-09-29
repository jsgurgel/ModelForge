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

/** Codificador BMP (24 bits, sem compressão): o canvas do navegador não gera BMP. Alfa é composto sobre branco. */
export function codificarBmp(largura: number, altura: number, rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const linha = Math.ceil((largura * 3) / 4) * 4;
  const dados = linha * altura;
  const out = new Uint8Array(54 + dados);
  const dv = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4d;
  dv.setUint32(2, out.length, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, largura, true);
  dv.setInt32(22, altura, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, dados, true);
  dv.setInt32(38, 2835, true);
  dv.setInt32(42, 2835, true);
  for (let y = 0; y < altura; y++) {
    //# BMP guarda as linhas de baixo para cima e em ordem BGR.
    let o = 54 + (altura - 1 - y) * linha;
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 4;
      const a = rgba[i + 3] / 255;
      out[o++] = Math.round(rgba[i + 2] * a + 255 * (1 - a));
      out[o++] = Math.round(rgba[i + 1] * a + 255 * (1 - a));
      out[o++] = Math.round(rgba[i] * a + 255 * (1 - a));
    }
  }
  return out;
}
