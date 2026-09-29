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

import { useMemo, useState } from 'react';
import { EXPR_PADRAO, ItemDrawer, TIPOS_ITEM_DRAWER, TipoItemDrawer, itensDoDrawer, novoItemDrawer, posicaoProporcional } from '../editor/drawer';
import { escolherArquivo } from '../editor/arquivo';
import { atualizarForma } from '../editor/ops';
import { abaAtiva, mutar } from '../editor/store';
import { estiloDaForma } from '../shapes/render';
import { DrawerSvg } from '../shapes/renderDrawer';
import { aplicarCondicoes, seFalso, seValorEm, seVerdadeiro } from '../ui/condicoes';
import { Grupo, Prop, PropertyGrid } from '../ui/PropertyGrid';
import { bool, botao, comId, cor, forcarDesabilitado, leitura, sel, txt } from '../ui/propHelpers';
import { Modal } from './Modal';

/** Linhas do Inspector do item selecionado: tipo, geometria em texto, imagem, pintura e gradiente. */
export function gruposDoItem(it: ItemDrawer, edit: (p: Partial<ItemDrawer>) => void, vars: { L: number; T: number; W: number; H: number }, carregar: () => void): Grupo[] {
  const rot = TIPOS_ITEM_DRAWER.map((t) => t.rotulo);
  const legado = !TIPOS_ITEM_DRAWER.some((t) => t.valor === it.tipo);
  const tipoAtual = TIPOS_ITEM_DRAWER.find((t) => t.valor === it.tipo)?.rotulo ?? it.tipo;
  const expr = (k: TipoItemDrawer) => (it.tipo === k ? it.expr ?? EXPR_PADRAO[k] : EXPR_PADRAO[k]);
  const idx = (v: unknown) => rot.indexOf(String(v));
  const gd = it.gradDir ?? 'Vertical';
  const props: Prop[] = [
    legado ? leitura('Tipo de desenho', tipoAtual) : comId(sel('Tipo de desenho', tipoAtual, rot, (v) => {
      const novo = TIPOS_ITEM_DRAWER[Math.max(0, rot.indexOf(v))].valor;
      edit({ tipo: novo, expr: EXPR_PADRAO[novo], ...(novo !== 'imagem' ? { src: undefined, imgNome: undefined } : {}) });
    }), 'tipo'),
    comId(txt('Retângulo', expr('retangulo'), (v) => edit({ expr: v })), 'retangulo'),
    comId(txt('Elipse', expr('elipse'), (v) => edit({ expr: v })), 'elipse'),
    comId(txt('Curva', expr('curva'), (v) => edit({ expr: v })), 'curva'),
    comId(txt('Arco', expr('arco'), (v) => edit({ expr: v })), 'arco'),
    comId(txt('Pontos - (X, Y)', expr('path'), (v) => edit({ expr: v })), 'path'),
    comId(txt('Dimensões da img.', expr('imagem'), (v) => edit({ expr: v })), 'posiimg'),
    comId(botao('Abrir imagem', 'Abrir imagem...', carregar), 'imagem'),
    comId(leitura('Tamanho (L, A)', `(${it.imgW ?? 0} ,${it.imgH ?? 0})`), 'tamanhoImg'),
    comId(botao('Proporcional', 'Proporcional', () => edit({ expr: posicaoProporcional(it.expr ?? EXPR_PADRAO.imagem, it.imgW ?? 0, it.imgH ?? 0, vars) })), 'proporcional'),
    forcarDesabilitado(comId(bool('Pintar (FILL)', it.preencher, (v) => edit({ preencher: v })), 'fill'), it.tipo === 'imagem'),
    comId(bool('Herdar pintura', !!it.herdar, (v) => edit({ herdar: v })), 'herdar'),
    comId(cor('Cor do desenho', it.cor, (v) => edit({ cor: v || '#000000' })), 'cor'),
  ];
  const grad: Prop[] = [
    comId(bool('Usar gradiente', !!it.gradiente, (v) => edit({ gradiente: v })), 'gradiente'),
    comId(cor('Cor inicial', it.grad1 || it.cor, (v) => edit({ grad1: v || undefined })), 'grad1'),
    comId(cor('Cor final', it.cor2 ?? '#cccccc', (v) => edit({ cor2: v || undefined })), 'grad2'),
    comId(sel('Dir. vertical', gd, ['Vertical', 'Horizontal'], (v) => edit({ gradDir: v === 'Horizontal' ? 'Horizontal' : 'Vertical' })), 'gradDir'),
  ];
  const nao = (v: unknown) => !(v === true);
  const todas = aplicarCondicoes([...props, ...grad], [
    { fonte: 'tipo', habilitaSe: (v) => idx(v) === 0, afetados: ['retangulo'] },
    { fonte: 'tipo', habilitaSe: (v) => idx(v) === 1, afetados: ['elipse'] },
    { fonte: 'tipo', habilitaSe: (v) => idx(v) === 2, afetados: ['curva'] },
    { fonte: 'tipo', habilitaSe: (v) => idx(v) === 3, afetados: ['arco'] },
    { fonte: 'tipo', habilitaSe: (v) => idx(v) === 4, afetados: ['path'] },
    { fonte: 'tipo', habilitaSe: (v) => idx(v) === 5, afetados: ['imagem', 'proporcional', 'tamanhoImg', 'posiimg'] },
    { fonte: 'herdar', habilitaSe: nao, afetados: ['cor', 'gradiente', 'grad1', 'grad2', 'gradDir'] },
    seFalso('gradiente', ['cor']),
    seVerdadeiro('gradiente', ['grad1', 'grad2', 'gradDir']),
  ]);
  void seValorEm;
  return [
    { titulo: 'Item de desenho', props: todas.slice(0, props.length) },
    { titulo: 'Gradiente', props: todas.slice(props.length) },
  ];
}

function lerImagem(arq: File): Promise<{ src: string; w: number; h: number }> {
  return new Promise((ok, no) => {
    const r = new FileReader();
    r.onerror = () => no(new Error('não foi possível ler a imagem'));
    r.onload = () => {
      const src = String(r.result);
      const im = new Image();
      im.onerror = () => no(new Error('arquivo de imagem inválido'));
      im.onload = () => ok({ src, w: im.naturalWidth, h: im.naturalHeight });
      im.src = src;
    };
    r.readAsDataURL(arq);
  });
}

/** Editor de itens do LivreDrawer: lista de itens + Inspector do item + prévia. */
export function DrawerItensEditor({ id, onFechar }: { id: string; onFechar: () => void }) {
  const aba = abaAtiva();
  const original = aba?.doc.formas.find((f) => f.id === id);
  const [itens, setItens] = useState<ItemDrawer[]>(() => (original ? structuredClone(itensDoDrawer(original)) : []));
  const [sel_, setSel] = useState(itens.length ? 0 : -1);
  const [erro, setErro] = useState('');
  const forma = useMemo(() => (original ? { ...original, props: { ...original.props, itens } } : undefined), [original, itens]);
  if (!original || !forma || !aba) return null;
  const e = estiloDaForma(original);
  const m = { L: 24, T: 24, W: original.w - 48, H: original.h - 48 };
  const atual = itens[sel_];
  const edit = (p: Partial<ItemDrawer>) => setItens((x) => x.map((it, i) => (i === sel_ ? { ...it, ...p } : it)));
  const carregar = async () => {
    try {
      const arq = await escolherArquivo('image/*');
      if (!arq) return;
      const im = await lerImagem(arq);
      edit({ src: im.src, imgNome: arq.name, imgW: im.w, imgH: im.h });
      setErro('');
    } catch (x) {
      setErro(x instanceof Error ? x.message : String(x));
    }
  };
  const mover = (d: -1 | 1) => {
    const n = sel_ + d;
    if (n < 0 || n >= itens.length) return;
    const c = itens.slice();
    [c[sel_], c[n]] = [c[n], c[sel_]];
    setItens(c);
    setSel(n);
  };
  const pronto = () => {
    mutar((d) => atualizarForma(d, id, { props: { ...original.props, itens } }));
    onFechar();
  };
  const nomeItem = (it: ItemDrawer) => TIPOS_ITEM_DRAWER.find((t) => t.valor === it.tipo)?.rotulo ?? it.tipo;
  return (
    <Modal titulo="Editor de desenhos" onFechar={onFechar} largura={900} rodape={<><button onClick={pronto}>PRONTO</button><button onClick={onFechar}>Cancelar</button></>}>
      <div className="dd-barra">
        <button onClick={() => { setItens([...itens, novoItemDrawer()]); setSel(itens.length); }}>Novo</button>
        <button disabled={!atual} onClick={() => { setItens([...itens, structuredClone(atual)]); setSel(itens.length); }}>Duplique</button>
        <button disabled={!atual} onClick={() => { setItens(itens.filter((_, i) => i !== sel_)); setSel(Math.min(sel_, itens.length - 2)); }}>Excluir</button>
        <button disabled={!atual || sel_ === 0} onClick={() => mover(-1)} title="Subir">↑</button>
        <button disabled={!atual || sel_ >= itens.length - 1} onClick={() => mover(1)} title="Descer">↓</button>
      </div>
      {erro && <div role="alert" style={{ color: 'var(--erro)' }}>{erro}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 300px', gap: 8, marginTop: 8 }}>
        <div className="dd-desenho-lista" role="listbox" aria-label="Itens do desenho">
          {itens.map((it, i) => <div key={i} className={i === sel_ ? 'sel' : ''} onClick={() => setSel(i)}>{i + 1}. {nomeItem(it)}</div>)}
          {!itens.length && <div className="dica">Use Novo para adicionar um item.</div>}
        </div>
        <div style={{ overflow: 'auto', border: '1px solid var(--borda)', background: 'var(--canvas)' }}>
          <svg width={original.w} height={original.h} style={{ display: 'block' }}>
            <DrawerSvg f={forma} doc={aba.doc} gradiente={e.gradiente} c1={e.c1} c2={e.c2} dir={e.dir} alfa={typeof original.props.alfa === 'number' ? e.alfa : 0.5} />
          </svg>
        </div>
        <div style={{ maxHeight: 420, overflow: 'auto' }}>
          {atual ? <PropertyGrid key={`${sel_}:${atual.tipo}`} grupos={gruposDoItem(atual, edit, m, carregar)} /> : null}
        </div>
      </div>
    </Modal>
  );
}
