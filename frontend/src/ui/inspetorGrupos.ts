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

import { alfaPercentual } from '../editor/alfa';
import { capturarNaArea, soltarDaArea, atualizarForma, atualizarLigacao, atualizarProps } from '../editor/ops';
import { TIPOS_DESENHO, alturaProporcional, tipoDoDesenhador } from '../editor/desenhador';
import { areasDaRaia, estiloDaForma } from '../shapes/render';
import { FORMAS } from '../shapes/registry';
import { linhaMestreDe, linhasParaTexto, posicionarTextoNaLinha } from '../editor/textoApenso';
import { tamanhoAutomatico } from '../shapes/texto';
import { DIRECOES_TRIANGULO, girarDirecao } from '../shapes/caminhos';
import { mutar, selecionar } from '../editor/store';
import { escolherArquivo } from '../editor/arquivo';
import { Diagrama, Forma, Ligacao } from '../editor/types';
import { abrirDialogo } from './dialogos';
import { LIGACOES } from '../shapes/registry';
import { opcoesApenso, propsMovimentoManual } from '../editor/textoApenso';
import { areaDoDrawer, converterMedida, medidasDoDrawer, normalizarMargem, normalizarProporcao, tamanhoPelaMedida, temRegua } from '../editor/drawer';
import { Grupo, Prop } from './PropertyGrid';
import { area, bool, botao, comId, cor, forcarDesabilitado, leitura, num, sel, txt } from './propHelpers';
import { aplicarCondicoes, seFalso, seVerdadeiro } from './condicoes';

/** Grupos do Inspector de Texto, gradiente, Desenhador, Livre Drawer, Raia e formas Livres. */

const ROT_TIPO_TEXTO = ['Em branco', 'Nota', 'Colorido', 'Colorido arredondado'];
const VAL_TIPO_TEXTO = ['embranco', 'nota', 'retangulo', 'arredondado'] as const;
const ALINHAMENTOS = ['Centro', 'Esquerda', 'Direita'];
const DIRECOES_GRAD = ['Vertical', 'Horizontal'];
const ROT_DIR: Record<string, string> = { Up: 'Para cima', Right: 'Direita', Down: 'Para baixo', Left: 'Esquerda' };
const DIR_DE_ROT = Object.fromEntries(Object.entries(ROT_DIR).map(([k, v]) => [v, k]));

const mutForma = (id: string, fn: (f: Forma) => Forma) => mutar((d) => ({ ...d, formas: d.formas.map((x) => (x.id === id ? fn(x) : x)) }));
const apProps = (id: string, p: Record<string, unknown>) => mutar((d) => atualizarProps(d, id, p));
const tamFonte = (doc: Diagrama, f: Forma) => f.fonte?.tamanho ?? doc.fonte.tamanho;

// ------------------------------------------------------------------ Texto

export const tipoDeTexto = (f: Forma): (typeof VAL_TIPO_TEXTO)[number] => {
  const t = f.props.tipoTexto;
  return t === 'embranco' || t === 'retangulo' || t === 'arredondado' ? t : 'nota';
};

/** Ajusta w/h ao texto quando "Tamanho automático" está ligado no tipo Em branco. */
export function textoComAuto(doc: Diagrama, f: Forma): Forma {
  if (f.kind !== 'texto' || tipoDeTexto(f) !== 'embranco' || !f.props.autosize) return f;
  const t = tamanhoAutomatico(f.texto, tamFonte(doc, f), f.fonte?.negrito ?? doc.fonte.negrito);
  return { ...f, w: t.w, h: t.h };
}

/**
 * Grupos de gradiente/opacidade compartilhados. Estilo 'diagrama'
 * ("Cor da borda", "Gradiente", "Cor de início (Gradiente)"...) ou 'texto' (Texto: "Usar gradiente", "Cor início gradiente"...).
 * Sem gradiente marcado, cores/direção (e opacidade no estilo diagrama) ficam desabilitadas.
 */
export function gruposGradiente(f: Forma, opcoes: { detalhe?: boolean; titulo?: string; semAlfa?: boolean; estilo?: 'diagrama' | 'texto'; semBorda?: boolean } = {}): Grupo {
  const e = estiloDaForma(f);
  const ap = (p: Record<string, unknown>) => apProps(f.id, p);
  const texto = opcoes.estilo === 'texto';
  const dir = DIRECOES_GRAD.includes(e.dir) ? e.dir : 'Vertical';
  const props: Prop[] = [];
  if (!texto && !opcoes.semBorda) props.push(cor('Cor da borda', f.corBorda, (v) => apForma(f.id, { corBorda: v || undefined })));
  props.push(
    comId(bool(texto ? 'Usar gradiente' : 'Gradiente', e.gradiente, (v) => ap({ gradiente: v })), 'gradiente'),
    comId(cor(texto ? 'Cor início gradiente' : 'Cor de início (Gradiente)', e.c1, (v) => ap({ gradCor1: v || undefined })), 'gradCor1'),
    comId(cor(texto ? 'Cor fim gradiente' : 'Cor final (Gradiente)', e.c2, (v) => ap({ gradCor2: v || undefined })), 'gradCor2'),
  );
  if (opcoes.detalhe) {
    props.push(
      comId(bool('Desenhar detalhe', f.props.gradDetalhe !== false, (v) => ap({ gradDetalhe: v })), 'detalhe'),
      comId(cor('Cor do detalhe', String(f.props.gradCorDetalhe ?? '#666666'), (v) => ap({ gradCorDetalhe: v })), 'corDetalhe'),
    );
  }
  if (!opcoes.semAlfa) props.push(comId(num('Opaco em %', Math.round(e.alfa * 100), (v) => ap({ alfa: alfaPercentual(v) }), 0, 100), 'alfa'));
  props.push(comId(sel('Direção do gradiente', dir, DIRECOES_GRAD, (v) => ap({ gradDir: v })), 'gradDir'));
  const regras = [seVerdadeiro('gradiente', ['gradCor1', 'gradCor2', 'gradDir', ...(texto ? ['detalhe', 'corDetalhe'] : ['alfa'])])];
  if (opcoes.detalhe) regras.push(seVerdadeiro('detalhe', ['corDetalhe']));
  return { titulo: opcoes.titulo ?? (texto ? 'Gradiente' : 'Pintura em gradiente'), props: aplicarCondicoes(props, regras) };
}

const apForma = (id: string, patch: Partial<Forma>) => mutForma(id, (x) => ({ ...x, ...patch }));

export function gruposTexto(doc: Diagrama, f: Forma): Grupo[] {
  const p = f.props;
  const tipo = tipoDeTexto(f);
  const ap = (v: Record<string, unknown>) => mutar((d) => {
    const n = atualizarProps(d, f.id, v);
    return { ...n, formas: n.formas.map((x) => (x.id === f.id ? textoComAuto(n, x) : x)) };
  });
  const colorido = tipo === 'retangulo' || tipo === 'arredondado';
  const e = estiloDaForma(f);
  const rotTipo = ROT_TIPO_TEXTO[VAL_TIPO_TEXTO.indexOf(tipo)];
  //# Ordem e condições das propriedades do Texto: o tipo (Em branco/Nota/Colorido...) habilita gradiente, sombra, detalhe e opacidade.
  const idxTipo = (v: unknown) => ROT_TIPO_TEXTO.indexOf(String(v));
  const principais: Prop[] = [
    txt('Título/Nome', String(p.titulo ?? ''), (v) => ap({ titulo: v })),
    bool('Pintar o título', !!p.pintarTitulo, (v) => ap({ pintarTitulo: v })),
    sel('Alinhamento', String(p.alinhamento ?? 'Centro'), ALINHAMENTOS, (v) => ap({ alinhamento: v })),
    bool('Centrar (vertical)', !!p.centrarVertical, (v) => ap({ centrarVertical: v })),
    comId(num('Opaco em %', Math.round(e.alfa * 100), (v) => ap({ alfa: alfaPercentual(v) }), 0, 100), 'alfa'),
    comId(sel('Tipo', rotTipo, ROT_TIPO_TEXTO, (v) => ap({ tipoTexto: VAL_TIPO_TEXTO[Math.max(0, ROT_TIPO_TEXTO.indexOf(v))] })), 'tipo'),
    comId(cor('Cor de fundo', String(p.corFundo ?? '#ffffff'), (v) => ap({ corFundo: v || undefined })), 'corFundo'),
    comId(bool('Sombreado', p.sombra !== false, (v) => ap({ sombra: v })), 'sombra'),
    comId(cor('Cor sombreado', String(p.corSombra ?? '#333333'), (v) => ap({ corSombra: v })), 'corSombra'),
    comId(bool('Tamanho automático', !!p.autosize, (v) => ap({ autosize: v })), 'autosize'),
  ];
  const grad = gruposGradiente(f, { detalhe: true, titulo: 'Gradiente', semAlfa: true, estilo: 'texto' });
  const todas = aplicarCondicoes([...principais, ...grad.props], [
    { fonte: 'tipo', habilitaSe: (v) => [2, 3].includes(idxTipo(v)), afetados: ['detalhe', 'corDetalhe', 'corSombra', 'sombra'] },
    { fonte: 'tipo', habilitaSe: (v) => [1, 2, 3].includes(idxTipo(v)), afetados: ['gradiente', 'gradCor1', 'gradCor2', 'gradDir', 'alfa'] },
    { fonte: 'tipo', habilitaSe: (v) => idxTipo(v) === 0, afetados: ['autosize'] },
    seVerdadeiro('gradiente', ['gradCor1', 'gradCor2', 'gradDir', 'detalhe', 'corDetalhe']),
    seFalso('gradiente', ['corFundo']),
    seVerdadeiro('sombra', ['corSombra']),
    seVerdadeiro('detalhe', ['corDetalhe']),
  ]);
  const grupos: Grupo[] = [
    { titulo: 'Texto', props: todas.slice(0, principais.length) },
    { titulo: grad.titulo, props: todas.slice(principais.length) },
  ];
  void colorido;
  //# Texto atrelado a uma linha (SetLinhaMestreInt): posiciona no meio da linha; "Movimento manual" solta.
  const linhas = linhasParaTexto(doc);
  const atual = linhaMestreDe(f);
  const rot = ['(selecione)', ...linhas.map((x) => x.rotulo)];
  const idx = linhas.findIndex((x) => x.l.id === atual);
  const relacao: Prop[] = [];
  if (atual) relacao.push(bool('Movimento manual', !!p.movimentacaoManual, (v) => mutar((d) => {
    const n = atualizarProps(d, f.id, { movimentacaoManual: v });
    return v ? n : posicionarTextoNaLinha(n, f.id);
  })));
  relacao.push(linhas.length
    ? sel('Descrição da ligação', rot[idx + 1] ?? rot[0], rot, (v) => {
      const i = rot.indexOf(v) - 1;
      mutar((d) => {
        const n = atualizarProps(d, f.id, { linhaMestre: i >= 0 ? linhas[i].l.id : undefined, movimentacaoManual: false });
        return i >= 0 ? posicionarTextoNaLinha(n, f.id) : n;
      });
    })
    : leitura('Descrição da ligação', ''));
  grupos.push({ titulo: 'Em relação às linhas', props: relacao });
  return grupos;
}

// ------------------------------------------------------------------ Desenhador

function lerImagem(arq: File): Promise<{ src: string; w: number; h: number }> {
  return new Promise((ok, no) => {
    const r = new FileReader();
    r.onerror = () => no(new Error('não foi possível ler a imagem'));
    r.onload = () => {
      const src = String(r.result);
      const img = new Image();
      img.onerror = () => no(new Error('arquivo de imagem inválido'));
      img.onload = () => ok({ src, w: img.naturalWidth, h: img.naturalHeight });
      img.src = src;
    };
    r.readAsDataURL(arq);
  });
}

export async function carregarImagemNaForma(id: string): Promise<void> {
  const arq = await escolherArquivo('image/*');
  if (!arq) return;
  const im = await lerImagem(arq);
  mutar((d) => {
    const f = d.formas.find((x) => x.id === id);
    if (!f) return d;
    //# Vira Imagem e a altura acompanha a proporção da imagem.
    const h = alturaProporcional(f.w, im.w, im.h) || f.h;
    return atualizarForma(d, id, { h, props: { ...f.props, tipoDesenho: 'imagem', src: im.src, imgNome: arq.name, imgW: im.w, imgH: im.h, itens: [] } });
  });
}

export function gruposDesenhador(f: Forma): Grupo[] {
  const tipo = tipoDoDesenhador(f);
  const ap = (p: Record<string, unknown>) => apProps(f.id, p);
  const rot = TIPOS_DESENHO.map((t) => t.rotulo);
  const trocar = (v: string) => {
    const novo = TIPOS_DESENHO[Math.max(0, rot.indexOf(v))].valor;
    if (novo === tipo) return;
    const fazer = () => ap({ tipoDesenho: novo, src: undefined, imgNome: '', imgW: 0, imgH: 0, itens: [] });
    //# Trocar o tipo do Desenhador pede confirmação: o desenho atual é perdido.
    if (f.props.src || (Array.isArray(f.props.itens) && f.props.itens.length)) {
      abrirDialogo({ tipo: 'confirmar', titulo: 'Desenho', mensagem: 'Trocar o tipo: o desenho atual será perdido. Continuar?', aoConfirmar: fazer });
    } else fazer();
  };
  const w = Number(f.props.imgW ?? 0);
  const h = Number(f.props.imgH ?? 0);
  const p = f.props;
  const idxTipo = (v: unknown) => rot.indexOf(String(v));
  //# Todas as linhas aparecem; o Tipo (Linha/Imagem/Desenho livre) habilita o grupo que vale.
  const props: Prop[] = [
    comId(sel('Tipo', TIPOS_DESENHO.find((t) => t.valor === tipo)!.rotulo, rot, trocar), 'tipo'),
    comId(botao('Abrir imagem', 'Carregar imagem...', () => { void carregarImagemNaForma(f.id); }), 'imagem'),
    comId(num('Opaco em %', typeof p.alfa === 'number' ? p.alfa : 100, (v) => ap({ alfa: alfaPercentual(v) }), 0, 100), 'alfa'),
    comId(leitura('Arquivo', String(p.imgNome ?? '')), 'arquivo'),
    comId(leitura('Tamanho (L, A)', `(${w} ,${h})`), 'tamanhoImg'),
    comId(botao('Proporcional', 'Proporcional', () => mutar((d) => {
      const x = d.formas.find((k) => k.id === f.id);
      const nh = x ? alturaProporcional(x.w, w, h) : 0;
      return x && nh ? atualizarForma(d, f.id, { h: nh }) : d;
    })), 'proporcional'),
    comId(num('Ângulo da linha', Number(p.anguloSeta ?? 0), (v) => ap({ anguloSeta: v })), 'angulo'),
    comId(cor('Cor da linha', String(p.setaCor ?? '#000000'), (v) => ap({ setaCor: v || '#000000' })), 'setaCor'),
    comId(num('Largura da seta', Number(p.setaLargura ?? 2), (v) => ap({ setaLargura: Math.max(1, v) }), 1), 'setaLargura'),
    comId(num('Desviar (horizontal em graus)', Number(p.desvioX ?? 0), (v) => ap({ desvioX: v })), 'desvioX'),
    comId(num('Desviar (vertical em graus)', Number(p.desvioY ?? 0), (v) => ap({ desvioY: v })), 'desvioY'),
    comId(bool('Seta a ponta "A"', p.pontaDireita !== false, (v) => ap({ pontaDireita: v })), 'pontaA'),
    comId(bool('Seta ponta "B"', p.pontaEsquerda !== false, (v) => ap({ pontaEsquerda: v })), 'pontaB'),
    comId(botao('Editor de desenhos', 'Editar desenho...', () => abrirDialogo({ tipo: 'd', nome: 'desenhador', id: f.id })), 'editor'),
  ];
  return [{
    titulo: 'Desenho',
    props: aplicarCondicoes(props, [
      { fonte: 'tipo', habilitaSe: (v) => idxTipo(v) === 0, afetados: ['angulo', 'setaCor', 'setaLargura', 'desvioX', 'desvioY', 'pontaA', 'pontaB'] },
      { fonte: 'tipo', habilitaSe: (v) => idxTipo(v) === 1, afetados: ['imagem', 'alfa', 'arquivo', 'tamanhoImg', 'proporcional'] },
      { fonte: 'tipo', habilitaSe: (v) => idxTipo(v) === 2, afetados: ['editor'] },
    ]),
  }];
}

/** Propriedades do LivreDrawer. */
export function gruposDrawer(f: Forma): Grupo[] {
  const m = medidasDoDrawer(f);
  const A = areaDoDrawer(f, m);
  const ap = (p: Record<string, unknown>) => apProps(f.id, p);
  const tamanho = (eixo: 'w' | 'h') => (t: string) => {
    const n = tamanhoPelaMedida(t, m);
    if (n !== null && n > 0) mutar((d) => atualizarForma(d, f.id, { [eixo]: n } as Partial<Forma>));
  };
  const medidas: Prop[] = [
    txt('Unidade de medida', m.unidade, (v) => ap({ unidadeMedida: v })),
    num('Quantidade de pixel', m.px, (v) => ap({ proporcaoPx: normalizarProporcao(v) }), 1),
    num('Equivalência da unidade', m.medida, (v) => ap({ proporcaoMedida: normalizarProporcao(v) }), 1),
    bool('Régua à esquerda', m.esq, (v) => ap({ metricaEsq: v })),
    bool('Régua à acima', m.topo, (v) => ap({ metricaTopo: v })),
    bool('Régua abaixo', m.baixo, (v) => ap({ metricaBaixo: v })),
    bool('Régua à direita', m.dir, (v) => ap({ metricaDir: v })),
    txt('Largura (régua)', converterMedida(A.W, m), tamanho('w')),
    txt('Altura (régua)', converterMedida(A.H, m), tamanho('h')),
    cor('Cor da régua', m.corRegua, (v) => ap({ corRegua: v || undefined })),
    num('Margem', m.margem, (v) => ap({ margem: normalizarMargem(v, f.w, f.h) }), 0),
    forcarDesabilitado(bool('Mostrar texto', m.mostrarTexto, (v) => ap({ mostrarTextoRegua: v })), !temRegua(m)),
  ];
  const forma: Prop[] = aplicarCondicoes([
    comId(bool('Pintar quadro', m.pintarBorda, (v) => ap({ pintarBorda: v })), 'pintar'),
    comId(cor('Cor quadro', f.corBorda, (v) => apForma(f.id, { corBorda: v || undefined })), 'corBorda'),
    comId(num('Cantos arredondados', m.roundrect, (v) => ap({ roundrect: Math.max(0, v) }), 0), 'roundrect'),
    bool('Delimitar título', m.delimite, (v) => ap({ delimite: v })),
  ], [seVerdadeiro('pintar', ['corBorda', 'roundrect'])]);
  return [
    { titulo: 'Réguas e unidade de medida', props: medidas },
    {
      titulo: 'Editor de imagens',
      props: [
        botao('Editor de desenhos', 'Editar desenho...', () => abrirDialogo({ tipo: 'd', nome: 'drawer', id: f.id })),
        botao('Desenhar com o mouse', 'Desenhar...', () => abrirDialogo({ tipo: 'd', nome: 'desenhador', id: f.id })),
      ],
    },
    { titulo: 'Forma', props: forma },
    gruposGradiente(f, { semBorda: true }),
  ];
}

// ------------------------------------------------------------------ Raia

export function gruposRaia(doc: Diagrama, f: Forma): Grupo[] {
  const ap = (p: Record<string, unknown>) => apProps(f.id, p);
  const capturados = Array.isArray(f.props.capturados) ? (f.props.capturados as string[]).filter((id) => doc.formas.some((x) => x.id === id)) : [];
  const areas = areasDaRaia(f);
  const setAreas = (n: typeof areas) => ap({ areas: n });
  const nomeArea = () => {
    const usados = new Set([String(f.props.areaPadrao ?? 'Área default'), ...areas.map((a) => a.texto)]);
    let n = 1;
    while (usados.has(`Área_${n}`)) n++;
    return `Área_${n}`;
  };
  const grupos: Grupo[] = [
    gruposGradiente(f, { titulo: 'Gradiente' }),
    {
      titulo: 'Aparência',
      props: [bool('Serrilhada', !!f.props.dashed, (v) => ap({ dashed: v }))],
    },
    {
      titulo: 'Comportamento',
      props: [
        bool('Movimentar artefatos', f.props.moverCapturados !== false, (v) => ap({ moverCapturados: v })),
        bool('Captura artefatos', f.props.autoCaptura !== false, (v) => ap({ autoCaptura: v })),
        botao('Fixar artefatos', 'Capturar', () => mutar((d) => capturarNaArea(d, f.id))),
        botao('Liberar artefatos', 'Liberar', () => mutar((d) => soltarDaArea(d, f.id))),
        leitura('Capturados', capturados.length),
        ...capturados.map((id) => {
          const x = doc.formas.find((k) => k.id === id)!;
          return botao(FORMAS[x.kind]?.rotulo ?? x.kind, x.texto || x.kind, () => selecionar([id]));
        }),
      ],
    },
    {
      titulo: 'Área',
      props: [
        txt('Área default', String(f.props.areaPadrao ?? 'Área default'), (v) => ap({ areaPadrao: v })),
        botao('Adicionar', 'Adicionar área', () => setAreas([...areas, { texto: nomeArea(), largura: Math.max(Math.trunc(f.w / (areas.length + 2)), 20) }])),
      ],
    },
  ];
  areas.forEach((a, i) => grupos.push({
    titulo: `Área ${i + 1}`,
    props: [
      txt('Área', a.texto, (v) => setAreas(areas.map((x, k) => (k === i ? { ...x, texto: v } : x)))),
      num('Largura', a.largura, (v) => setAreas(areas.map((x, k) => (k === i ? { ...x, largura: Math.max(1, v) } : x))), 1),
      botao('Excluir', 'Excluir', () => setAreas(areas.filter((_, k) => k !== i))),
    ],
  }));
  return grupos;
}


// ------------------------------------------------------------------ Livre

export function gruposLivre(f: Forma): Grupo[] {
  const e = estiloDaForma(f);
  const ap = (p: Record<string, unknown>) => apProps(f.id, p);
  const grupos: Grupo[] = [];
  if (f.kind === 'livreJuncao') return grupos;
  if (f.kind === 'livreTriangulo') {
    const dir = String(f.props.direcao ?? 'Right');
    grupos.push({
      titulo: 'Triângulo',
      props: [
        sel('Direção', ROT_DIR[dir] ?? 'Direita', DIRECOES_TRIANGULO.map((d) => ROT_DIR[d]), (v) => ap({ direcao: DIR_DE_ROT[v] ?? 'Right' })),
        botao('Girar', 'Girar', () => ap({ direcao: girarDirecao(dir) })),
      ],
    });
  }
  if (f.kind === 'livreSuperTexto') {
    grupos.push({
      titulo: 'Texto',
      props: [
        sel('Alinhamento', String(f.props.alinhamento ?? 'Centro'), ALINHAMENTOS, (v) => ap({ alinhamento: v })),
        bool('Centrar (vertical)', f.props.centrarVertical !== false, (v) => ap({ centrarVertical: v })),
      ],
    });
  }
  grupos.push({ titulo: 'Desenho', props: [bool('Serrilhada', !!f.props.dashed, (v) => ap({ dashed: v })), num('Opaco em %', Math.round(e.alfa * 100), (v) => ap({ alfa: alfaPercentual(v) }), 0, 100)] });
  grupos.push(gruposGradiente(f, { titulo: 'Gradiente', semAlfa: true }));
  return grupos;
}


// ------------------------------------------------------------------ texto apenso de ligação

/**
 * Propriedades do texto apenso:
 * Alinhamento, Centrar (vertical), Cor do texto, Tamanho automático, Movimento manual e, no Livre, título, tipo,
 * opacidade, fundo, sombreado e gradiente (com as mesmas condições do Texto).
 */
export function gruposTextoApenso(doc: Diagrama, l: Ligacao): Grupo[] {
  const def = LIGACOES[l.kind];
  if (!def?.apenso) return [];
  const o = opcoesApenso(l);
  const ap = (p: Record<string, unknown>) => mutar((d) => atualizarLigacao(d, l.id, { props: { ...l.props, ...p } }));
  const relacao = (): Grupo => ({
    titulo: 'Em relação às linhas',
    props: [bool('Movimento manual', o.manual, (v) => mutar((d) => atualizarLigacao(d, l.id, { props: propsMovimentoManual(l, v) })))],
  });
  const base: Prop[] = [
    sel('Alinhamento', o.alinhamento, ALINHAMENTOS, (v) => ap({ textoAlinhamento: v })),
    bool('Centrar (vertical)', o.centrarVertical, (v) => ap({ textoCentrarVertical: v })),
    cor('Cor do texto', o.corTexto ?? '', (v) => ap({ textoCor: v || undefined })),
  ];
  if (def.apenso === 'fluxo') return [{ titulo: 'Texto', props: base }, relacao()];
  if (def.apenso === 'atividade') return [{ titulo: 'Texto', props: [...base, bool('Tamanho automático', o.autosize, (v) => ap({ textoAutosize: v }))] }, relacao()];
  //# Livre: mesma estrutura e condições do Texto.
  const idxTipo = (v: unknown) => ROT_TIPO_TEXTO.indexOf(String(v));
  const principais: Prop[] = [
    txt('Título/Nome', o.titulo, (v) => ap({ textoTitulo: v })),
    bool('Pintar o título', o.pintarTitulo, (v) => ap({ textoPintarTitulo: v })),
    ...base.slice(0, 2),
    comId(num('Opaco em %', o.alfa, (v) => ap({ textoAlfa: Math.min(100, Math.max(0, v)) }), 0, 100), 'alfa'),
    comId(sel('Tipo', ROT_TIPO_TEXTO[VAL_TIPO_TEXTO.indexOf(o.tipo)], ROT_TIPO_TEXTO, (v) => ap({ textoTipo: VAL_TIPO_TEXTO[Math.max(0, ROT_TIPO_TEXTO.indexOf(v))] })), 'tipo'),
    comId(cor('Cor de fundo', o.corFundo, (v) => ap({ textoCorFundo: v || undefined })), 'corFundo'),
    base[2],
    comId(bool('Sombreado', o.sombra, (v) => ap({ textoSombra: v })), 'sombra'),
    comId(cor('Cor sombreado', o.corSombra, (v) => ap({ textoCorSombra: v })), 'corSombra'),
    comId(bool('Tamanho automático', o.autosize, (v) => ap({ textoAutosize: v })), 'autosize'),
  ];
  const grad: Prop[] = [
    comId(bool('Usar gradiente', o.gradiente, (v) => ap({ textoGradiente: v })), 'gradiente'),
    comId(cor('Cor início gradiente', o.gradCor1, (v) => ap({ textoGradCor1: v || undefined })), 'gradCor1'),
    comId(cor('Cor fim gradiente', o.gradCor2, (v) => ap({ textoGradCor2: v || undefined })), 'gradCor2'),
    comId(bool('Desenhar detalhe', o.gradDetalhe, (v) => ap({ textoGradDetalhe: v })), 'detalhe'),
    comId(cor('Cor do detalhe', o.gradCorDetalhe, (v) => ap({ textoGradCorDetalhe: v })), 'corDetalhe'),
    comId(sel('Direção do gradiente', o.gradDir, DIRECOES_GRAD, (v) => ap({ textoGradDir: v })), 'gradDir'),
  ];
  const todas = aplicarCondicoes([...principais, ...grad], [
    { fonte: 'tipo', habilitaSe: (v) => [2, 3].includes(idxTipo(v)), afetados: ['detalhe', 'corDetalhe', 'corSombra', 'sombra'] },
    { fonte: 'tipo', habilitaSe: (v) => [1, 2, 3].includes(idxTipo(v)), afetados: ['gradiente', 'gradCor1', 'gradCor2', 'gradDir', 'alfa'] },
    { fonte: 'tipo', habilitaSe: (v) => idxTipo(v) === 0, afetados: ['autosize'] },
    seVerdadeiro('gradiente', ['gradCor1', 'gradCor2', 'gradDir', 'detalhe', 'corDetalhe']),
    seFalso('gradiente', ['corFundo']),
    seVerdadeiro('sombra', ['corSombra']),
    seVerdadeiro('detalhe', ['corDetalhe']),
  ]);
  void doc;
  return [
    { titulo: 'Texto', props: todas.slice(0, principais.length) },
    { titulo: 'Gradiente', props: todas.slice(principais.length) },
    relacao(),
  ];
}
