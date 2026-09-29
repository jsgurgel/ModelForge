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
import { ATALHOS_DIAGRAMA, atalhoDe, chave, chaveEvento, comandoParaTecla, mapaGlobal } from './atalhos';

const ev = (o: Partial<KeyboardEvent>) => ({ ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, key: '', code: '', ...o });

describe('atalhos', () => {
  it('normaliza chaves e usa a tecla física com Alt', () => {
    expect(chave('Ctrl+Shift+M')).toBe('ctrl+shift+m');
    expect(chaveEvento(ev({ ctrlKey: true, shiftKey: true, key: 'M' }))).toBe('ctrl+shift+m');
    expect(chaveEvento(ev({ altKey: true, key: 'å', code: 'KeyA' }))).toBe('alt+a');
    expect(chaveEvento(ev({ altKey: true, key: '¡', code: 'Digit1' }))).toBe('alt+1');
  });

  it('zoom: "+" (com ou sem Shift) e "=" são a mesma tecla física', () => {
    expect(chaveEvento(ev({ ctrlKey: true, key: '=' }))).toBe('ctrl+=');
    expect(chaveEvento(ev({ ctrlKey: true, shiftKey: true, key: '+' }))).toBe('ctrl+=');
    expect(chaveEvento(ev({ ctrlKey: true, key: '+' }))).toBe('ctrl+=');
    expect(chaveEvento(ev({ ctrlKey: true, key: '-' }))).toBe('ctrl+-');
  });

  it('Ctrl+O e Ctrl+E funcionam (próximo/anterior) e organizar é por diagrama', () => {
    const g = mapaGlobal();
    expect(comandoParaTecla('ctrl+o', 'conceitual', g)).toBe('editar.proximo');
    expect(comandoParaTecla('ctrl+e', 'conceitual', g)).toBe('editar.anterior');
    expect(comandoParaTecla('ctrl+o', 'logico', g)).toBe('diagrama.organizar');
    expect(comandoParaTecla('ctrl+shift+o', 'conceitual', g)).toBe('diagrama.organizar');
    expect(comandoParaTecla('ctrl+shift+o', 'fluxo', g)).toBeUndefined();
  });

  it('Ctrl+A seleciona tudo; Abrir e Fechar têm teclas próprias; formato em Ctrl+M/Ctrl+F', () => {
    const g = mapaGlobal();
    expect(g.get('ctrl+a')).toBe('editar.selecionarTudo');
    expect(g.get('alt+a')).toBe('arquivo.abrir');
    expect(g.get('alt+f')).toBe('arquivo.fechar');
    expect(g.get('ctrl+m')).toBe('editar.copiarFormato');
    expect(g.get('ctrl+f')).toBe('editar.colarFormato');
    expect(g.get('ctrl+w')).toBe('editar.realcar');
    expect(g.get('f1')).toBe('ajuda.ajuda');
    expect(g.get('ctrl+1')).toBe('zoom.reset'); // Ctrl+1 = zoom 100%
    expect(g.get('ctrl+=')).toBe('zoom.mais'); // Ctrl+ "+" aumenta o zoom
    expect(g.get('ctrl+-')).toBe('zoom.menos'); // Ctrl+ "-" diminui o zoom
  });

  it('não há teclas duplicadas entre comandos globais', () => {
    const vistos = new Map<string, string>();
    const dup: string[] = [];
    // reconstrói contagem a partir dos comandos registrados
    return import('./comandos').then(({ COMANDOS }) => {
      for (const [id, c] of Object.entries(COMANDOS)) {
        if (!c.atalho || c.soExibir) continue;
        const k = chave(c.atalho);
        if (vistos.has(k)) dup.push(`${k}: ${vistos.get(k)} / ${id}`);
        else vistos.set(k, id);
      }
      expect(dup).toEqual([]);
    });
  });

  it('rótulo do atalho respeita o tipo do diagrama', () => {
    expect(atalhoDe('diagrama.organizar', 'logico')).toBe('Ctrl+O');
    expect(atalhoDe('editar.proximo', 'logico')).toBeUndefined();
    expect(atalhoDe('editar.proximo', 'conceitual')).toBe('Ctrl+O');
    expect(Object.keys(ATALHOS_DIAGRAMA)).toContain('conceitual');
  });
});
