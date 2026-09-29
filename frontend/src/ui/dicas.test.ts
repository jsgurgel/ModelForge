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

import { describe, expect, it } from 'vitest';
import { dicaPorChave, dicaPorRotulo, prefixosDoGrupo, rotuloDaChave, todasAsDicas } from './dicas';

describe('dicas do Inspector', () => {
  it('extrai as dicas com acentos decodificados', () => {
    expect(Object.keys(todasAsDicas()).length).toBeGreaterThan(250);
    expect(dicaPorChave('diagrama.gradiente.is')).toBe('Usar pintura em gradiente');
    expect(dicaPorChave('cfg.mostrarids')).toContain('ID');
    expect(dicaPorChave('diagrama.detalhe.roundrect')).toContain('Zero');
    expect(Object.values(todasAsDicas()).some((v) => v.includes('\\u'))).toBe(false);
  });
  it('resolve pelo rótulo e desempata por prefixo', () => {
    expect(dicaPorRotulo('Usar pintura em gradiente')).toBe('');
    expect(dicaPorRotulo('Pintar quadro')).toContain('bordas');
    expect(dicaPorRotulo('Nome', ['gatilho.'])).toContain('gatilho');
    expect(dicaPorRotulo('Nome', prefixosDoGrupo('Índice selecionado'))).toContain('ndice');
    expect(dicaPorRotulo('Rótulo inexistente')).toBe('');
  });
  it('rótulo por chave', () => {
    expect(rotuloDaChave('basedrawer.metricaleft')).toBe('Régua à esquerda');
  });
});
