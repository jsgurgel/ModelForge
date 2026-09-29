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

import { capturarNaArea, soltarDaArea, atualizarForma, atualizarLigacao, atualizarProps } from '../editor/ops';
import { ItemLegenda, TIPOS_LEGENDA, adicionarItem, artefatosDoDiagrama, capturarCores, itensDaLegenda, legendaComItens, removerItem, tipoDaLegenda, trocarTipoLegenda } from '../editor/legenda';
import { TIPOS_DESENHO, alturaProporcional, tipoDoDesenhador } from '../editor/desenhador';
import { TEXTO_VALIDADE, alternarFk, alternarPk, alternarUnique, alternarVariante, constraintVazia, ddlDaTabela, layoutTabela, moverItem, nomeDaConstraint, opcoesDaTabela, propsTabela, removerCampo, sincronizarFlags, validarConstraint, VARIANTE_ALTERNATIVA } from '../editor/logico';
import { areasDaRaia, estiloDaForma } from '../shapes/render';
import { FORMAS, LIGACOES } from '../shapes/registry';
import { organizarBarraEap, organizarEapCompleto, direcaoDaBarra, distanciaDaBarra, posicaoDaBarra, LARG_BARRA } from '../editor/organizar';
import { linhaMestreDe, linhasParaTexto, posicionarTextoNaLinha } from '../editor/textoApenso';
import { tamanhoAutomatico } from '../shapes/texto';
import { DIRECOES_TRIANGULO, girarDirecao } from '../shapes/caminhos';
import { mutar, selecionar } from '../editor/store';
import { CARDS_LOGICO, cardsDaLinha, definirCardinalidade, definirSetaAutomatica, setaAutomatica } from '../editor/logicoLinha';
import { escolherArquivo } from '../editor/arquivo';
import { CampoTabela, ConstraintTabela, Diagrama, Forma, GatilhoTabela, IndiceTabela, Ligacao, TipoConstraint, novoId } from '../editor/types';
import { abrirDialogo } from './dialogos';
import { Grupo, Prop } from './PropertyGrid';
import { area, bool, botao, cor, forcarDesabilitado, leitura, num, sel, txt } from './propHelpers';

/**
 * Grupos do Inspector específicos de Texto, Legenda, Desenhador, Raia, barra da EAP, formas Livres, Lógico e ligações
 *.
 */

export { tipoDeTexto, textoComAuto, gruposGradiente, gruposTexto, carregarImagemNaForma, gruposDesenhador, gruposDrawer, gruposRaia, gruposLivre, gruposTextoApenso } from './inspetorGrupos';

export type Sub = { forma: string; tipo: 'campo' | 'constraint' | 'indice' | 'gatilho'; id: string } | null;

const ROT_TIPO_TEXTO = ['Em branco', 'Nota', 'Colorido', 'Colorido arredondado'];
const VAL_TIPO_TEXTO = ['embranco', 'nota', 'retangulo', 'arredondado'] as const;
const ALINHAMENTOS = ['Centro', 'Esquerda', 'Direita'];
const DIRECOES_GRAD = ['Vertical', 'Horizontal', 'Diagonal'];
const ROT_DIR: Record<string, string> = { Up: 'Para cima', Right: 'Direita', Down: 'Para baixo', Left: 'Esquerda' };
const DIR_DE_ROT = Object.fromEntries(Object.entries(ROT_DIR).map(([k, v]) => [v, k]));

const mutForma = (id: string, fn: (f: Forma) => Forma) => mutar((d) => ({ ...d, formas: d.formas.map((x) => (x.id === id ? fn(x) : x)) }));
const apProps = (id: string, p: Record<string, unknown>) => mutar((d) => atualizarProps(d, id, p));

/** Fonte efetiva (forma > diagrama) para o cálculo de tamanho. */
const tamFonte = (doc: Diagrama, f: Forma) => f.fonte?.tamanho ?? doc.fonte.tamanho;

// ------------------------------------------------------------------ Legenda

export function gruposLegenda(doc: Diagrama, f: Forma): Grupo[] {
  const tam = tamFonte(doc, f);
  const tipo = tipoDaLegenda(f);
  const itens = itensDaLegenda(f);
  const artefatos = artefatosDoDiagrama(doc);
  const setF = (novo: Forma) => mutForma(f.id, () => novo);
  const editaItem = (i: number, patch: Partial<ItemLegenda>) => setF({ ...legendaComItens(f, itens.map((x, k) => (k === i ? { ...x, ...patch } : x)), tam), props: { ...f.props, itens: itens.map((x, k) => (k === i ? { ...x, ...patch } : x)), itemSel: i } });
  const rotTipo = TIPOS_LEGENDA.map((t) => t.rotulo);
  const principal: Prop[] = [
    cor('Cor da borda', String(f.props.corBordaLegenda ?? '#c0c0c0'), (v) => apProps(f.id, { corBordaLegenda: v || undefined })),
    sel('Tipo de legenda', TIPOS_LEGENDA.find((t) => t.valor === tipo)!.rotulo, rotTipo, (v) => setF(trocarTipoLegenda(f, TIPOS_LEGENDA[Math.max(0, rotTipo.indexOf(v))].valor, tam))),
  ];
  const desenho: Prop[] = [];
  desenho.push({ ...botao('Editor de legenda', 'Editar legenda...', () => abrirDialogo({ tipo: 'd', nome: 'legenda', id: f.id })), desabilitado: tipo === 'objetos' });
  desenho.push(botao('Adicionar', 'Adicionar item', () => setF(adicionarItem(f, tam))));
  desenho.push({ ...botao('Capturar cores', 'Capturar cores', () => mutar((d) => ({ ...d, formas: d.formas.map((x) => (x.id === f.id ? capturarCores(d, x) : x)) }))), desabilitado: tipo !== 'cores' });
  const grupos: Grupo[] = [{ titulo: 'Legenda', props: principal }, { titulo: 'Desenho', props: desenho }];
  itens.forEach((it, i) => {
    const props: Prop[] = [
      txt('Descrição', it.texto, (v) => editaItem(i, { texto: v })),
      cor('Cor', it.cor, (v) => editaItem(i, { cor: v || '#000000' })),
    ];
    if (tipo === 'objetos') {
      props.push(sel('Artefatos', artefatos[it.tag]?.rotulo ?? artefatos[0]?.rotulo ?? '', artefatos.map((a) => a.rotulo), (v) => editaItem(i, { tag: Math.max(0, artefatos.findIndex((a) => a.rotulo === v)) })));
    }
    props.push(botao('Excluir', 'Excluir', () => setF(removerItem(f, i, tam))));
    grupos.push({ titulo: f.props.itemSel === i ? 'Legenda selecionada' : `Legenda ${i + 1}`, props });
  });
  return grupos;
}

// ------------------------------------------------------------------ EAP

export function gruposBarraEap(f: Forma): Grupo[] {
  const dir = direcaoDaBarra(f);
  const setDirecao = (v: string) => mutar((d) => {
    const nova = v === 'Vertical' ? 'Vertical' : 'Horizontal';
    let n = atualizarProps(d, f.id, { direcao: nova });
    const b = n.formas.find((x) => x.id === f.id)!;
    //# A barra vira fina (LARG_ALT) e o comprimento vai para o outro eixo.
    if (nova === 'Vertical' && b.w > LARG_BARRA) n = atualizarForma(n, f.id, { h: b.w, w: LARG_BARRA });
    else if (nova === 'Horizontal' && b.h > LARG_BARRA) n = atualizarForma(n, f.id, { w: b.h, h: LARG_BARRA });
    return nova !== dir ? organizarBarraEap(n, f.id) : n;
  });
  const props: Prop[] = [sel('Direção', dir, ['Vertical', 'Horizontal'], setDirecao)];
  props.push({ ...sel('Posição', posicaoDaBarra(f), ['Centro', 'Esquerda', 'Direita'], (v) => mutar((d) => organizarBarraEap(atualizarProps(d, f.id, { posicao: v }), f.id))), desabilitado: dir !== 'Horizontal' });
  props.push(
    num('Distância', distanciaDaBarra(f), (v) => apProps(f.id, { distancia: Math.max(0, v) }), 0),
    botao('Organizar', 'Organizar', () => mutar((d) => organizarBarraEap(d, f.id))),
    botao('Organizar tudo', 'Organizar tudo', () => mutar((d) => organizarEapCompleto(d, f.id))),
  );
  return [{ titulo: 'Organização', props }];
}

// ------------------------------------------------------------------ Ligações


/** Grupos extras de uma ligação: condição (Sim/Não), texto (deslocamento), fonte própria, pontos de dobra, cardinalidade lógica. */
export function gruposLigacao(doc: Diagrama, l: Ligacao): Grupo[] {
  const def = LIGACOES[l.kind];
  const grupos: Grupo[] = [];
  const upd = (patch: Partial<Ligacao>) => mutar((d) => atualizarLigacao(d, l.id, patch));
  const ap = (p: Record<string, unknown>) => upd({ props: { ...l.props, ...p } });
  const de = doc.formas.find((f) => f.id === l.de);

  if (def.apenso === 'fluxo' || (l.kind === 'fluxLigacao' && de?.kind === 'fluxDecisao')) {
    grupos.push({
      titulo: 'Condição',
      props: [sel('Condição', l.texto === 'Não' ? 'Não' : l.texto === 'Sim' ? 'Sim' : '(nenhuma)', ['(nenhuma)', 'Sim', 'Não'], (v) => upd({ texto: v === '(nenhuma)' ? '' : v, props: { ...l.props, positivo: v === 'Sim' } }))],
    });
  }
  if (l.kind === 'logicoLinha') {
    grupos.push({
      titulo: 'Cardinalidade',
      props: [
        sel('Cardinalidade A', cardsDaLinha(l).a, [...CARDS_LOGICO], (v) => mutar((d) => atualizarLigacao(d, l.id, definirCardinalidade(l, 'A', v)))),
        sel('Cardinalidade B', cardsDaLinha(l).b, [...CARDS_LOGICO], (v) => mutar((d) => atualizarLigacao(d, l.id, definirCardinalidade(l, 'B', v)))),
        bool('Seta automática', setaAutomatica(l), (v) => mutar((d) => atualizarLigacao(d, l.id, definirSetaAutomatica(l, v)))),
      ],
    });
  }
  const fonte = (l.props.fonte ?? {}) as { nome?: string; tamanho?: number; negrito?: boolean; italico?: boolean };
  const estiloAtual = `${fonte.negrito ?? doc.fonte.negrito ? 'Negrito' : ''}${fonte.italico ?? doc.fonte.italico ? ' itálico' : ''}`.trim() || 'Normal';
  const ESTILOS = ['Normal', 'Negrito', 'Itálico', 'Negrito itálico'];
  const nomeEstilo = ESTILOS.find((e) => e.toLowerCase() === estiloAtual.toLowerCase()) ?? 'Normal';
  grupos.push({
    titulo: 'Texto da ligação',
    props: [
      num('Deslocar texto (horizontal)', Number(l.props.textoDx ?? 0), (v) => ap({ textoDx: v })),
      num('Deslocar texto (vertical)', Number(l.props.textoDy ?? 0), (v) => ap({ textoDy: v })),
      txt('Nome fonte', fonte.nome ?? doc.fonte.nome, (v) => ap({ fonte: { ...fonte, nome: v || undefined } })),
      num('Tamanho da fonte', fonte.tamanho ?? doc.fonte.tamanho, (v) => ap({ fonte: { ...fonte, tamanho: Math.max(6, v) } }), 6),
      sel('Estilo da fonte', nomeEstilo, ESTILOS, (v) => ap({ fonte: { ...fonte, negrito: v.includes('Negrito'), italico: v.includes('tálico') } })),
    ],
  });
  const pontos = Array.isArray(l.props.pontos) ? (l.props.pontos as unknown[]).length : 0;
  if (pontos) {
    grupos.push({ titulo: 'Pontos de dobra', props: [leitura('Pontos', pontos), botao('Remover pontos', 'Remover pontos de dobra', () => ap({ pontos: [] }))] });
  }
  return grupos;
}

// ------------------------------------------------------------------ Lógico

const ACOES_FK = ['', 'CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT', 'NO ACTION'];
const METODOS = ['', 'btree', 'hash', 'gist', 'gin', 'spgist', 'brin'];
const MOMENTOS = ['BEFORE', 'AFTER', 'INSTEAD OF'];

const mutTabela = (id: string, fn: (t: Forma) => Forma) => mutar((d) => ({
  ...d,
  formas: d.formas.map((x) => {
    if (x.id !== id) return x;
    const n = fn(x);
    const p = propsTabela(n);
    //# a altura acompanha o conteúdo (Altura automática)
    return { ...n, h: opcoesDaTabela(n).autosize ? layoutAlt(n, d) : n.h, props: { ...n.props, campos: p.campos } };
  }),
}));

const layoutAlt = (t: Forma, d: Diagrama) => layoutTabela(t, t.fonte?.tamanho ?? d.fonte.tamanho, d).altura;

/** Exibição, editores e listas de campos/IR/índices/gatilhos da Tabela; com `sub`, o painel do item selecionado. */
export function gruposTabela(doc: Diagrama, t: Forma, sub: Sub, setSub: (s: Sub) => void): Grupo[] {
  const p = propsTabela(t);
  const o = opcoesDaTabela(t);
  const ap = (v: Record<string, unknown>) => mutTabela(t.id, (x) => ({ ...x, props: { ...x.props, ...v } }));
  const grupos: Grupo[] = [];
  const ativo = sub && sub.forma === t.id ? sub : null;

  const campo = ativo?.tipo === 'campo' ? p.campos.find((c) => c.id === ativo.id) : undefined;
  const cons = ativo?.tipo === 'constraint' ? p.constraints.find((c) => c.id === ativo.id) : undefined;
  const indice = ativo?.tipo === 'indice' ? p.indices.find((c) => c.id === ativo.id) : undefined;
  const gatilho = ativo?.tipo === 'gatilho' ? p.gatilhos.find((c) => c.id === ativo.id) : undefined;

  if (campo) grupos.push(painelCampo(doc, t, campo, setSub));
  else if (cons) grupos.push(painelConstraint(doc, t, cons, setSub));
  else if (indice) grupos.push(painelIndice(t, indice, setSub));
  else if (gatilho) grupos.push(painelGatilho(t, gatilho, setSub));
  else {
    grupos.push({
      titulo: 'Exibição',
      props: [
        bool('Altura automática', o.autosize, (v) => ap({ autosize: v })),
        bool('Forma simples', o.plain, (v) => ap({ showInPlain: v })),
        bool('Mostrar DDL', o.showDDL, (v) => ap({ showDDL: v })),
        bool('Mostrar IR', o.mostrarConstraints, (v) => ap({ mostrarConstraints: v })),
        { ...bool('IR simplificada', o.plainIR, (v) => ap({ plainIR: v })), desabilitado: !o.mostrarConstraints },
        botao('DDL', 'DDL', () => abrirDialogo({ tipo: 'texto', titulo: `DDL - ${t.texto}`, texto: ddlDaTabela(t, doc, doc.prefixo).join('\n'), nomeArquivo: `${t.texto}.sql` })),
      ],
    });
  }

  if (p.campos.length > 1 && !cons) {
    grupos.push({
      titulo: 'Campos',
      props: p.campos.filter((c) => c.id !== campo?.id).map((c) => botao('Campo', `[${c.nome}]`, () => setSub({ forma: t.id, tipo: 'campo', id: c.id }))),
    });
  }
  if (p.constraints.length > 1 && !campo) {
    grupos.push({
      titulo: 'IR',
      props: p.constraints.filter((c) => c.id !== cons?.id).map((c) => botao('IR', `[${nomeDaConstraint(c)}]`, () => setSub({ forma: t.id, tipo: 'constraint', id: c.id }))),
    });
  }
  if (!campo && !cons) {
    if (p.indices.length) grupos.push({ titulo: 'Índices', props: p.indices.filter((c) => c.id !== indice?.id).map((c) => botao('Índice', `[${c.nome || 'índice'}]`, () => setSub({ forma: t.id, tipo: 'indice', id: c.id }))) });
    if (p.gatilhos.length) grupos.push({ titulo: 'Gatilhos', props: p.gatilhos.filter((c) => c.id !== gatilho?.id).map((c) => botao('Gatilho', `[${c.nome || 'gatilho'}]`, () => setSub({ forma: t.id, tipo: 'gatilho', id: c.id }))) });
  }

  const abrirIR = (modo: TipoConstraint) => abrirDialogo({ tipo: 'd', nome: 'ir', id: t.id, modo });
  grupos.push({
    titulo: 'Editar',
    props: [
      botao('IR chave primária', 'IR chave primária...', () => abrirIR('PK')),
      botao('IR único (UNIQUE)', 'IR único...', () => abrirIR('UNIQUE')),
      botao('IR chave estrangeira', 'IR chave estrangeira...', () => abrirIR('FK')),
      botao('Adicionar CHECK', 'Adicionar CHECK', () => {
        const c = constraintVazia('CHECK');
        mutTabela(t.id, (x) => ({ ...x, props: { ...x.props, constraints: [...propsTabela(x).constraints, c] } }));
        setSub({ forma: t.id, tipo: 'constraint', id: c.id });
      }),
      botao('Adicionar índice', 'Adicionar índice', () => {
        const ix: IndiceTabela = { id: novoId(), nome: '', unico: false, metodo: '', condicao: '', campos: p.campos.filter((c) => c.pk).map((c) => c.id) };
        mutTabela(t.id, (x) => ({ ...x, props: { ...x.props, indices: [...propsTabela(x).indices, ix] } }));
        setSub({ forma: t.id, tipo: 'indice', id: ix.id });
      }),
      botao('Adicionar gatilho', 'Adicionar gatilho', () => {
        const g: GatilhoTabela = { id: novoId(), nome: '', momento: 'BEFORE', eventos: 'INSERT', porLinha: true, condicao: '', funcao: '' };
        mutTabela(t.id, (x) => ({ ...x, props: { ...x.props, gatilhos: [...propsTabela(x).gatilhos, g] } }));
        setSub({ forma: t.id, tipo: 'gatilho', id: g.id });
      }),
      botao('Editar campos', 'Editar campos...', () => abrirDialogo({ tipo: 'campos', id: t.id, aba: 'campos' })),
      botao('Editar tipos', 'Editar tipos...', () => abrirDialogo({ tipo: 'd', nome: 'tipos' })),
      botao('Dicionário de dados', 'Gerar dicionário', () => abrirDialogo({ tipo: 'dicionario' })),
    ],
  });
  return grupos;
}

/** Texto livre com sugestões (datalist): ON UPDATE/ON DELETE aceitam qualquer texto, com as ações usuais à mão. */
const txtSug = (rotulo: string, valor: string, sugestoes: string[], aoMudar: (v: string) => void): Prop => ({ ...txt(rotulo, valor, aoMudar), sugestoes });

/** Posição (Tabela.*.posicao): sobe/desce só aparecem quando há mais de um item e o item não está na ponta. */
const barra = (
  lista: unknown[], indice: number, mover: (d: -1 | 1) => void, remover: () => void, fechar: () => void, rotulo: string,
): Prop[] => [
  botao(`Excluir ${rotulo}`, 'Excluir', remover),
  ...(lista.length > 1 && indice > 0 ? [botao('Posição', 'Para cima', () => mover(-1))] : []),
  ...(lista.length > 1 && indice < lista.length - 1 ? [botao('Posição ', 'Para baixo', () => mover(1))] : []),
  botao('Seleção', 'Voltar à tabela', fechar),
];

const nomesDosCampos = (t: Forma, ids: (string | null)[]) =>
  ids.map((x) => (x ? propsTabela(t).campos.find((k) => k.id === x)?.nome ?? '?' : '?')).join(', ');

function painelCampo(doc: Diagrama, t: Forma, c: CampoTabela, setSub: (s: Sub) => void): Grupo {
  const p = propsTabela(t);
  const idx = p.campos.findIndex((x) => x.id === c.id);
  const edit = (patch: Partial<CampoTabela>) => mutTabela(t.id, (x) => ({ ...x, props: { ...x.props, campos: propsTabela(x).campos.map((k) => (k.id === c.id ? { ...k, ...patch } : k)) } }));
  const fkIdx = p.constraints.findIndex((k) => k.tipo === 'FK' && k.camposDestino.includes(c.id));
  const fk = fkIdx >= 0 ? p.constraints[fkIdx] : undefined;
  const org = fk?.constraintOrigem ? doc.formas.find((f) => f.id === fk.constraintOrigem!.tabelaId) : undefined;
  const iOrg = fk ? fk.camposDestino.indexOf(c.id) : -1;
  const campoOrg = org && fk && iOrg >= 0 ? propsTabela(org).campos.find((k) => k.id === fk.camposOrigem[iOrg]) : undefined;
  const geom = /geom|geog/i.test(c.tipo);
  //# Tabela/Campo origem são comandos que abrem o editor da IR de chave estrangeira (TAG_COMMAND_FK + 10).
  const abrirFk = () => abrirDialogo({ tipo: 'd', nome: 'ir', id: t.id, modo: 'FK', ...(fkIdx >= 0 ? { indice: fkIdx } : {}) });
  const props: Prop[] = [
    txt('Nome', c.nome, (v) => edit({ nome: v })),
    txt('Tipo de campo', c.tipo, (v) => edit({ tipo: v })),
    txt('Complemento', c.complemento, (v) => edit({ complemento: v })),
    txt('Default', c.padrao, (v) => edit({ padrao: v })),
    ...(geom ? [txt('Subtipo geom.', c.subtipoGeometria, (v) => edit({ subtipoGeometria: v })), txt('SRID', c.srid, (v) => edit({ srid: v }))] : []),
    area('Dicionário', c.dicionario, (v) => edit({ dicionario: v })),
    area('Observação', c.observacao, (v) => edit({ observacao: v })),
    bool('Chave primária', c.pk, (v) => mutTabela(t.id, (x) => alternarPk(x, c.id, v))),
    bool('Único', c.unique, (v) => mutTabela(t.id, (x) => alternarUnique(x, c.id, v))),
    bool('Chave estrangeira', c.fk, (v) => mutTabela(t.id, (x) => alternarFk(x, c.id, v))),
  ];
  if (c.fk) {
    props.push(
      botao('Tabela origem', org?.texto ?? '[]', abrirFk),
      botao('Campo origem', campoOrg?.nome ?? '()', abrirFk),
    );
  } else {
    props.push({ ...leitura('Tabela origem', '[]'), forcar: 'desabilitar' }, { ...leitura('Campo origem', '()'), forcar: 'desabilitar' });
  }
  props.push(...barra(
    p.campos, idx,
    (d) => mutTabela(t.id, (x) => ({ ...x, props: { ...x.props, campos: moverItem(propsTabela(x).campos, idx, d) } })),
    () => { mutTabela(t.id, (x) => removerCampo(x, c.id)); setSub(null); },
    () => setSub(null), 'campo',
  ));
  return { titulo: 'Campo selecionado', props };
}

function painelConstraint(doc: Diagrama, t: Forma, c: ConstraintTabela, setSub: (s: Sub) => void): Grupo {
  const p = propsTabela(t);
  const idx = p.constraints.findIndex((x) => x.id === c.id);
  const edit = (patch: Partial<typeof c>) => mutTabela(t.id, (x) => sincronizarFlags({ ...x, props: { ...x.props, constraints: propsTabela(x).constraints.map((k) => (k.id === c.id ? { ...k, ...patch } : k)) } }));
  const motivo = validarConstraint(t, c, doc);
  const org = c.constraintOrigem ? doc.formas.find((f) => f.id === c.constraintOrigem!.tabelaId) : undefined;
  const irOrg = org && c.constraintOrigem ? propsTabela(org).constraints[c.constraintOrigem.indice] : undefined;
  const abrir = () => abrirDialogo({ tipo: 'd', nome: 'ir', id: t.id, modo: c.tipo, indice: idx });
  const props: Prop[] = [
    leitura('Tipo', { PK: 'IR chave primária', UNIQUE: 'IR único (UNIQUE)', FK: 'IR chave estrangeira', CHECK: 'IR verificação (CHECK)' }[c.tipo]),
    bool('Nomear', c.nomeada, (v) => edit({ nomeada: v })),
    ...(c.nomeada ? [txt('Nome', c.nome, (v) => edit({ nome: v }))] : []),
    area('Dicionário', c.dicionario ?? '', (v) => edit({ dicionario: v })),
    area('Observação', c.observacao ?? '', (v) => edit({ observacao: v })),
    leitura('Situação', TEXTO_VALIDADE[motivo]),
  ];
  if (c.tipo === 'FK') {
    props.push(
      botao('Tabela origem', org?.texto ?? '[]', abrir),
      botao('IR Origem', irOrg ? nomeDaConstraint(irOrg) : '[]', abrir),
      botao('Campos', org ? nomesDosCampos(org, c.camposOrigem) : '()', abrir),
      botao('Tabela destino', t.texto, abrir),
      botao('Campos ', nomesDosCampos(t, c.camposDestino), abrir),
      txtSug('On Update', c.onUpdate, ACOES_FK, (v) => edit({ onUpdate: v })),
      txtSug('On Delete', c.onDelete, ACOES_FK, (v) => edit({ onDelete: v })),
    );
  } else if (c.tipo === 'CHECK') {
    props.push(area('Expressão', c.expressao, (v) => edit({ expressao: v })));
  } else {
    props.push(leitura('Campos', nomesDosCampos(t, c.camposOrigem)));
  }
  //# CHECK não tem diálogo de campos (é expressão livre): sem o atalho.
  if (c.tipo !== 'CHECK') props.push(botao('Editar', 'Editar...', abrir));
  props.push(...barra(
    p.constraints, idx,
    (d) => mutTabela(t.id, (x) => ({ ...x, props: { ...x.props, constraints: moverItem(propsTabela(x).constraints, idx, d) } })),
    () => { mutTabela(t.id, (x) => sincronizarFlags({ ...x, props: { ...x.props, constraints: propsTabela(x).constraints.filter((k) => k.id !== c.id) } })); setSub(null); },
    () => setSub(null), 'IR',
  ));
  return { titulo: 'IR selecionada', props };
}

/** Precisa de ao menos uma coluna. */
export const indiceValido = (ix: IndiceTabela) => ix.campos.some((x) => !!x);
/** Precisa de evento e de função. */
export const gatilhoValido = (g: GatilhoTabela) => !!g.eventos.trim() && !!g.funcao.trim();

function painelIndice(t: Forma, ix: IndiceTabela, setSub: (s: Sub) => void): Grupo {
  const p = propsTabela(t);
  const idx = p.indices.findIndex((x) => x.id === ix.id);
  const edit = (patch: Partial<IndiceTabela>) => mutTabela(t.id, (x) => ({ ...x, props: { ...x.props, indices: propsTabela(x).indices.map((k) => (k.id === ix.id ? { ...k, ...patch } : k)) } }));
  const nomes = ix.campos.map((id) => p.campos.find((c) => c.id === id)?.nome ?? '?').join(', ');
  //# Lista de nomes separados por vírgula; o que não existe na tabela é ignorado.
  const porNomes = (v: string) => v.split(',').map((n) => n.trim().toLowerCase()).filter(Boolean)
    .map((n) => p.campos.find((c) => c.nome.toLowerCase() === n)?.id).filter((x): x is string => !!x);
  return {
    titulo: 'Índice selecionado',
    props: [
      txt('Nome', ix.nome, (v) => edit({ nome: v })),
      bool('Único', ix.unico, (v) => edit({ unico: v })),
      txt('Colunas', nomes, (v) => edit({ campos: porNomes(v) })),
      sel('Método', ix.metodo, METODOS, (v) => edit({ metodo: v })),
      area('Condição (WHERE)', ix.condicao, (v) => edit({ condicao: v })),
      leitura('Situação', indiceValido(ix) ? 'Validado' : '* sem coluna'),
      botao('Editar campos do índice', 'Editar...', () => abrirDialogo({ tipo: 'campos', id: t.id, aba: 'indices' })),
      ...barra(
        p.indices, idx,
        (d) => mutTabela(t.id, (x) => ({ ...x, props: { ...x.props, indices: moverItem(propsTabela(x).indices, idx, d) } })),
        () => { mutTabela(t.id, (x) => ({ ...x, props: { ...x.props, indices: propsTabela(x).indices.filter((k) => k.id !== ix.id) } })); setSub(null); },
        () => setSub(null), 'índice',
      ),
    ],
  };
}

function painelGatilho(t: Forma, g: GatilhoTabela, setSub: (s: Sub) => void): Grupo {
  const p = propsTabela(t);
  const idx = p.gatilhos.findIndex((x) => x.id === g.id);
  const edit = (patch: Partial<GatilhoTabela>) => mutTabela(t.id, (x) => ({ ...x, props: { ...x.props, gatilhos: propsTabela(x).gatilhos.map((k) => (k.id === g.id ? { ...k, ...patch } : k)) } }));
  return {
    titulo: 'Gatilho selecionado',
    props: [
      txt('Nome', g.nome, (v) => edit({ nome: v })),
      txtSug('Momento', g.momento, MOMENTOS, (v) => edit({ momento: v })),
      txt('Eventos', g.eventos, (v) => edit({ eventos: v })),
      bool('Por linha', g.porLinha, (v) => edit({ porLinha: v })),
      txt('Executa', g.funcao, (v) => edit({ funcao: v })),
      area('Condição (WHEN)', g.condicao, (v) => edit({ condicao: v })),
      leitura('Situação', gatilhoValido(g) ? 'Validado' : '* falta evento ou função'),
      ...barra(
        p.gatilhos, idx,
        (d) => mutTabela(t.id, (x) => ({ ...x, props: { ...x.props, gatilhos: moverItem(propsTabela(x).gatilhos, idx, d) } })),
        () => { mutTabela(t.id, (x) => ({ ...x, props: { ...x.props, gatilhos: propsTabela(x).gatilhos.filter((k) => k.id !== g.id) } })); setSub(null); },
        () => setSub(null), 'gatilho',
      ),
    ],
  };
}

/**
 * Propriedades dos objetos lógicos além da Tabela (Visao/Sequencia/Rotina): Schema e
 * os alternadores "Materializada", "É procedure" e "É enumerado" (que trocam o kind mantendo os demais dados).
 */
export function gruposObjetoLogico(f: Forma, ap: (p: Record<string, unknown>) => void): Grupo[] | null {
  const s = (k: string) => String(f.props[k] ?? '');
  const schema = txt('Schema', s('schema'), (v) => ap({ schema: v }));
  const alterna = (v: boolean, de: string) => mutar((d) => ({ ...d, formas: d.formas.map((x) => (x.id === f.id && (v ? x.kind === de : true) ? alternarVariante(x) : x)) }));
  switch (f.kind) {
    case 'visao':
    case 'visaoMaterializada':
      return [{
        titulo: 'View',
        props: [schema, bool('Materializada', f.kind === 'visaoMaterializada', () => alterna(true, f.kind)), area('Definição (SQL)', s('corpo'), (v) => ap({ corpo: v }))],
      }];
    case 'sequencia':
      return [{
        titulo: 'Sequence',
        props: [
          schema,
          txt('Início', s('inicio'), (v) => ap({ inicio: v.trim() })), txt('Incremento', s('incremento'), (v) => ap({ incremento: v.trim() })),
          txt('Valor mínimo', s('minimo'), (v) => ap({ minimo: v.trim() })), txt('Valor máximo', s('maximo'), (v) => ap({ maximo: v.trim() })),
          bool('Cíclica', !!f.props.ciclo, (v) => ap({ ciclo: v })),
        ],
      }];
    case 'funcao':
    case 'procedure':
      return [{
        titulo: f.kind === 'funcao' ? 'Function' : 'Procedure',
        props: [
          schema, bool('É procedure', f.kind === 'procedure', () => alterna(true, f.kind)),
          txt('Parâmetros', s('parametros'), (v) => ap({ parametros: v })),
          ...(f.kind === 'funcao' ? [txt('Retorno', s('retorno'), (v) => ap({ retorno: v }))] : []),
          txt('Linguagem', s('linguagem'), (v) => ap({ linguagem: v })), area('Corpo', s('corpo'), (v) => ap({ corpo: v })),
        ],
      }];
    case 'enum':
    case 'dominio':
      return [{
        titulo: f.kind === 'enum' ? 'Enum' : 'Domain',
        props: [
          schema, bool('É enumerado', f.kind === 'enum', () => alterna(true, f.kind)),
          ...(f.kind === 'enum'
            ? [area('Valores', s('rotulos'), (v) => ap({ rotulos: v }))]
            : [
              txt('Tipo base', s('tipoBase'), (v) => ap({ tipoBase: v })), txt('Default', s('padrao'), (v) => ap({ padrao: v })),
              bool('Não nulo', !!f.props.naoNulo, (v) => ap({ naoNulo: v })), area('Restrição (CHECK)', s('restricao'), (v) => ap({ restricao: v })),
            ]),
        ],
      }];
    default:
      return null;
  }
}

/** Botão para alternar view/materializada, function/procedure e enum/domain depois de criados. */
export function propAlternarVariante(f: Forma): Prop | null {
  const alvo = VARIANTE_ALTERNATIVA[f.kind];
  if (!alvo) return null;
  return botao('Converter para', `${alvo}`, () => mutar((d) => ({ ...d, formas: d.formas.map((x) => (x.id === f.id ? alternarVariante(x) : x)) })));
}

/** Botões de campo novo (comuns/PK/FK/PK+FK): usam os comandos do editor (logico.add.*). */
export const VARIANTES_CAMPO: { cmd: string; rotulo: string }[] = [
  { cmd: 'logico.add.campo', rotulo: 'Novo campo' },
  { cmd: 'logico.add.key', rotulo: 'Novo campo chave (PK)' },
  { cmd: 'logico.add.fkey', rotulo: 'Novo campo FK' },
  { cmd: 'logico.add.keyfkey', rotulo: 'Novo campo PK + FK' },
];
