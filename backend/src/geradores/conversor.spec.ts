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

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { conceitualParaLogico, logicoParaConceitual } from './conversor';
import type { Diagrama } from '../modelo/tipos';

const DIR = join(__dirname, '..', '..', 'test', 'fixtures-conceitual');

/** Renomeia ids pela ordem de aparição (formas, campos, constraints, ligações) e ajusta as referências. */
export function normalizar(d: Diagrama): unknown {
  const mapa = new Map<string, string>();
  let n = 0;
  const nome = (id: string, p: string): string => {
    if (!mapa.has(id)) mapa.set(id, p + n++);
    return mapa.get(id)!;
  };
  for (const f of d.formas) {
    nome(f.id, 'F');
    for (const c of (f.props.campos as { id: string }[] | undefined) ?? []) nome(c.id, 'C');
    for (const k of (f.props.constraints as { id: string }[] | undefined) ?? []) nome(k.id, 'K');
  }
  for (const l of d.ligacoes) nome(l.id, 'L');
  const r = (id: string | null): string | null => (id === null ? null : mapa.get(id) ?? id);
  return {
    nome: d.nome,
    tipo: d.tipo,
    formas: d.formas.map((f) => {
      const props: Record<string, unknown> = { ...f.props };
      if (Array.isArray(props.campos)) {
        props.campos = (props.campos as { id: string }[]).map((c) => ({ ...c, id: r(c.id) }));
      }
      if (Array.isArray(props.constraints)) {
        props.constraints = (props.constraints as any[]).map((k) => ({
          ...k,
          id: r(k.id),
          camposOrigem: k.camposOrigem.map(r),
          camposDestino: k.camposDestino.map(r),
          constraintOrigem: k.constraintOrigem ? { ...k.constraintOrigem, tabelaId: r(k.constraintOrigem.tabelaId) } : null,
        }));
      }
      return { ...f, id: r(f.id), props };
    }),
    ligacoes: d.ligacoes.map((l) => ({ ...l, id: r(l.id), de: r(l.de), para: r(l.para) })),
  };
}

const TOLERANCIA_LOSANGO = 30;
const arquivos = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')).sort() : [];

describe('conceitualParaLogico (fixtures de referência)', () => {
  it.each(arquivos)('%s', (arq) => {
    const fx = JSON.parse(readFileSync(join(DIR, arq), 'utf8'));
    const res = conceitualParaLogico(fx.conceitual);
    expect(normalizar(res.diagrama)).toEqual(normalizar(fx.conceitualParaLogico.modelo));
    expect(res.avisos).toEqual(fx.conceitualParaLogico.avisos);
    expect(res.erros).toEqual(fx.conceitualParaLogico.erros);
  });
});

/**
 * O esperado é reordenado para agrupar por entidade, na ordem das entidades - a ordem do TypeScript.
 */
function canonicoReverso(d: Diagrama): Diagrama {
  const entidades = d.formas.filter((f) => f.kind === 'entidade');
  const idx = new Map(entidades.map((e, i) => [e.id, i]));
  const dono = new Map<string, string>();
  for (const l of d.ligacoes) if (idx.has(l.de) && !d.formas.find((f) => f.id === l.para && f.kind !== 'atributo')) dono.set(l.para, l.de);
  const ordem = (id: string): number => idx.get(dono.get(id) ?? '') ?? 0;
  const atributos = d.formas.filter((f) => f.kind === 'atributo');
  const atributosOrd = atributos.map((a, i) => ({ a, i })).sort((x, y) => ordem(x.a.id) - ordem(y.a.id) || x.i - y.i).map((x) => x.a);
  const outras = d.formas.filter((f) => f.kind !== 'atributo' && f.kind !== 'entidade');
  const ligAttr = d.ligacoes.filter((l) => dono.has(l.para));
  const ligAttrOrd = ligAttr.map((l, i) => ({ l, i })).sort((x, y) => ordem(x.l.para) - ordem(y.l.para) || x.i - y.i).map((x) => x.l);
  const ligOutras = d.ligacoes.filter((l) => !dono.has(l.para));
  return { ...d, formas: [...entidades, ...atributosOrd, ...outras], ligacoes: [...ligAttrOrd, ...ligOutras] };
}

describe('logicoParaConceitual (fixtures de referência)', () => {
  it.each(arquivos)('%s', (arq) => {
    const fx = JSON.parse(readFileSync(join(DIR, arq), 'utf8'));
    const res = logicoParaConceitual(fx.conceitualParaLogico.modelo);
    const obtido = normalizar(res.diagrama) as { formas: any[] };
    const esperado = normalizar(canonicoReverso(fx.logicoParaConceitual.modelo)) as { formas: any[] };
    // Os losangos são empurrados para longe de entidades/atributos/outros losangos por um laço cuja ordem
    // não é garantida: a posição deles só é reproduzível até esse empurrão (algumas dezenas
    // de pixels), então é comparada com tolerância; todo o resto (entidades, atributos, ligações) é exato.
    obtido.formas.forEach((f, i) => {
      if (f.kind !== 'relacionamento') return;
      const g = esperado.formas[i];
      expect(Math.abs(f.x - g.x)).toBeLessThanOrEqual(TOLERANCIA_LOSANGO);
      expect(Math.abs(f.y - g.y)).toBeLessThanOrEqual(TOLERANCIA_LOSANGO);
      f.x = g.x = 0;
      f.y = g.y = 0;
    });
    expect(obtido).toEqual(esperado);
  });
});

describe('opções da conversão', () => {
  const fx = JSON.parse(readFileSync(join(DIR, 'conc_especializacao.json'), 'utf8'));

  it('respostas padrão = "OK para todos" (especialização total funde na generalizada)', () => {
    const r = conceitualParaLogico(fx.conceitual);
    expect(r.diagrama.formas.map((f) => f.texto)).toEqual(['pessoa', 'veiculo', 'carro']);
  });

  it('escolher 0 na especialização mantém uma tabela por entidade, com FK', () => {
    const r = conceitualParaLogico(fx.conceitual, { escolher: (p) => (p.tipo === 'especializacao' ? 0 : undefined) });
    expect(r.diagrama.formas.map((f) => f.texto).sort()).toEqual(['carro', 'pessoa', 'pessoa_fisica', 'pessoa_juridica', 'veiculo']);
  });

  it('não substituir caracteres especiais mantém o nome como está', () => {
    const d = JSON.parse(JSON.stringify(fx.conceitual)) as Diagrama;
    d.formas[0].texto = 'Descrição';
    expect(conceitualParaLogico(d).diagrama.formas[0].texto).toBe('Descricao');
    const r = conceitualParaLogico(d, { escolher: (p) => (p.tipo === 'caracteres' ? 1 : undefined) });
    expect(r.diagrama.formas[0].texto).toBe('Descrição');
  });
});
