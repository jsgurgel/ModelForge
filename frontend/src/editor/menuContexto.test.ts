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
import { itensContexto } from './menuContexto';
import { adicionarForma, novaForma, novaLigacao } from './ops';
import { diagramaVazio } from './types';

const rotulos = (itens: ReturnType<typeof itensContexto>) => itens.filter((i) => 'rotulo' in i).map((i) => (i as { rotulo: string }).rotulo);

describe('menu de contexto', () => {
  it('fundo do diagrama: colar, selecionar tudo, organizar, zoom', () => {
    const r = rotulos(itensContexto(diagramaVazio('conceitual', 't'), []));
    expect(r).toEqual(expect.arrayContaining(['Colar', 'Selecionar tudo', 'Organizar diagrama']));
  });

  it('entidade: atributos, auto-relacionamento e edição comum', () => {
    let d = diagramaVazio('conceitual', 't');
    const e = novaForma(d, 'entidade', 200, 200);
    d = adicionarForma(d, e);
    const r = rotulos(itensContexto(d, [e.id]));
    expect(r).toEqual(expect.arrayContaining(['Adicionar atributo', 'Organizar atributos', 'Editar atributos...', 'Criar auto-relacionamento', 'Copiar', 'Apagar', 'Trazer para frente']));
  });

  it('relacionamento converte em associativa; tabela oferece campos; raia oferece captura', () => {
    let d = diagramaVazio('conceitual', 't');
    const r = novaForma(d, 'relacionamento', 200, 200);
    d = adicionarForma(d, r);
    expect(rotulos(itensContexto(d, [r.id]))).toContain('Converter em entidade associativa');
    let l = diagramaVazio('logico', 't');
    const t = novaForma(l, 'tabela', 200, 200);
    l = adicionarForma(l, t);
    expect(rotulos(itensContexto(l, [t.id]))).toEqual(expect.arrayContaining(['Editar campos...', 'Novo campo chave (PK)']));
    let a = diagramaVazio('atividade', 't');
    const raia = novaForma(a, 'raiaAtividade', 200, 200);
    a = adicionarForma(a, raia);
    expect(rotulos(itensContexto(a, [raia.id]))).toEqual(expect.arrayContaining(['Capturar formas da área', 'Soltar formas da área']));
  });

  it('linha: centralizar, inteligente, editar texto', () => {
    let d = diagramaVazio('livre', 't');
    const a = novaForma(d, 'livreRetangulo', 100, 100);
    d = adicionarForma(d, a);
    const b = novaForma(d, 'livreRetangulo', 400, 100);
    d = adicionarForma(d, b);
    d = novaLigacao(d, 'livreLigacao', a.id, b.id);
    const r = rotulos(itensContexto(d, [d.ligacoes[0].id]));
    expect(r).toEqual(expect.arrayContaining(['Editar texto da linha...', 'Centralizar linha (remover pontos de dobra)', 'Linha inteligente (alternar)', 'Ancorar / desancorar']));
  });
});
