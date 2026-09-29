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

import { useCallback, useEffect, useRef, useState } from 'react';
import { alturaMinima, centro, dentro, intersecta, normalizar } from '../editor/geometry';
import {
  Doc, adicionarForma, apagarComConfig, atualizarForma, atualizarLigacao, autoCapturar, campoNoPonto, estaAncorada, idsArrastados, novaForma, novaLigacao,
} from '../editor/ops';
import { aceitaPontaSolta, aplicarAlvoNaPonta, ligacaoComPontasSoltas, ligacaoNoPonto, prenderPontaNaForma } from '../editor/linhasSoltas';
import { validarLigacao } from '../editor/canLiga';
import { caixaDaCardinalidade, deslocamentoCard, patchArrastoCardinalidade, FonteCard } from '../editor/cardinalidade';
import { duploCliqueConceitual } from '../editor/conceitual';
import { pontoDeConexao } from '../editor/roteamentoInteligente';
import { Resultado, criarFormaConceitual, ligarConceitual, uniaoDeEntidades } from '../editor/criacao';
import { encaixar, useConfig } from '../editor/config';
import { idsRealcados } from '../editor/formato';
import { Ancorador } from './Ancorador';
import { atualizarRoque } from '../editor/roque';
import { apagarSubItemNoPonto, itemNoPonto, retanguloDoItem, selecionarItem, useItemSel } from '../editor/itemSel';
import { layoutTabela, propsTabela } from '../editor/logico';
import { ItemContexto, itensContexto } from '../editor/menuContexto';
import {
  caminhoDaLigacao, inserirPontoDeDobra, moverPontoDeDobra, pontoDeDobraEm, pontosDeDobra, removerPontoDeDobra,
} from '../editor/roteamento';
import { calcularSnap } from '../editor/snap';
import {
  abaAtiva, abrirGesto, fecharGesto, mutar, selecionar, setFerramenta, setMensagem, useEditor,
} from '../editor/store';
import { Forma } from '../editor/types';
import { FORMAS } from '../shapes/registry';
import { FormaSvg, LigacaoSvg } from '../shapes/render';
import { MenuContexto } from './MenuContexto';
import { abrirDialogo } from './dialogos';
//# G1 (motor de interação): duplo cliques, hover, cursor, digitar para editar, zoom por passos.
import {
  adicionarAreaRaia, alcaDaDivisoria, alternarNaSelecao, divisoriaNoPonto, divisoriasDaRaia, removerAreaRaia, selecaoDaCaixa, textoAoDigitar, zoomMais, zoomMenos,
} from '../editor/interacao';
import { capturarCores, tipoDaLegenda } from '../editor/legenda';
import { organizarBarraEap } from '../editor/organizar';
import { cursorDaFerramenta } from '../editor/cursores';
import { obterConfig } from '../editor/config';
import { registrarCantoVisivel } from '../editor/store';
import { LIGACOES, iconePaleta } from '../shapes/registry';
import { bancoApi } from '../api';
import { lerTabelaDoBanco, ligarFksDaTabelaSolta, tabelaDoBancoParaForma } from '../editor/bancoDrop';
import './motor.css';

interface Props {
  onEditar: (f: Forma) => void;
  areaRef: React.RefObject<HTMLDivElement>;
  onScroll: () => void;
}

type Alca = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const ALCAS: Alca[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
type P = { x: number; y: number };

interface Arrasto {
  tipo: 'mover' | 'alca' | 'caixa' | 'ponto' | 'texto' | 'card' | 'ponta';
  inicio: P;
  pos: Map<string, P>;
  base?: Forma;
  alca?: Alca;
  aditivo?: boolean;
  ligId?: string;
  indice?: number;
  texto0?: P;
  ponta?: 'A' | 'B';
}

const acertaForma = (f: Forma, p: P): boolean => {
  const d = FORMAS[f.kind];
  if (d?.geo === 'lane') {
    //# Raia: só o título e a borda pegam o clique; o miolo fica livre para caixa de seleção e formas dentro.
    return dentro(f, p) && (p.y - f.y <= 30 || p.x - f.x <= 8 || f.x + f.w - p.x <= 8 || f.y + f.h - p.y <= 8);
  }
  //# Atributos têm o nome fora da caixa: aumenta a área clicável pra incluir o texto.
  const alvo = d?.textoFora ? { ...f, w: f.w + 6 + f.texto.length * 7 } : f;
  return dentro(alvo, p);
};

export function Canvas({ onEditar, areaRef, onScroll }: Props) {
  const e = useEditor();
  const cfg = useConfig();
  const itemSel = useItemSel();
  const aba = abaAtiva(e)!;
  const { doc, selecao } = aba;
  const raiz = useRef<SVGSVGElement>(null);
  const arrasto = useRef<Arrasto | null>(null);
  const [guias, setGuias] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [caixa, setCaixa] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [origem, setOrigem] = useState<string | null>(null);
  const campoOrigem = useRef<string | null>(null);
  const pontoOrigem = useRef<P>({ x: 0, y: 0 });
  const livreOrigem = useRef<P | null>(null);
  const [ponteiro, setPonteiro] = useState<P | null>(null);
  const [edicao, setEdicao] = useState<{ id: string; valor: string; digitado?: boolean } | null>(null);
  const [dim, setDim] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; itens: ItemContexto[] } | null>(null);
  const z = doc.zoom;
  //# G1: alvo sob o mouse com ferramenta armada (ProcessaOverDraw) e cursor da ferramenta (MakeCursor).
  const [sobre, setSobre] = useState<{ tipo: 'forma' | 'ligacao'; id: string } | null>(null);
  const [cursorFerr, setCursorFerr] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    if (!e.ferramenta) { setCursorFerr(null); setSobre(null); return; }
    void cursorDaFerramenta(iconePaleta(e.ferramenta)).then((c) => { if (vivo) setCursorFerr(c); });
    return () => { vivo = false; };
  }, [e.ferramenta]);
  //# Canto visível da área de rolagem: onde o Colar põe as formas.
  useEffect(() => registrarCantoVisivel(() => {
    const el = areaRef.current;
    const zz = abaAtiva()?.doc.zoom ?? 1;
    return el ? { x: el.scrollLeft / zz, y: el.scrollTop / zz } : { x: 0, y: 0 };
  }), [areaRef]);

  // Ao trocar de aba/ferramenta, abandona uma ligação pela metade.
  useEffect(() => { setOrigem(null); livreOrigem.current = null; }, [e.ferramenta, e.ativa]);

  const ponto = (ev: { clientX: number; clientY: number }): P => {
    const r = raiz.current!.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / z, y: (ev.clientY - r.top) / z };
  };

  const formaEm = (p: P): Forma | undefined => {
    let lane: Forma | undefined;
    for (let i = doc.formas.length - 1; i >= 0; i--) {
      const f = doc.formas[i];
      if (!acertaForma(f, p)) continue;
      if (FORMAS[f.kind]?.geo === 'lane') lane = lane ?? f;
      else return f;
    }
    return lane;
  };

  const ligacaoEm = (alvo: EventTarget | null): string | null => {
    const el = (alvo as Element | null)?.closest?.('[data-ligacao]');
    return el ? el.getAttribute('data-ligacao') : null;
  };

  const iniciarMover = (p: P, ids: string[]) => {
    const pos = new Map<string, P>();
    for (const id of idsArrastados(doc, ids)) {
      const f = doc.formas.find((x) => x.id === id);
      if (f && !estaAncorada(f)) pos.set(f.id, { x: f.x, y: f.y });
    }
    arrasto.current = { tipo: 'mover', inicio: p, pos };
    abrirGesto();
  };

  const criarForma = (kind: string, p: P, alvo: Forma | undefined) => {
    let ids: string[] = [];
    mutar((d) => {
      let r: Resultado | null = d.tipo === 'conceitual' ? criarFormaConceitual(d, kind, p, alvo) : null;
      if (!r) {
        const f = novaForma(d, kind, p.x, p.y);
        r = { doc: adicionarForma(d, f), ids: [f.id] };
      }
      ids = r.ids;
      return autoCapturar(r.doc, r.ids);
    });
    selecionar(ids.slice(0, 1));
  };

  const rearmar = (ev: { ctrlKey: boolean }) => {
    if (!ev.ctrlKey && !e.ferramentaFixa) setFerramenta(null);
  };

  const aoPressionar = (ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    raiz.current!.setPointerCapture(ev.pointerId);
    const p = ponto(ev);
    const ferr = e.ferramenta;
    const alvo = formaEm(p);
    const idLig = ligacaoEm(ev.target);

    if (edicao) setEdicao(null);
    if (menu) setMenu(null);

    if (ferr?.tipo === 'apagar') {
      const id = alvo?.id ?? idLig;
      //# Lógico: sobre um campo/IR da tabela, só esse item é apagado.
      const so = alvo && alvo.kind === 'tabela' ? apagarSubItemNoPonto(doc, alvo, p.x, p.y, alvo.fonte?.tamanho ?? doc.fonte.tamanho) : null;
      if (so && alvo) {
        mutar(() => so);
        selecionar([alvo.id]);
        selecionarItem(null);
        return;
      }
      if (id) {
        mutar((d) => {
          const r = apagarComConfig(d, [id], cfg.propagarExclusao);
          if (r.bloqueados.length) setMensagem('Objeto com ligações não apagado ("Propague apagar" está desligado)');
          return r.doc;
        });
        selecionar([]);
      }
      return;
    }

    if (ferr?.tipo === 'forma') {
      //# União de entidades: dois cliques em entidades cria a união, a entidade resultante e as três linhas.
      if (ferr.kind === 'uniaoEntidades' && doc.tipo === 'conceitual') {
        if (!origem && alvo?.kind === 'entidade') {
          setOrigem(alvo.id);
          setMensagem('Clique na segunda entidade da união (ou em área vazia para uma união simples)');
          return;
        }
        if (origem) {
          const a = doc.formas.find((f) => f.id === origem);
          setOrigem(null);
          setMensagem('');
          if (a && alvo?.kind === 'entidade' && alvo.id !== a.id) {
            let ids: string[] = [];
            mutar((d) => {
              const r = uniaoDeEntidades(d, a, alvo);
              ids = r.ids;
              return r.doc;
            });
            selecionar(ids.slice(0, 1));
            rearmar(ev);
            return;
          }
        }
      }
      criarForma(ferr.kind, p, alvo);
      rearmar(ev);
      return;
    }

    if (ferr?.tipo === 'ligacao') {
      //# Fluxo/Atividade/Livre: as pontas podem ficar em área vazia ou grudar em outra linha.
      if (aceitaPontaSolta(doc, ferr.kind) && (!alvo || livreOrigem.current)) {
        if (!origem && !livreOrigem.current) {
          livreOrigem.current = p;
          setMensagem('Clique no destino da ligação (forma, linha ou área vazia)');
          return;
        }
        const de = livreOrigem.current ? { ponto: livreOrigem.current } : { forma: origem!, ponto: pontoOrigem.current };
        const naLinha = alvo ? null : ligacaoNoPonto(doc, p);
        let novoId = '';
        mutar((d) => {
          const r = ligacaoComPontasSoltas(d, ferr.kind, de, alvo ? { forma: alvo.id, ponto: p } : { ponto: p });
          novoId = r.id;
          let res = r.doc;
          if (alvo) res = prenderPontaNaForma(res, r.id, 'B', alvo.id, p);
          else if (naLinha) res = aplicarAlvoNaPonta(res, r.id, 'B', { ligacao: naLinha.id, ponto: naLinha.ponto });
          if (de.forma) res = prenderPontaNaForma(res, r.id, 'A', de.forma, de.ponto);
          return res;
        });
        livreOrigem.current = null;
        setOrigem(null);
        setMensagem('');
        selecionar([novoId]);
        rearmar(ev);
        return;
      }
      if (!alvo) {
        setOrigem(null);
        return;
      }
      if (!origem) {
        setOrigem(alvo.id);
        pontoOrigem.current = p;
        campoOrigem.current = ferr.kind === 'logicoLinha' ? campoNoPonto(alvo, p.y)?.id ?? null : null;
        setMensagem('Clique na forma de destino da ligação');
        return;
      }
      const de = doc.formas.find((f) => f.id === origem);
      const cd = ferr.kind === 'logicoLinha' ? campoNoPonto(alvo, p.y)?.id ?? null : null;
      const co = campoOrigem.current;
      let feito = false;
      let sel: string[] = [];
      mutar((d) => {
        let novo: Doc;
        if (d.tipo === 'conceitual' && ferr.kind === 'linha' && de) {
          const r = ligarConceitual(d, de, alvo, pontoOrigem.current, p);
          novo = r.doc;
          sel = r.ids.slice(0, 1);
        } else {
          novo = novaLigacao(d, ferr.kind, origem, alvo.id, co, cd);
          sel = novo.ligacoes.length > d.ligacoes.length ? [novo.ligacoes[novo.ligacoes.length - 1].id] : [];
        }
        feito = novo !== d;
        return novo;
      });
      setOrigem(null);
      setMensagem(feito ? '' : (origem ? validarLigacao(doc, ferr.kind, origem, alvo.id).motivo : undefined) ?? 'Ligação não permitida entre estas formas');
      if (feito) {
        if (sel.length) selecionar(sel);
        rearmar(ev);
      }
      return;
    }

    // Ponteiro
    if (alvo) {
      let ids = selecao;
      if (ev.shiftKey || ev.ctrlKey) ids = ids.includes(alvo.id) ? ids.filter((i) => i !== alvo.id) : [...ids, alvo.id];
      else if (!ids.includes(alvo.id)) ids = [alvo.id];
      selecionar(ids);
      selecionarItem(ids.length === 1 && alvo.kind === 'tabela' ? itemNoPonto(alvo, p.y, alvo.fonte?.tamanho ?? doc.fonte.tamanho, p.x) : null);
      if (ids.includes(alvo.id)) iniciarMover(p, ids.filter((i) => doc.formas.some((f) => f.id === i)));
      return;
    }
    if (idLig) {
      selecionar(ev.shiftKey || ev.ctrlKey ? alternarNaSelecao(selecao, idLig, true) : [idLig]);
      return;
    }
    if (!ev.shiftKey && !ev.ctrlKey) selecionar([]);
    arrasto.current = { tipo: 'caixa', inicio: p, pos: new Map(), aditivo: ev.shiftKey || ev.ctrlKey };
  };

  const iniciarAlca = (ev: React.PointerEvent, f: Forma, alca: Alca) => {
    ev.stopPropagation();
    raiz.current!.setPointerCapture(ev.pointerId);
    arrasto.current = { tipo: 'alca', inicio: ponto(ev), pos: new Map(), base: f, alca };
    abrirGesto();
  };

  const iniciarPonto = (ev: React.PointerEvent, ligId: string, indice: number) => {
    ev.stopPropagation();
    raiz.current!.setPointerCapture(ev.pointerId);
    arrasto.current = { tipo: 'ponto', inicio: ponto(ev), pos: new Map(), ligId, indice };
    abrirGesto();
  };

  const iniciarCard = (ev: React.PointerEvent, ligId: string, ponta: 'A' | 'B', base: P) => {
    ev.stopPropagation();
    raiz.current!.setPointerCapture(ev.pointerId);
    arrasto.current = { tipo: 'card', inicio: ponto(ev), pos: new Map(), ligId, ponta, texto0: base };
    abrirGesto();
  };

  const iniciarPonta = (ev: React.PointerEvent, ligId: string, ponta: 'A' | 'B') => {
    ev.stopPropagation();
    raiz.current!.setPointerCapture(ev.pointerId);
    arrasto.current = { tipo: 'ponta', inicio: ponto(ev), pos: new Map(), ligId, ponta };
    abrirGesto();
  };

  const iniciarTexto = (ev: React.PointerEvent, ligId: string, dx: number, dy: number) => {
    ev.stopPropagation();
    raiz.current!.setPointerCapture(ev.pointerId);
    arrasto.current = { tipo: 'texto', inicio: ponto(ev), pos: new Map(), ligId, texto0: { x: dx, y: dy } };
    abrirGesto();
  };

  const aoMover = (ev: React.PointerEvent) => {
    const p = ponto(ev);
    setPonteiro(p);
    if (e.ferramenta && !arrasto.current) {
      const f = formaEm(p);
      const il = f ? null : ligacaoEm(ev.target);
      const novo = f ? { tipo: 'forma' as const, id: f.id } : il ? { tipo: 'ligacao' as const, id: il } : null;
      setSobre((a) => (a?.id === novo?.id && a?.tipo === novo?.tipo ? a : novo));
    }
    const a = arrasto.current;
    //# Lógico: realce (roqued) da FK ao passar o mouse na linha lógica ou na IR de FK da tabela.
    if (doc.tipo === 'logico' && !a) atualizarRoque(doc, p.x, p.y, ligacaoEm(ev.target), formaEm(p));
    if (!a) return;
    const dx = p.x - a.inicio.x;
    const dy = p.y - a.inicio.y;
    const grade = cfg.larguraGrade;

    if (a.tipo === 'mover') {
      if (!a.pos.size) return;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && !guias.x.length) return;
      const iniciais = [...a.pos.values()];
      const sel = doc.formas.filter((f) => a.pos.has(f.id));
      const minX = Math.min(...iniciais.map((v) => v.x)) + dx;
      const minY = Math.min(...iniciais.map((v) => v.y)) + dy;
      const maxX = Math.max(...sel.map((f) => a.pos.get(f.id)!.x + f.w)) + dx;
      const maxY = Math.max(...sel.map((f) => a.pos.get(f.id)!.y + f.h)) + dy;
      let fx = dx;
      let fy = dy;
      let guiasX: number[] = [];
      let guiasY: number[] = [];
      if (!ev.altKey) {
        if (cfg.encaixarNaGrade) {
          fx += encaixar(minX, grade) - minX;
          fy += encaixar(minY, grade) - minY;
        } else {
          const outras = doc.formas.filter((f) => !a.pos.has(f.id));
          const snap = calcularSnap({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, outras);
          fx += snap.dx;
          fy += snap.dy;
          guiasX = snap.guiasX;
          guiasY = snap.guiasY;
        }
      }
      mutar((d) => ({
        ...d,
        formas: d.formas.map((f) => {
          const i = a.pos.get(f.id);
          return i ? { ...f, x: Math.max(0, Math.round(i.x + fx)), y: Math.max(0, Math.round(i.y + fy)) } : f;
        }),
      }), { historico: false });
      setGuias({ x: guiasX, y: guiasY });
      if (cfg.dimensoesAoMover) {
        const lider = sel[0];
        const i = a.pos.get(lider.id)!;
        setDim({ x: Math.max(0, Math.round(i.x + fx)), y: Math.max(0, Math.round(i.y + fy)), w: lider.w, h: lider.h });
      }
      return;
    }

    if (a.tipo === 'alca' && a.base && a.alca) {
      const b = a.base;
      let { x, y, w, h } = b;
      if (a.alca.includes('e')) w = b.w + dx;
      if (a.alca.includes('s')) h = b.h + dy;
      if (a.alca.includes('w')) { x = b.x + dx; w = b.w - dx; }
      if (a.alca.includes('n')) { y = b.y + dy; h = b.h - dy; }
      const min = alturaMinima(b);
      if (h < min) { if (a.alca.includes('n')) y = b.y + b.h - min; h = min; }
      if (w < 20) { if (a.alca.includes('w')) x = b.x + b.w - 20; w = 20; }
      mutar((d) => atualizarForma(d, b.id, { x: Math.max(0, x), y: Math.max(0, y), w, h }), { historico: false });
      if (cfg.dimensoesAoMover) setDim({ x: Math.max(0, x), y: Math.max(0, y), w, h });
      return;
    }

    if (a.tipo === 'ponto' && a.ligId !== undefined && a.indice !== undefined) {
      const alvo = cfg.encaixarNaGrade && !ev.altKey ? { x: encaixar(p.x, grade), y: encaixar(p.y, grade) } : p;
      mutar((d) => {
        const l = d.ligacoes.find((x) => x.id === a.ligId);
        if (!l) return d;
        return atualizarLigacao(d, l.id, { props: { ...l.props, pontos: moverPontoDeDobra(pontosDeDobra(l), a.indice!, { x: Math.max(0, alvo.x), y: Math.max(0, alvo.y) }) } });
      }, { historico: false });
      return;
    }

    if (a.tipo === 'card' && a.ligId && a.texto0 && a.ponta) {
      mutar((d) => {
        const l = d.ligacoes.find((x) => x.id === a.ligId);
        return l ? atualizarLigacao(d, l.id, { props: patchArrastoCardinalidade(l, a.ponta!, a.texto0!, dx, dy) }) : d;
      }, { historico: false });
      return;
    }

    if (a.tipo === 'ponta' && a.ligId && a.ponta) {
      const f = formaEm(p);
      setSobre(f ? { tipo: 'forma', id: f.id } : null);
      mutar((d) => aplicarAlvoNaPonta(d, a.ligId!, a.ponta!, { ponto: p }), { historico: false });
      return;
    }

    if (a.tipo === 'texto' && a.ligId && a.texto0) {
      mutar((d) => {
        const l = d.ligacoes.find((x) => x.id === a.ligId);
        return l ? atualizarLigacao(d, l.id, { props: { ...l.props, textoDx: Math.round(a.texto0!.x + dx), textoDy: Math.round(a.texto0!.y + dy) } }) : d;
      }, { historico: false });
      return;
    }

    if (a.tipo === 'caixa') setCaixa(normalizar(a.inicio, p));
  };

  const aoSoltar = (ev: React.PointerEvent) => {
    const a = arrasto.current;
    arrasto.current = null;
    setGuias({ x: [], y: [] });
    setDim(null);
    if (!a) return;
    if (a.tipo === 'caixa') {
      const c = normalizar(a.inicio, ponto(ev));
      setCaixa(null);
      if (c.w > 3 || c.h > 3) {
        selecionar(selecaoDaCaixa(doc, c, selecao, !!a.aditivo));
      }
      return;
    }
    if (a.tipo === 'ponta' && a.ligId && a.ponta) {
      const q = ponto(ev);
      const f = formaEm(q);
      const naLinha = f ? null : ligacaoNoPonto(doc, q, a.ligId);
      mutar((d) => (f ? prenderPontaNaForma(d, a.ligId!, a.ponta!, f.id, q)
        : naLinha ? aplicarAlvoNaPonta(d, a.ligId!, a.ponta!, { ligacao: naLinha.id, ponto: naLinha.ponto })
          : aplicarAlvoNaPonta(d, a.ligId!, a.ponta!, { ponto: q })), { historico: false });
      setSobre(null);
    }
    if (a.tipo === 'mover' && a.pos.size) {
      //# Soltar dentro de uma raia captura a forma; tirar de dentro solta.
      const ids = [...a.pos.keys()];
      mutar((d) => autoCapturar(d, ids), { historico: false });
    }
    fecharGesto();
  };

  //# G1: duplo cliques próprios de cada forma (legenda, barra da EAP, raia, tabela).
  const duploCliqueDaForma = (p: P, alvoEv: EventTarget | null): boolean => {
    const tam = doc.fonte.tamanho;
    for (let i = doc.formas.length - 1; i >= 0; i--) {
      const r = doc.formas[i];
      if (FORMAS[r.kind]?.geo !== 'lane') continue;
      const k = divisoriaNoPonto(r, p, r.fonte?.tamanho ?? tam);
      if (k < 0) continue;
      mutar((d) => ({ ...d, formas: d.formas.map((x) => (x.id === r.id ? removerAreaRaia(x, k) : x)) }));
      selecionar([r.id]);
      setMensagem('Região removida da raia');
      return true;
    }
    const f = formaEm(p);
    if (!f) {
      //# Duplo clique no miolo da raia (sem forma nem linha embaixo) também acrescenta a região.
      const raia = ligacaoEm(alvoEv) ? undefined : [...doc.formas].reverse().find((x) => FORMAS[x.kind]?.geo === 'lane' && dentro(x, p));
      if (!raia) return false;
      mutar((d) => ({ ...d, formas: d.formas.map((x) => (x.id === raia.id ? adicionarAreaRaia(x) : x)) }));
      selecionar([raia.id]);
      return true;
    }
    const geo = FORMAS[f.kind]?.geo;
    if (geo === 'legend' && tipoDaLegenda(f) === 'cores') {
      const nova = capturarCores(doc, f);
      if (nova === f) setMensagem('Legenda: o diagrama não tem cores novas para listar');
      else mutar((d) => ({ ...d, formas: d.formas.map((x) => (x.id === f.id ? capturarCores(d, x) : x)) }));
      return true;
    }
    if (f.kind === 'eapBarraLigacao') {
      if (selecao.length <= 1) mutar((d) => organizarBarraEap(d, f.id));
      return true;
    }
    if (geo === 'lane') {
      mutar((d) => ({ ...d, formas: d.formas.map((x) => (x.id === f.id ? adicionarAreaRaia(x) : x)) }));
      return true;
    }
    if (geo === 'table') {
      const it = itemNoPonto(f, p.y, f.fonte?.tamanho ?? tam, p.x);
      if (it?.tipo === 'constraint') {
        const ks = (f.props.constraints as { id: string; tipo: 'PK' | 'UNIQUE' | 'FK' | 'CHECK' }[]) ?? [];
        const indice = ks.findIndex((k) => k.id === it.id);
        if (indice >= 0) {
          abrirDialogo({ tipo: 'd', nome: 'ir', id: f.id, modo: ks[indice].tipo, indice });
          return true;
        }
      }
    }
    return false;
  };

  const aoDuploClique = (ev: React.MouseEvent) => {
    const p = ponto(ev);
    if (duploCliqueDaForma(p, ev.target)) return;
    const f = formaEm(p);
    if (!f) {
      //# Duplo clique numa linha: cria (ou remove, se já houver) um ponto de dobra.
      const idLig = ligacaoEm(ev.target);
      const l = idLig ? doc.ligacoes.find((x) => x.id === idLig) : undefined;
      if (!l || estaAncorada(l)) return;
      const c = caminhoDaLigacao(doc, l);
      if (!c || c.laco) return;
      const pts = pontosDeDobra(l);
      const existente = pontoDeDobraEm(pts, p);
      const novos = existente >= 0 ? removerPontoDeDobra(pts, existente) : inserirPontoDeDobra(pts, c.pontos, p);
      mutar((d) => atualizarLigacao(d, l.id, { props: { ...l.props, pontos: novos } }));
      selecionar([l.id]);
      return;
    }
    if (doc.tipo === 'conceitual') {
      const r = duploCliqueConceitual(doc, f);
      if (r) { mutar(() => r); return; }
    }
    const geo = FORMAS[f.kind]?.geo;
    if (geo === 'table' || geo === 'colecao') {
      onEditar(f);
      return;
    }
    setEdicao({ id: f.id, valor: f.texto });
  };

  const aoContexto = (ev: React.MouseEvent) => {
    ev.preventDefault();
    //# Botão direito com ferramenta ativa cancela a ferramenta.
    if (e.ferramenta) {
      setFerramenta(null);
      setOrigem(null);
      setMensagem('');
      return;
    }
    const p = ponto(ev);
    const f = formaEm(p);
    const idLig = f ? null : ligacaoEm(ev.target);
    const alvoId = f?.id ?? idLig;
    let sel = selecao;
    if (alvoId) {
      if (!selecao.includes(alvoId)) sel = [alvoId];
    } else sel = [];
    selecionar(sel);
    setMenu({ x: ev.clientX, y: ev.clientY, itens: itensContexto(doc, sel) });
  };

  const aoSoltarArquivo = async (ev: React.DragEvent) => {
    const t = lerTabelaDoBanco(ev.dataTransfer);
    if (!t) return;
    ev.preventDefault();
    const p = ponto(ev);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (t.conexao && t.tipo === 'TABELA' && doc.tipo === 'logico') {
      setMensagem('Importando tabela do banco...');
      try {
        const r = await bancoApi.detalhes(t.conexao, t.schema, t.nome, t.tipo);
        let resultado = { criadas: 0, ausentes: [] as string[], diagnostico: [] as string[] };
        mutar((d) => {
          const forma = tabelaDoBancoParaForma(t, x, y);
          const r2 = ligarFksDaTabelaSolta(adicionarForma(d, forma), forma.id, r.fks ?? [], r.fksExportadas ?? []);
          resultado = r2;
          return r2.doc;
        });
        const partes = [`"${t.nome}" importada${resultado.criadas ? ` com ${resultado.criadas} ligação(ões)` : ''}`];
        if (resultado.ausentes.length) partes.push(`FK para tabela(s) fora do diagrama: ${resultado.ausentes.join(', ')} (arraste-as para ligar)`);
        setMensagem(partes.join(' - '));
        const total = (r.fks?.length ?? 0) + (r.fksExportadas?.length ?? 0);
        if (total === 0) setMensagem(`"${t.nome}" importada - o banco não informou FKs para essa tabela`);
        else if (resultado.diagnostico.length) abrirDialogo({ tipo: 'aviso', titulo: `Ligações de "${t.nome}"`, mensagem: `O banco informou ${total} coluna(s) de FK, mas ${resultado.criadas} ligação(ões) foram criadas.\n\n${resultado.diagnostico.join('\n')}` });
      } catch {
        setMensagem(`Erro ao importar FKs de "${t.nome}"; tabela criada sem ligações`);
        mutar((d) => adicionarForma(d, tabelaDoBancoParaForma(t, x, y)));
      }
      return;
    }
    mutar((d) => adicionarForma(d, tabelaDoBancoParaForma(t, x, y)));
  };

  //# Listener nativo (não passivo): o React registra onWheel como passivo e não deixaria impedir o zoom do navegador.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    let ultimoPasso = -1e9;
    const h = (ev: WheelEvent) => {
      if (!ev.ctrlKey) return;
      ev.preventDefault();
      const atual = abaAtiva()?.doc.zoom ?? 1;
      //# Passos de zoom (rodar para cima aproxima); o toque em touchpad gera rajadas, então há um intervalo mínimo.
      if (ev.timeStamp - ultimoPasso < 70) return;
      ultimoPasso = ev.timeStamp;
      const novo = ev.deltaY < 0 ? zoomMais(atual) : zoomMenos(atual);
      if (novo !== atual) mutar((d) => ({ ...d, zoom: novo }), { historico: false });
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, [areaRef]);

  //# "Editar texto" (F2 / menu de contexto) chega por evento, pois o editor inline é estado local do Canvas.
  const abrirEdicao = useCallback((id: string) => {
    const f = abaAtiva()?.doc.formas.find((x) => x.id === id);
    if (!f) return;
    const geo = FORMAS[f.kind]?.geo;
    if (geo === 'table' || geo === 'colecao') onEditar(f);
    else setEdicao({ id, valor: f.texto });
  }, [onEditar]);
  useEffect(() => {
    const h = (ev: Event) => abrirEdicao((ev as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener('modelforge:editar-texto', h);
    return () => window.removeEventListener('modelforge:editar-texto', h);
  }, [abrirEdicao]);
  //# Digitar sobre a forma selecionada começa a edição; "Reescrever ao digitar" apaga o texto anterior.
  useEffect(() => {
    const h = (ev: Event) => {
      const { id, tecla } = (ev as CustomEvent<{ id: string; tecla: string }>).detail;
      const f = abaAtiva()?.doc.formas.find((x) => x.id === id);
      if (!f) return;
      setEdicao({ id, valor: textoAoDigitar(f.texto, tecla, obterConfig().reescreverAoDigitar), digitado: true });
    };
    window.addEventListener('modelforge:digitar-texto', h);
    return () => window.removeEventListener('modelforge:digitar-texto', h);
  }, []);

  const unica = selecao.length === 1 ? doc.formas.find((f) => f.id === selecao[0]) : undefined;
  const ligUnica = selecao.length === 1 ? doc.ligacoes.find((l) => l.id === selecao[0]) : undefined;
  const caminhoSel = ligUnica ? caminhoDaLigacao(doc, ligUnica) : null;
  const orig = origem ? doc.formas.find((f) => f.id === origem) : undefined;
  const editando = edicao ? doc.formas.find((f) => f.id === edicao.id) : undefined;
  const realcados = e.realce && selecao.length ? idsRealcados(doc, selecao) : null;
  const opac = (id: string) => (realcados && !realcados.has(id) ? 0.2 : 1);
  const grade = cfg.larguraGrade;

  const cursor = e.ferramenta ? (cursorFerr ?? (e.ferramenta.tipo === 'apagar' ? 'not-allowed' : 'crosshair')) : 'default';

  return (
    <div className="area-canvas" ref={areaRef} onScroll={onScroll}>
      <div className="folha" style={{ width: doc.largura * z, height: doc.altura * z }}>
        <svg
          ref={raiz}
          className="canvas"
          width={doc.largura * z}
          height={doc.altura * z}
          style={{ cursor }}
          onPointerDown={aoPressionar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerLeave={() => setSobre(null)}
          onDoubleClick={aoDuploClique}
          onContextMenu={aoContexto}
          onDragOver={(ev) => { if (ev.dataTransfer.types.includes('application/x-modelforge-tabela')) ev.preventDefault(); }}
          onDrop={aoSoltarArquivo}
        >
          <defs>
            <pattern id="grade" width={grade} height={grade} patternUnits="userSpaceOnUse">
              <path d={`M${grade},0 H0 V${grade}`} fill="none" stroke="var(--grade)" strokeWidth={0.5} />
            </pattern>
          </defs>
          <g transform={`scale(${z})`}>
            {cfg.mostrarGrade && <rect width={doc.largura} height={doc.altura} fill="url(#grade)" />}
            {guias.x.map((x) => <line key={`gx${x}`} className="guia" x1={x} x2={x} y1={0} y2={doc.altura} />)}
            {guias.y.map((y) => <line key={`gy${y}`} className="guia" x1={0} x2={doc.largura} y1={y} y2={y} />)}
            {doc.ligacoes.map((l) => (
              <g key={l.id} opacity={opac(l.id)}>
                {cfg.dicas && <title>{`${LIGACOES[l.kind]?.rotulo ?? l.kind}${l.texto ? `: ${l.texto.split('\n')[0]}` : ''}${estaAncorada(l) ? ' (ancorado)' : ''}`}</title>}
                <LigacaoSvg l={l} doc={doc} selecionada={selecao.includes(l.id)} />
                {cfg.mostrarIds && (() => {
                  const c = caminhoDaLigacao(doc, l);
                  return c ? <text className="id-objeto" x={c.meio.x} y={c.meio.y + 12} textAnchor="middle">{l.id.slice(0, 6)}</text> : null;
                })()}
              </g>
            ))}
            {doc.formas.map((f) => (
              <g key={f.id} transform={`translate(${f.x},${f.y})`} data-forma={f.id} opacity={opac(f.id)}>
                {cfg.dicas && <title>{`${FORMAS[f.kind]?.rotulo ?? f.kind}${f.texto ? `: ${f.texto.split('\n')[0]}` : ''}${estaAncorada(f) ? ' (ancorado)' : ''}`}</title>}
                <FormaSvg f={f} doc={doc} />
                {selecao.includes(f.id) && (
                  <rect className="selecao" x={-2} y={-2} width={f.w + 4} height={f.h + 4} fill="none" />
                )}
                {origem === f.id && <rect className="selecao origem" x={-3} y={-3} width={f.w + 6} height={f.h + 6} fill="none" />}
                {cfg.mostrarIds && <text className="id-objeto" x={0} y={-4}>{f.id.slice(0, 6)}</text>}
                {estaAncorada(f) && <text className="id-objeto ancora" x={f.w - 2} y={-3} textAnchor="end">⚓</text>}
              </g>
            ))}
            {unica && !FORMAS[unica.kind]?.fixa && !estaAncorada(unica) && !e.ferramenta &&
              ALCAS.map((al) => {
                const cx = al.includes('w') ? unica.x : al.includes('e') ? unica.x + unica.w : unica.x + unica.w / 2;
                const cy = al.includes('n') ? unica.y : al.includes('s') ? unica.y + unica.h : unica.y + unica.h / 2;
                return (
                  <rect
                    key={al} className={`alca alca-${al}`} x={cx - 4} y={cy - 4} width={8} height={8}
                    onPointerDown={(ev) => iniciarAlca(ev, unica, al)}
                  />
                );
              })}
            {unica && unica.kind === 'tabela' && itemSel?.formaId === unica.id && (() => {
              const r = retanguloDoItem(unica, itemSel, unica.fonte?.tamanho ?? doc.fonte.tamanho);
              if (!r) return null;
              return <rect className="item-selecionado" x={unica.x + r.x} y={unica.y + r.y} width={r.w} height={r.h} fill="var(--selecao)" fillOpacity={0.18} stroke="var(--selecao)" pointerEvents="none" />;
            })()}
            {cfg.ancorador && unica && !e.ferramenta && !edicao && <Ancorador f={unica} doc={doc} />}
            {ligUnica && caminhoSel && !caminhoSel.laco && !estaAncorada(ligUnica) && !e.ferramenta && (
              <>
                {pontosDeDobra(ligUnica).map((q, i) => (
                  <circle key={i} className="alca ponto-dobra" cx={q.x} cy={q.y} r={5} onPointerDown={(ev) => iniciarPonto(ev, ligUnica.id, i)} />
                ))}
                {doc.tipo === 'conceitual' && ligUnica.kind === 'linha' && (['A', 'B'] as const).map((ponta) => {
                  const forma = doc.formas.find((x) => x.id === (ponta === 'A' ? ligUnica.de : ligUnica.para));
                  const cx = forma ? caixaDaCardinalidade(ligUnica, ponta, ponta === 'A' ? caminhoSel.a : caminhoSel.b, forma, { ...doc.fonte, ...(ligUnica.props.fonte as object ?? {}) } as FonteCard) : null;
                  return cx ? (
                    <rect key={`card${ponta}`} className="alca alca-texto" x={cx.x} y={cx.y} width={cx.w} height={cx.h} fill="transparent" onPointerDown={(ev) => iniciarCard(ev, ligUnica.id, ponta, deslocamentoCard(ligUnica, ponta))}>
                      <title>Arraste para mover a cardinalidade (Movimento manual)</title>
                    </rect>
                  ) : null;
                })}
                {aceitaPontaSolta(doc, ligUnica.kind) && (['A', 'B'] as const).map((ponta) => {
                  const q = ponta === 'A' ? caminhoSel.a : caminhoSel.b;
                  return <circle key={`ponta${ponta}`} className="alca ponto-dobra" cx={q.x} cy={q.y} r={6} onPointerDown={(ev) => iniciarPonta(ev, ligUnica.id, ponta)}><title>Arraste a ponta para uma forma, outra linha ou área vazia</title></circle>;
                })}
                {ligUnica.texto && (
                  <rect
                    className="alca alca-texto" x={caminhoSel.meio.x + Number(ligUnica.props.textoDx ?? 0) - 4} y={caminhoSel.meio.y + Number(ligUnica.props.textoDy ?? 0) - 12} width={8} height={8}
                    onPointerDown={(ev) => iniciarTexto(ev, ligUnica.id, Number(ligUnica.props.textoDx ?? 0), Number(ligUnica.props.textoDy ?? 0))}
                  >
                    <title>Arraste para mover o texto da linha</title>
                  </rect>
                )}
              </>
            )}
            {sobre?.tipo === 'forma' && (e.ferramenta?.tipo === 'ligacao' || arrasto.current?.tipo === 'ponta') && (() => {
              const f = doc.formas.find((x) => x.id === sobre.id);
              return f ? <g pointerEvents="none">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const c = pontoDeConexao(f, i); return <rect key={i} x={c.x - 2} y={c.y - 2} width={4} height={4} fill="orange" />; })}</g> : null;
            })()}
            {sobre && e.ferramenta && (() => {
              if (sobre.tipo === 'forma') {
                const f = doc.formas.find((x) => x.id === sobre.id);
                return f ? <rect className="sobre-ferramenta" x={f.x - 4} y={f.y - 4} width={f.w + 8} height={f.h + 8} rx={4} fill="none" pointerEvents="none" /> : null;
              }
              const l = doc.ligacoes.find((x) => x.id === sobre.id);
              const c = l ? caminhoDaLigacao(doc, l) : null;
              return c ? <path className="sobre-ferramenta" d={c.d} fill="none" pointerEvents="none" /> : null;
            })()}
            {unica && FORMAS[unica.kind]?.geo === 'lane' && !e.ferramenta && divisoriasDaRaia(unica).map((_, i) => {
              const a = alcaDaDivisoria(unica, i, unica.fonte?.tamanho ?? doc.fonte.tamanho);
              return a ? <rect key={`reg${i}`} className="alca alca-regiao" x={a.x} y={a.y} width={a.w} height={a.h} pointerEvents="none" /> : null;
            })}
            {orig && ponteiro && (
              <line className="guia" x1={centro(orig).x} y1={centro(orig).y} x2={ponteiro.x} y2={ponteiro.y} />
            )}
            {caixa && <rect className="caixa-selecao" x={caixa.x} y={caixa.y} width={caixa.w} height={caixa.h} />}
            {dim && (
              <text className="dimensoes" x={dim.x} y={Math.max(10, dim.y - 6)}>{`${dim.x}, ${dim.y}  ·  ${dim.w} × ${dim.h}`}</text>
            )}
          </g>
        </svg>
        {edicao && editando && (
          <textarea
            className="editor-texto"
            autoFocus
            style={{
              left: editando.x * z, top: editando.y * z, width: Math.max(editando.w, 90) * z, height: Math.max(editando.h, 30) * z,
              fontSize: doc.fonte.tamanho * z,
            }}
            value={edicao.valor}
            onFocus={(ev) => { if (edicao.digitado) ev.currentTarget.setSelectionRange(ev.currentTarget.value.length, ev.currentTarget.value.length); else if (cfg.reescreverAoDigitar) ev.currentTarget.select(); }}
            onChange={(ev) => setEdicao({ ...edicao, valor: ev.target.value })}
            onBlur={() => {
              mutar((d) => atualizarForma(d, edicao.id, { texto: edicao.valor }));
              setEdicao(null);
            }}
            onKeyDown={(ev) => {
              if (ev.key === 'Escape') setEdicao(null);
              if (ev.key === 'Enter' && !ev.shiftKey) (ev.target as HTMLTextAreaElement).blur();
              ev.stopPropagation();
            }}
          />
        )}
      </div>
      {menu && <MenuContexto x={menu.x} y={menu.y} itens={menu.itens} fechar={() => setMenu(null)} />}
    </div>
  );
}
