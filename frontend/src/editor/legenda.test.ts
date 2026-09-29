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
import { adicionarItem, alturaDaLegenda, artefatosDoDiagrama, capturarCores, coresDoDiagrama, itensDaLegenda, removerItem, tipoDaLegenda, trocarTipoLegenda } from './legenda';
import { adicionarForma, atualizarForma, novaForma } from './ops';
import { diagramaVazio } from './types';

describe('legenda', () => {
  const base = () => {
    let d = diagramaVazio('livre', 'L');
    const leg = novaForma(d, 'legenda', 100, 100);
    d = adicionarForma(d, leg);
    return { d, leg };
  };

  it('adiciona e remove itens e recalcula a altura', () => {
    const { leg } = base();
    const a = adicionarItem(adicionarItem(leg, 12), 12, 'B', '#ff0000');
    expect(itensDaLegenda(a)).toHaveLength(2);
    expect(a.h).toBe(alturaDaLegenda(2, 12, 'cores'));
    const r = removerItem(a, 0, 12);
    expect(itensDaLegenda(r).map((i) => i.texto)).toEqual(['B']);
    expect(r.h).toBeLessThan(a.h);
  });

  it('trocar o tipo limpa os itens; objetos têm linhas mais altas', () => {
    const { leg } = base();
    const a = adicionarItem(leg, 12);
    const t = trocarTipoLegenda(a, 'objetos', 12);
    expect(tipoDaLegenda(t)).toBe('objetos');
    expect(itensDaLegenda(t)).toHaveLength(0);
    expect(alturaDaLegenda(1, 12, 'objetos')).toBeGreaterThan(alturaDaLegenda(1, 12, 'cores'));
  });

  it('captura as cores do diagrama sem repetir as já listadas', () => {
    let { d, leg } = base();
    const e = novaForma(d, 'livreRetangulo', 300, 300);
    d = adicionarForma(d, e);
    d = atualizarForma(d, e.id, { cor: '#ff0000', corBorda: '#00ff00' });
    expect(coresDoDiagrama(d)).toEqual(['#ff0000', '#00ff00']);
    const cap = capturarCores(d, leg);
    expect(itensDaLegenda(cap).map((i) => i.cor)).toEqual(['#ff0000', '#00ff00']);
    const cap2 = capturarCores(d, cap);
    expect(itensDaLegenda(cap2)).toHaveLength(2);
    const linhas = trocarTipoLegenda(leg, 'linhas', 12);
    expect(capturarCores(d, linhas)).toBe(linhas);
  });

  it('lê legendas antigas (props.corpo)', () => {
    const { leg } = base();
    const antiga = { ...leg, props: { corpo: 'a\nb' } };
    expect(itensDaLegenda(antiga).map((i) => i.texto)).toEqual(['a', 'b']);
  });

  it('lista os artefatos da paleta do diagrama', () => {
    const d = diagramaVazio('fluxo', 'F');
    const k = artefatosDoDiagrama(d).map((a) => a.kind);
    expect(k).toContain('fluxProcesso');
    expect(k).not.toContain('fluxLigacao');
  });
});
