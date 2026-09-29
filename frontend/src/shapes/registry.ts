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

import { TipoDiagrama } from '../editor/types';

/** Como a forma é desenhada (ver render.tsx). */
export type Geo =
  | 'rect' | 'round' | 'ellipse' | 'diamond' | 'triangle' | 'doc' | 'docs' | 'note' | 'circle'
  | 'bar' | 'lane' | 'table' | 'view' | 'attr' | 'multiattr' | 'assoc' | 'text' | 'legend' | 'image'
  | 'inicio' | 'fim' | 'arrow' | 'junction' | 'seq' | 'enum' | 'domain' | 'routine' | 'colecao'
  | 'special' | 'union'
  //# geometrias: pílula (w/3 x h), nota ondulada, comentário dobrado, desenho livre.
  | 'pill' | 'wave' | 'comment' | 'drawer' | 'fluxconector';

export interface DefForma {
  kind: string;
  rotulo: string;
  icone: string;
  geo: Geo;
  w: number;
  h: number;
  /** Preenchimento padrão. */
  cor: string;
  /** Texto inicial (prefixo; o editor acrescenta _N). */
  textoBase: string;
  /** Texto fica abaixo/ao lado da forma (atributos). */
  textoFora?: boolean;
  /** Forma pequena, sem redimensionamento pelo usuário. */
  fixa?: boolean;
}

export interface DefLigacao {
  kind: string;
  rotulo: string;
  icone: string;
  seta: 'nenhuma' | 'fim';
  tracejada?: boolean;
  /** Mostra cardinalidade nas pontas. */
  cardinalidade?: boolean;
  /** Largura padrão da seta (10; seta de ligação: 20). */
  larguraSeta?: number;
  /** Sem configuração de seta (EapLigacao: showConfigSeta = false). */
  semSeta?: boolean;
  /** Rótulo apenso à linha: 'fluxo' = Sim/Não, 'atividade' = [texto], 'livre' = texto livre. */
  apenso?: 'fluxo' | 'atividade' | 'livre';
}

const f = (
  kind: string, rotulo: string, icone: string, geo: Geo, w: number, h: number, cor: string,
  extra: Partial<DefForma> = {},
): DefForma => ({ kind, rotulo, icone, geo, w, h, cor, textoBase: rotulo, ...extra });

export const FORMAS: Record<string, DefForma> = Object.fromEntries(
  [
    // Conceitual
    f('entidade', 'Entidade', 'Entidade.png', 'rect', 120, 58, '#ffffff', { textoBase: 'Entidade' }),
    f('relacionamento', 'Relacionamento', 'Relacionamento.png', 'diamond', 150, 50, '#ffffff', { textoBase: 'Relacionamento' }),
    f('autorelacionamento', 'Auto-relacionamento', 'AutoRelacionamento.png', 'diamond', 150, 50, '#ffffff', { textoBase: 'Auto Rel.' }),
    f('entidadeAssociativa', 'Entidade associativa', 'Entidade_Associativa.png', 'assoc', 158, 58, '#ffffff', { textoBase: 'E. Assoc.' }),
    f('atributo', 'Atributo', 'Atributo.png', 'attr', 14, 14, '#ffffff', { textoBase: 'Atributo', textoFora: true, fixa: true }),
    f('atributoMulti', 'Atributo multivalorado', 'Atributo_Multivalorado.png', 'multiattr', 18, 18, '#ffffff', { textoBase: 'Atr. Multiv.', textoFora: true, fixa: true }),
    f('especializacao', 'Especialização', 'Especializacao.png', 'special', 40, 32, '#ffffff', { textoBase: 'Especialização', fixa: true }),
    f('especializacaoExclusiva', 'Especialização exclusiva', 'EspecializacaoE.png', 'special', 40, 32, '#ffffff', { textoBase: 'Especialização', fixa: true }),
    f('especializacaoDupla', 'Especialização dupla', 'EspecializacaoD.png', 'special', 40, 32, '#ffffff', { textoBase: 'Especialização', fixa: true }),
    f('uniao', 'União', 'Uniao.png', 'union', 40, 32, '#ffffff', { textoBase: 'União', fixa: true }),
    f('uniaoEntidades', 'União de entidades', 'Uniao_Entidades.png', 'union', 40, 32, '#ffffff', { textoBase: 'União', fixa: true }),
    // Lógico
    f('tabela', 'Tabela', 'Tabela.png', 'table', 150, 100, '#ffffff', { textoBase: 'Tabela' }),
    f('visao', 'View', 'Visao.png', 'view', 180, 120, '#ffffff', { textoBase: 'Visao' }),
    f('visaoMaterializada', 'View materializada', 'Visao.png', 'view', 180, 120, '#ffffff', { textoBase: 'Visao' }),
    f('sequencia', 'Sequence', 'sequencia.png', 'seq', 170, 110, '#ffffff', { textoBase: 'Sequencia' }),
    f('dominio', 'Domain', 'dominio.png', 'domain', 180, 120, '#ffffff', { textoBase: 'Dominio' }),
    f('enum', 'Enum', 'enum.png', 'enum', 180, 120, '#ffffff', { textoBase: 'Enum' }),
    f('funcao', 'Function', 'funcao.png', 'routine', 200, 130, '#ffffff', { textoBase: 'Funcao' }),
    f('procedure', 'Procedure', 'procedure.png', 'routine', 200, 130, '#ffffff', { textoBase: 'Procedure' }),
    // Fluxo
    f('fluxIniFim', 'Início/Fim', 'IniFim.png', 'pill', 80, 30, '#ffffff', { textoBase: 'Início' }),
    f('fluxProcesso', 'Processo', 'Processo.png', 'rect', 120, 58, '#ffffff', { textoBase: 'Processo' }),
    f('fluxDecisao', 'Decisão', 'DiagramaDecisao.png', 'diamond', 100, 40, '#ffffff', { textoBase: 'Decisão' }),
    f('fluxDocumento', 'Documento', 'Documento.png', 'doc', 120, 58, '#ffffff', { textoBase: 'Documento' }),
    f('fluxVDocumentos', 'Vários documentos', 'VDocumentos.png', 'docs', 120, 58, '#ffffff', { textoBase: 'Documentos' }),
    f('fluxConector', 'Conector', 'Conector.png', 'fluxconector', 30, 30, '#ffffff', { textoBase: '1' }),
    f('fluxNota', 'Nota', 'Notas.png', 'wave', 120, 80, '#fff8c4', { textoBase: 'Nota' }),
    f('fluxSeta', 'Seta', 'FluxSeta.png', 'arrow', 90, 36, '#ffffff', { textoBase: '' }),
    // Atividade
    f('inicioAtividade', 'Início', 'Inicio.png', 'inicio', 20, 20, '#222222', { textoBase: '', fixa: true }),
    f('fimAtividade', 'Fim', 'Fim.png', 'fim', 20, 20, '#222222', { textoBase: '', fixa: true }),
    f('estadoAtividade', 'Estado', 'Estado.png', 'pill', 120, 58, '#ffffff', { textoBase: 'Estado' }),
    f('decisaoAtividade', 'Decisão', 'DiagramaDecisao.png', 'diamond', 100, 40, '#ffffff', { textoBase: '' }),
    f('forkJoinAtividade', 'Fork/Join', 'ForkJoin.png', 'bar', 60, 10, '#222222', { textoBase: '' }),
    f('raiaAtividade', 'Raia', 'Raia.png', 'lane', 600, 580, '#ffffff', { textoBase: 'Raia' }),
    f('setaAtividade', 'Seta', 'SetaAtividade.png', 'arrow', 90, 36, '#ffffff', { textoBase: '' }),
    // EAP
    f('eapProcesso', 'Processo', 'Processo.png', 'rect', 120, 58, '#ffffff', { textoBase: 'Processo' }),
    f('eapBarraLigacao', 'Barra de ligação', 'EapBarraLigacao.png', 'bar', 120, 10, '#222222', { textoBase: '' }),
    // Livre
    f('livreRetangulo', 'Retângulo', 'Retangulo.png', 'rect', 120, 58, '#ffffff', { textoBase: 'Retângulo' }),
    f('livreRetanguloArr', 'Retângulo arredondado', 'RetanguloA.png', 'pill', 120, 58, '#ffffff', { textoBase: 'Retângulo' }),
    f('livreDocumento', 'Documento', 'Documento.png', 'doc', 120, 58, '#ffffff', { textoBase: 'Documento' }),
    f('livreVariosDocumentos', 'Vários documentos', 'VDocumentos.png', 'docs', 120, 58, '#ffffff', { textoBase: 'Documentos' }),
    f('livreNota', 'Nota', 'Notas.png', 'wave', 120, 80, '#fff8c4', { textoBase: 'Nota' }),
    f('livreTriangulo', 'Triângulo', 'Triangulo.png', 'triangle', 30, 30, '#ffffff', { textoBase: '' }),
    f('livreCirculo', 'Círculo', 'Circulo.png', 'ellipse', 60, 60, '#ffffff', { textoBase: '' }),
    f('livreLosango', 'Losango', 'Losango.png', 'diamond', 100, 40, '#ffffff', { textoBase: '' }),
    f('livreJuncao', 'Junção', 'Juncao.png', 'junction', 30, 30, '#222222', { textoBase: '', fixa: true }),
    f('livreSuperTexto', 'Super texto', 'TextoSimples.png', 'text', 120, 20, 'transparent', { textoBase: 'Texto' }),
    f('livreDrawer', 'Desenho', 'drawer.png', 'drawer', 250, 150, 'transparent', { textoBase: 'Desenho' }),
    f('livreComentario', 'Comentário', 'Legenda.png', 'comment', 120, 58, '#fff8c4', { textoBase: 'Comentário' }),
    // NoSQL
    f('colecao', 'Coleção', 'Colecao.png', 'colecao', 200, 100, '#ffffff', { textoBase: 'Coleção' }),
    // Comuns
    f('texto', 'Texto', 'Texto.png', 'text', 150, 36, 'transparent', { textoBase: 'Texto' }),
    f('legenda', 'Legenda', 'Legenda.png', 'legend', 150, 45, '#ffffff', { textoBase: 'Legenda' }),
    f('desenhador', 'Imagem', 'Imagem.png', 'image', 250, 150, '#ffffff', { textoBase: 'Imagem' }),
  ].map((d) => [d.kind, d]),
);

const l = (kind: string, rotulo: string, icone: string, seta: DefLigacao['seta'], extra: Partial<DefLigacao> = {}): DefLigacao => ({
  kind, rotulo, icone, seta, ...extra,
});

export const LIGACOES: Record<string, DefLigacao> = Object.fromEntries(
  [
    l('linha', 'Linha', 'Linha.png', 'nenhuma', { cardinalidade: true }),
    l('logicoLinha', 'Linha (chave estrangeira)', 'Linha.png', 'fim'),
    l('fluxLigacao', 'Ligação', 'DiagramaLigacao.png', 'fim', { larguraSeta: 20 }),
    l('fluxSeta', 'Seta', 'FluxSeta.png', 'fim', { larguraSeta: 20, apenso: 'fluxo' }),
    l('ligacaoAtividade', 'Ligação', 'DiagramaLigacao.png', 'fim', { larguraSeta: 20 }),
    l('setaAtividade', 'Seta', 'SetaAtividade.png', 'fim', { larguraSeta: 20, apenso: 'atividade' }),
    l('eapLigacao', 'Ligação', 'LinhaSimples.png', 'nenhuma', { semSeta: true }),
    l('livreLigacao', 'Ligação', 'LinhaApenso.png', 'fim', { larguraSeta: 20, apenso: 'livre' }),
    l('livreLigacaoSimples', 'Ligação simples', 'LinhaSimples.png', 'fim', { larguraSeta: 20 }),
  ].map((d) => [d.kind, d]),
);

export interface ItemPaleta {
  /** 'forma' | 'ligacao' | 'apagar' */
  tipo: 'forma' | 'ligacao' | 'apagar';
  kind: string;
}

const fm = (kind: string): ItemPaleta => ({ tipo: 'forma', kind });
const lg = (kind: string): ItemPaleta => ({ tipo: 'ligacao', kind });

const COMUNS: ItemPaleta[] = [fm('texto'), fm('legenda'), fm('desenhador'), { tipo: 'apagar', kind: 'apagar' }];

/** Paleta vertical à direita, na mesma ordem (o "ponteiro" é fixo no topo). */
export const PALETA: Record<TipoDiagrama, ItemPaleta[]> = {
  conceitual: [
    fm('entidade'), fm('relacionamento'), fm('autorelacionamento'), fm('especializacao'), fm('especializacaoExclusiva'),
    fm('especializacaoDupla'), fm('uniao'), fm('uniaoEntidades'), fm('entidadeAssociativa'), fm('atributo'),
    fm('atributoMulti'), lg('linha'), ...COMUNS,
  ],
  logico: [
    fm('tabela'), fm('visao'), fm('visaoMaterializada'), fm('sequencia'), fm('dominio'), fm('enum'), fm('funcao'),
    fm('procedure'), lg('logicoLinha'), ...COMUNS,
  ],
  fluxo: [
    fm('fluxIniFim'), fm('fluxProcesso'), fm('fluxDecisao'), fm('fluxDocumento'), fm('fluxVDocumentos'),
    fm('fluxConector'), fm('fluxNota'), lg('fluxSeta'), lg('fluxLigacao'), ...COMUNS,
  ],
  atividade: [
    fm('inicioAtividade'), fm('fimAtividade'), fm('estadoAtividade'), fm('decisaoAtividade'), fm('forkJoinAtividade'),
    fm('raiaAtividade'), lg('setaAtividade'), lg('ligacaoAtividade'), ...COMUNS,
  ],
  eap: [fm('eapProcesso'), fm('eapBarraLigacao'), lg('eapLigacao'), ...COMUNS],
  livre: [
    fm('livreRetangulo'), fm('livreRetanguloArr'), fm('livreDocumento'), fm('livreVariosDocumentos'), fm('livreNota'),
    fm('livreTriangulo'), fm('livreCirculo'), fm('livreLosango'), fm('livreJuncao'), fm('livreSuperTexto'),
    fm('livreComentario'), fm('livreDrawer'), lg('livreLigacao'), lg('livreLigacaoSimples'), ...COMUNS,
  ],
  nosql: [fm('colecao'), ...COMUNS],
};

export function rotuloPaleta(i: ItemPaleta): string {
  if (i.tipo === 'apagar') return 'Apagar';
  return i.tipo === 'forma' ? FORMAS[i.kind].rotulo : LIGACOES[i.kind].rotulo;
}

export function iconePaleta(i: ItemPaleta): string {
  if (i.tipo === 'apagar') return 'Borracha.png';
  return i.tipo === 'forma' ? FORMAS[i.kind].icone : LIGACOES[i.kind].icone;
}
