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

import { useSubSel } from '../editor/itemSel';
import { setaAutomatica, setasDaLogicoLinha } from '../editor/logicoLinha';
import { atualizarForma, atualizarLigacao, atualizarProps } from '../editor/ops';
import * as C from '../editor/conceitual';
import { CARDS_CONCEITUAL, normalizarCardConceitual, patchCardManual } from '../editor/cardinalidade';
import { ajustarAoMultivalorado, cardMaxDe, cardMinDe, cardParaTexto, definirCardMax, definirCardMin, definirIdentificador, definirOpcional } from '../editor/atributo';
import { abaAtiva, mutar, selecionar, useEditor } from '../editor/store';
import { Diagrama, Forma, Ligacao, NOME_TIPO } from '../editor/types';
import { FORMAS, LIGACOES } from '../shapes/registry';
import { estiloDaForma } from '../shapes/render';
import { Grupo, Prop, PropertyGrid } from './PropertyGrid';
import { area, bool, botao, codigo, cor, forcarDesabilitado, leitura, num, sel, txt } from './propHelpers';
import {
  Sub, VARIANTES_CAMPO, gruposBarraEap, gruposDesenhador, gruposDrawer, gruposGradiente, gruposLegenda, gruposLigacao, gruposLivre, gruposRaia,
  gruposObjetoLogico, gruposTabela, gruposTexto, propAlternarVariante, textoComAuto,
} from './InspectorExtra';
import { useState } from 'react';
import { useConfig } from '../editor/config';
import { definirFonteDoDiagrama, gruposBaseDaForma, gruposDiagrama, gruposDimensoesLinha, gruposMultiplos } from './inspetorBase';
import { gruposTextoApenso } from './inspetorGrupos';
//# Garante o registro dos comandos do stream D (exportar, EAP CLI, IR) mesmo que o App não os importe.
import '../editor/comandosD';

export interface AcoesInspector {
  editarCampos: (id: string, aba?: 'campos' | 'constraints' | 'indices' | 'gatilhos') => void;
  editarDsl: (id: string) => void;
  escolherImagem: (id: string) => void;
  comando: (nome: string) => void;
}

const CARDINALIDADES: string[] = [...CARDS_CONCEITUAL];
const ESTILOS = ['Normal', 'Negrito', 'Itálico', 'Negrito itálico'];

const estiloDe = (n: boolean, i: boolean) => ESTILOS[(n ? 1 : 0) + (i ? 2 : 0)];
const estiloPara = (s: string) => ({ negrito: s.includes('Negrito'), italico: s.includes('Itálico') });

/** Formas sem edição de fonte ou sem texto visível. */
const SEM_FONTE = new Set(['fluxConector', 'decisaoAtividade', 'inicioAtividade', 'fimAtividade', 'forkJoinAtividade', 'eapBarraLigacao', 'livreJuncao', 'livreTriangulo', 'desenhador', 'livreDrawer']);

/** Comandos do diagrama que aparecem como botões no Inspector quando nada está selecionado. */
const COMANDOS_DIAGRAMA: Record<string, [string, string, string][]> = {
  conceitual: [
    ['Converter', 'Converter para lógico', 'conceitual.converter'],
    ['Editar atributos', 'Editar atributos', 'conceitual.editarAtributos'],
  ],
  logico: [
    ['Organizar tabelas', 'Organizar', 'diagrama.organizar'],
    ['Editar campos', 'Editar campos', 'logico.editarCampos'],
    ['Editar tipos', 'Editar tipos...', 'logico.editarTipos'],
    ['Dicionário de dados', 'Gerar dicionário', 'logico.dicionario'],
    ['Converter para físico', 'Gerar DDL', 'logico.ddl'],
    ['Converter para conceitual', 'Converter', 'logico.converterConceitual'],
  ],
  nosql: [['Script de criação', 'Gerar script', 'nosql.script']],
  fluxo: [['Organizar', 'Organizar', 'diagrama.organizar']],
  atividade: [['Organizar', 'Organizar', 'diagrama.organizar']],
  eap: [
    ['Organizar', 'Organizar tudo', 'diagrama.organizar'],
    ['CLI', 'Construtor (CLI)...', 'eap.cli'],
  ],
  livre: [['Organizar', 'Organizar', 'diagrama.organizar']],
};

export function Inspector({ acoes }: { acoes: AcoesInspector }) {
  const e = useEditor();
  const cfg = useConfig();
  const [sub, setSub] = useSubSel();
  const aba = abaAtiva(e);
  if (!aba) return <div className="inspector-vazio" />;
  const { doc, selecao } = aba;
  const formas = doc.formas.filter((f) => selecao.includes(f.id));
  const ligacoes = doc.ligacoes.filter((l) => selecao.includes(l.id));

  const grupos: Grupo[] = [];

  if (!formas.length && !ligacoes.length) {
    grupos.push(...gruposDiagrama(doc, cfg, definirFonteDoDiagrama));
    if (doc.tipo === 'logico') {
      grupos.push({
        titulo: 'Lógico',
        props: [
          txt('Prefixo', doc.prefixo, (v) => mutar((d) => ({ ...d, prefixo: v }))),
          txt('Separador SQL', doc.separadorSql, (v) => mutar((d) => ({ ...d, separadorSql: v }))),
        ],
      });
    }
    for (const [titulo, rotulo, cmd] of COMANDOS_DIAGRAMA[doc.tipo] ?? []) {
      grupos.push({ titulo, props: [botao(titulo, rotulo, () => acoes.comando(cmd))] });
    }
  } else if (formas.length) {
    const unica = formas.length === 1 ? formas[0] : undefined;
    const ids = formas.map((f) => f.id);
    const aplicar = (patch: Partial<Forma>) =>
      mutar((d) => ids.reduce((acc, id) => atualizarForma(acc, id, patch), d));

    if (unica) {
      const def = FORMAS[unica.kind];
      const ap = (p: Record<string, unknown>) => mutar((d) => atualizarProps(d, unica.id, p));
      const pr = (k: string, pad?: unknown) => unica.props[k] ?? pad;
      grupos.push(...gruposBaseDaForma(doc, unica, cfg, SEM_FONTE.has(unica.kind), aplicar, (v) => (def.geo === 'text'
        ? mutar((d) => { const n = atualizarForma(d, unica.id, { texto: v }); return { ...n, formas: n.formas.map((x) => (x.id === unica.id ? textoComAuto(n, x) : x)) }; })
        : aplicar({ texto: v }))));
      grupos.push(...(doc.tipo === 'conceitual' ? propsConceitual(doc, unica, acoes) : []));
      grupos.push(...propsEspecificas(unica, doc, acoes, sub, setSub));
      //# Formato: cantos, título delimitado, serrilhada e gradiente (com os padrões reais de cada objeto).
      const GEOS_SEM_FORMATO = ['attr', 'multiattr', 'special', 'union', 'inicio', 'fim', 'junction', 'text', 'legend', 'image', 'drawer', 'lane', 'bar', 'fluxconector', 'arrow'];
      const CABECALHO = ['table', 'view', 'seq', 'domain', 'enum', 'routine', 'colecao'];
      if (!GEOS_SEM_FORMATO.includes(def.geo) && !unica.kind.startsWith('livre')) {
        const e = estiloDaForma(unica);
        grupos.push({
          titulo: 'Forma',
          props: [
            ...(['rect', 'assoc', ...CABECALHO].includes(def.geo)
              ? [num('Cantos arredondados', Number(pr('roundrect', CABECALHO.includes(def.geo) ? 22 : 0)), (v) => ap({ roundrect: Math.max(0, v) }), 0)] : []),
            ...(CABECALHO.includes(def.geo) ? [bool('Delimitar título', !!pr('delimite', true), (v) => ap({ delimite: v }))] : []),
            bool('Serrilhada', !!pr('dashed', false), (v) => ap({ dashed: v })),
          ],
        });
        grupos.push(gruposGradiente(unica, {}));
      }
      const lig = C.formasLigadas(doc, unica.id);
      if (lig.length) {
        grupos.push({
          titulo: 'Ligações',
          props: [...lig.map((f) => botao(NOME_TIPO_FORMA(f), f.texto || f.kind, () => selecionar([f.id]))), botao('Organizar ligações', 'Organizar ligações', () => acoes.comando('diagrama.organizar'))],
        });
      }
    } else {
      grupos.push({ titulo: 'Seleção', props: [{ rotulo: 'Formas', valor: formas.length, editor: { tipo: 'leitura' } }] });
    }
    if (!unica) grupos.push(...gruposMultiplos(doc, formas, formas.every((f) => SEM_FONTE.has(f.kind)), aplicar));
  } else {
    const l = ligacoes[0];
    const def = LIGACOES[l.kind];
    const aplicarL = (patch: Partial<Ligacao>) => mutar((d) => ligacoes.reduce((acc, x) => atualizarLigacao(acc, x.id, patch), d));
    const ap = (p: Record<string, unknown>) => aplicarL({ props: { ...l.props, ...p } });
    const entRel = l.kind !== 'logicoLinha' && (!!l.cardDe || (doc.tipo === 'conceitual' && l.kind === 'linha' && C.formaPorId(doc, l.de)?.kind !== undefined && C.tiposLigacaoConceitual.ehEnt(C.formaPorId(doc, l.de)?.kind ?? '') && ['relacionamento', 'autorelacionamento', 'entidadeAssociativa'].includes(C.formaPorId(doc, l.para)?.kind ?? '')));
    grupos.push({
      titulo: def.rotulo,
      props: [
        txt('Texto', l.texto, (v) => aplicarL({ texto: v })),
        cor('Cor', l.corBorda, (v) => aplicarL({ corBorda: v || undefined })),
        bool('Ancorar', !!l.props.ancorado, (v) => ap({ ancorado: v })),
        bool('Inteligente', l.props.inteligente !== false, (v) => ap({ inteligente: v })),
        bool('Serrilhada', !!(l.props.dashed ?? l.props.tracejada), (v) => ap({ dashed: v, tracejada: v })),
        botao('Centralizar', 'Centralizar', () => ap({ deslocX: 0, deslocY: 0, pontos: [], textoDx: 0, textoDy: 0 })),
      ],
    });
    grupos.push(...gruposLigacao(doc, l));
    grupos.push(gruposDimensoesLinha(doc, l));
    grupos.push(...gruposTextoApenso(doc, l));
    if (entRel) {
      grupos.push({
        titulo: 'Cardinalidade',
        props: [
          { rotulo: 'Cardinalidade', valor: normalizarCardConceitual(l.cardDe), editor: { tipo: 'select', opcoes: CARDINALIDADES }, aoMudar: (v) => aplicarL({ cardDe: normalizarCardConceitual(String(v)) }) },
          txt('Papel', String(l.props.papel ?? ''), (v) => ap({ papel: v })),
          bool('Entidade fraca', !!l.props.duplaLinha, (v) => ap({ duplaLinha: v })),
          bool('Tamanho automático', l.props.cardAuto !== false, (v) => ap({ cardAuto: v })),
          bool('Movimento manual', !!l.props.cardManual, (v) => aplicarL({ props: patchCardManual(l, v) })),
        ],
      });
    }
    if (!def.semSeta) {
      grupos.push({
        titulo: 'Seta',
        props: [
          ...(l.kind === 'logicoLinha'
            ? [
              forcarDesabilitado(bool('Seta a ponta "A"', setasDaLogicoLinha(l).setaA, (v) => ap({ setaA: v })), setaAutomatica(l)),
              forcarDesabilitado(bool('Seta ponta "B"', setasDaLogicoLinha(l).setaB, (v) => ap({ setaB: v })), setaAutomatica(l)),
            ]
            : [
              bool('Seta a ponta "A"', !!l.props.setaA, (v) => ap({ setaA: v })),
              bool('Seta ponta "B"', l.props.setaB === undefined ? def.seta === 'fim' : !!l.props.setaB, (v) => ap({ setaB: v })),
            ]),
          bool('Forma de flecha', l.props.setaAberta === undefined ? true : !!l.props.setaAberta, (v) => ap({ setaAberta: v })),
          num('Largura da seta', Number(l.props.setaLargura ?? def.larguraSeta ?? 10), (v) => ap({ setaLargura: v > 99 || v < 10 ? 10 : v }), 10, 99),
        ],
      });
    }
    const pa = C.formaPorId(doc, l.de);
    const pb = C.formaPorId(doc, l.para);
    grupos.push({
      titulo: 'Ligações',
      props: [pa, pb].filter((f): f is Forma => !!f).map((f) => botao(NOME_TIPO_FORMA(f), f.texto || f.kind, () => selecionar([f.id]))),
    });
  }

  return <PropertyGrid key={`${e.ativa}|${selecao.join(',')}`} grupos={grupos} />;
}

const NOME_TIPO_FORMA = (f: Forma) => FORMAS[f.kind]?.rotulo ?? f.kind;

const ESTRATEGIAS = ['', 'RANGE', 'LIST', 'HASH'];

function propsEspecificas(f: Forma, doc: Diagrama, acoes: AcoesInspector, sub: Sub, setSub: (s: Sub) => void): Grupo[] {
  const geo = FORMAS[f.kind].geo;
  const ap = (p: Record<string, unknown>) => mutar((d) => atualizarProps(d, f.id, p));
  const s = (k: string) => String(f.props[k] ?? '');
  const schema = txt('Schema', s('schema'), (v) => ap({ schema: v }));
  const alternar = propAlternarVariante(f);
  const extra = alternar ? [alternar] : [];
  if (f.kind.startsWith('livre') && geo !== 'drawer') return gruposLivre(f);
  switch (geo) {
    case 'table': {
      const emSub = !!sub && sub.forma === f.id;
      return [
        ...(emSub ? [] : [{
          titulo: 'Tabela',
          props: [
            schema,
            area('Descrição', s('descricao'), (v) => ap({ descricao: v })),
            area('Observação', s('observacao'), (v) => ap({ observacao: v })),
            ...VARIANTES_CAMPO.map((v) => botao(v.rotulo, v.rotulo, () => acoes.comando(v.cmd))),
          ],
        }]),
        ...gruposTabela(doc, f, sub, setSub),
        ...(emSub ? [] : [{
          titulo: 'Particionamento e herança',
          props: [
            { rotulo: 'Particionar por', valor: s('estrategiaParticao'), editor: { tipo: 'select' as const, opcoes: ESTRATEGIAS }, aoMudar: (v: string | number | boolean) => ap({ estrategiaParticao: String(v) }) },
            txt('Chave de partição', s('chaveParticao'), (v) => ap({ chaveParticao: v })),
            txt('Tabela mãe', s('tabelaPai'), (v) => ap({ tabelaPai: v })),
            txt('Limite da partição', s('limiteParticao'), (v) => ap({ limiteParticao: v })),
          ],
        }]),
      ];
    }
    case 'view':
    case 'seq':
    case 'domain':
    case 'enum':
    case 'routine':
      return gruposObjetoLogico(f, ap) ?? [];
    case 'colecao':
      return [{ titulo: 'Coleção', props: [botao('Campos', 'Editar campos (DSL)', () => acoes.editarDsl(f.id))] }];
    case 'legend':
      return gruposLegenda(doc, f);
    case 'image':
      return gruposDesenhador(f);
    case 'drawer':
      return gruposDrawer(f);
    case 'lane':
      return gruposRaia(doc, f);
    case 'bar':
      return f.kind === 'eapBarraLigacao' ? gruposBarraEap(f) : [];
    case 'text':
      return gruposTexto(doc, f);
    default:
      return [];
  }
}

const DIRECOES = ['Para cima', 'Direita', 'Para baixo', 'Esquerda'];
const DIR_INTERNA: Record<string, string> = { 'Para cima': 'Up', Direita: 'Right', 'Para baixo': 'Down', Esquerda: 'Left' };
const DIR_EXIBIDA = Object.fromEntries(Object.entries(DIR_INTERNA).map(([k, v]) => [v, k]));

/** Propriedades próprias de cada forma do Conceitual (Atributo, Entidade, Relacionamento, Especialização, União, Associativa). */
function propsConceitual(doc: import('../editor/types').Diagrama, f: Forma, acoes: AcoesInspector): Grupo[] {
  const ap = (p: Record<string, unknown>) => mutar((d) => atualizarProps(d, f.id, p));
  const pr = (k: string, pad?: unknown) => f.props[k] ?? pad;
  const organizar = botao('Organizar atributos', 'Organizar atributos', () => mutar((d) => C.organizarAtributos(d, f.id)));
  const editarAttr = botao('Editar atributos', 'Editar atributos', () => acoes.comando('conceitual.editarAtributos'));
  switch (f.kind) {
    case 'entidade': {
      const outras = doc.formas.filter((x) => x.kind === 'entidade' || x.kind === 'entidadeAssociativa');
      return [
        { titulo: 'Atributos básicos', props: [area('Atributos básicos', String(pr('atributosOcultos', '')), (v) => ap({ atributosOcultos: v }))] },
        {
          titulo: 'Relacionamento',
          props: [{
            rotulo: 'Relacionar', valor: '(selecione)', editor: { tipo: 'select', opcoes: ['(selecione)', ...outras.map((o) => `${o.texto} #${o.id}`)] },
            aoMudar: (v) => { const id = String(v).split(' #')[1]; if (id) mutar((d) => C.relacionar(d, f.id, id)); },
          }],
        },
        { titulo: 'Atributos', props: [organizar, editarAttr] },
      ];
    }
    case 'entidadeAssociativa': {
      const it = (pr('interno', {}) as { texto?: string; descricao?: string; observacao?: string });
      const setIt = (p: Record<string, string>) => ap({ interno: { ...it, ...p } });
      return [
        { titulo: 'Conversão', props: [botao('Conv. relacionamento', 'Conv. relacionamento', () => mutar((d) => C.associativaParaRelacionamento(d, f.id)))] },
        {
          titulo: 'Relacionamento',
          props: [
            txt('Nome', it.texto ?? '', (v) => setIt({ texto: v })),
            area('Observação', it.observacao ?? '', (v) => setIt({ observacao: v })),
            area('Dicionário', it.descricao ?? '', (v) => setIt({ descricao: v })),
          ],
        },
        { titulo: 'Atributos', props: [organizar, editarAttr] },
      ];
    }
    case 'relacionamento':
    case 'autorelacionamento': {
      const auto = C.ehAutoRelacionamento(doc, f.id);
      return [
        {
          titulo: 'Relacionamento',
          props: [
            { rotulo: 'Auto relacionamento', valor: auto ? 'Sim' : 'Não', editor: { tipo: 'leitura' } },
            ...(auto ? [] : [botao('Conv. entidade ass.', 'Conv. entidade ass.', () => mutar((d) => C.relacionamentoParaAssociativa(d, f.id)))]),
          ],
        },
        { titulo: 'Atributos', props: [organizar, editarAttr] },
      ];
    }
    case 'atributo':
    case 'atributoMulti': {
      const multi = f.kind === 'atributoMulti';
      //# Card mín/máx só valem para multivalorado; Opcional fica desabilitado quando é multivalorado.
      return [{
        titulo: 'Atributo',
        props: [
          { rotulo: 'Direção', valor: DIR_EXIBIDA[String(pr('direcao', 'Left'))] ?? 'Esquerda', editor: { tipo: 'select', opcoes: ['Esquerda', 'Direita'] }, aoMudar: (v) => ap({ direcao: DIR_INTERNA[String(v)] }) },
          bool('Tamanho automático', pr('autosize', true) !== false, (v) => ap({ autosize: v })),
          bool('Identificador', !!pr('identificador', false), (v) => ap(definirIdentificador(f.props, v))),
          { ...bool('Opcional', !!pr('opcional', false), (v) => ap(definirOpcional(f.props, v))), desabilitado: multi },
          { rotulo: 'Composto', valor: C.ehComposto(doc, f.id) ? 'Sim' : 'Não', editor: { tipo: 'leitura' } },
          bool('Multivalorado', multi, (v) => mutar((d) => {
            const n = atualizarForma(d, f.id, { kind: v ? 'atributoMulti' : 'atributo', w: v ? 18 : 14, h: v ? 18 : 14 });
            return atualizarProps(n, f.id, ajustarAoMultivalorado(f.props));
          })),
          { ...txt('Cardinalidade mínima', cardParaTexto(cardMinDe(f)), (v) => ap(definirCardMin(f.props, v))), desabilitado: !multi },
          { ...txt('Cardinalidade máxima', cardParaTexto(cardMaxDe(f)), (v) => ap(definirCardMax(f.props, v))), desabilitado: !multi },
          txt('Domínio/Tipo do valor', String(pr('tipo', '')), (v) => ap({ tipo: v })),
          organizar,
        ],
      }];
    }
    case 'especializacao':
    case 'especializacaoExclusiva':
    case 'especializacaoDupla': {
      const i = C.infoEspecializacao(doc, f);
      const props: Prop[] = [
        { rotulo: 'Direção', valor: DIR_EXIBIDA[String(pr('direcao', 'Up'))] ?? 'Para cima', editor: { tipo: 'select', opcoes: DIRECOES }, aoMudar: (v) => ap({ direcao: DIR_INTERNA[String(v)] }) },
      ];
      if (i.malformada) props.push({ rotulo: 'Formação', valor: 'Mal formatada', editor: { tipo: 'leitura' } });
      else {
        props.push(
          bool('Esp. parcial', i.parcial, (v) => ap({ parcial: v })),
          bool('Esp. total', i.total, (v) => ap({ parcial: !v })),
          { rotulo: 'Esp. exclusiva', valor: i.exclusiva ? 'Sim' : 'Não', editor: { tipo: 'leitura' } },
          { rotulo: 'Esp. não exclusiva', valor: i.naoExclusiva ? 'Sim' : 'Não', editor: { tipo: 'leitura' } },
        );
      }
      props.push(i.principal ? botao('Esp. a partir de', i.principal.texto, () => selecionar([i.principal!.id])) : { rotulo: 'Esp. a partir de', valor: '{}', editor: { tipo: 'leitura' } });
      return [{ titulo: 'Especialização', props }];
    }
    case 'uniao':
    case 'uniaoEntidades': {
      const res = C.principalDe(doc, f.id);
      return [{
        titulo: 'União',
        props: [
          { rotulo: 'Direção', valor: DIR_EXIBIDA[String(pr('direcao', 'Up'))] ?? 'Para cima', editor: { tipo: 'select', opcoes: DIRECOES }, aoMudar: (v) => ap({ direcao: DIR_INTERNA[String(v)] }) },
          res ? botao('Entidade união', res.texto, () => selecionar([res.id])) : { rotulo: 'Entidade união', valor: '{}', editor: { tipo: 'leitura' } },
        ],
      }];
    }
    default:
      return [];
  }
}
