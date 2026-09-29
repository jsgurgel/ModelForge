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

/**
 * Diagrama CONCEITUAL no modelo do ModelForge: tipos, mapeamento e utilitários de leitura.
 * Os conversores/validador/importador em `src/geradores/` trabalham sobre ele. (Não altera `tipos.ts`: tudo o que
 * não cabe nos campos genéricos de Forma/Ligacao vai em `props`.)
 *
 * ============================================================================================================
 * MAPEAMENTO
 * ============================================================================================================
 * TUDO é forma ou ligação do mesmo diagrama: atributos são formas presas ao dono por uma ligação, e a
 * cardinalidade fica na ligação entidade<->relacionamento:
 *
 * FORMAS (`Diagrama.formas`, na ordem de empilhamento: primeiro = mais ao fundo; os conversores processam
 * os itens do diagrama nessa ordem):
 *
 *   kind                  conceito                                props
 *   --------------------  --------------------------------------  ---------------------------------------------
 *   entidade              Entidade                                descricao (textoAdicional/dicionário),
 *                                                                 observacao, atributosOcultos ("nome [tipo]" por linha)
 *   relacionamento        Relacionamento (sem auto-relação)       descricao, observacao
 *   autorelacionamento    Relacionamento com as DUAS ligações     idem (é derivado: ver `ehAutoRelacionamento`;
 *                         de entidade na mesma entidade           o kind serve só ao desenho)
 *   entidadeAssociativa   EntidadeAssociativa (= entidade       descricao, observacao, atributosOcultos e
 *                         que contém um Relacionamento INTERNO)   `interno: { texto, descricao, observacao }`
 *                                                                 (o Relacionamento interno; ver "interno" abaixo)
 *   atributo              Atributo (multivalorado = false)        tipo (tipoAtributo), identificador, opcional,
 *   atributoMulti         Atributo (multivalorado = true)         multivalorado, cardMin (int), cardMax (int; -1 = n),
 *                                                                 direcao ('Left'|'Right' = lado do círculo),
 *                                                                 descricao (dicionário), observacao
 *   especializacao        Especializacao                          parcial (flag cru),                   
 *   especializacaoExclusiva                                       direcao ('Up'|'Right'|'Down'|'Left'), descricao,
 *   especializacaoDupla   (as 3 são o MESMO conceito:             observacao. Exclusiva/não exclusiva e total/parcial
 *                          "exclusiva/dupla" são só atalhos de    são DERIVADAS da estrutura (ver `Especializacao*`
 *                          criação; o que vale é a estrutura)     abaixo), nunca do kind.
 *   uniao, uniaoEntidades Uniao                                   direcao, descricao, observacao
 *
 *   Texto/Legenda/Desenhador (acessórios) não são tratados aqui (ficam de fora da conversão).
 *
 * LIGAÇÕES (`Diagrama.ligacoes`, todas kind 'linha'; a geometria é derivada das formas):
 *
 *   1. dono -> atributo: `de` = dono (entidade, relacionamento, entidadeAssociativa ou OUTRO atributo, no caso de
 *      atributo composto), `para` = atributo. A ordem em `ligacoes` é a ordem dos "pontos ligados", que
 *      define a ordem dos atributos/campos. Sem cardinalidade (cardDe = cardPara = '').
 *   2. entidade -> relacionamento: `de` = entidade (ou entidadeAssociativa atuando como entidade),
 *      `para` = relacionamento (ou entidadeAssociativa, ver `interno`). `cardDe` = texto da `Cardinalidade`
 *      da Ligacao, na forma "(1,1)" | "(0,1)" | "(1,n)" | "(0,n)"; `cardPara` = ''.
 *      props: `papel`, `duplaLinha` (true = entidade fraca / linha dupla).
 *   3. entidade -> especializacao / uniao: `de` = entidade, `para` = especializacao|uniao.
 *      props.principal = true na ligação da entidade GENERALIZADA / RESULTANTE (o "ponto principal" do triângulo,
 *      `LigadaAoPontoPrincipal()`); as demais ligações são as entidades especializadas / unidas.
 *
 *   `props.interno` (boolean, default false): true quando a ponta que é `entidadeAssociativa` é, na verdade, o seu
 *   Relacionamento INTERNO (as entidades/atributos do "relacionamento" ligam nele, não na caixa externa).
 *   Ligações de entidade -> associativa e de associativa -> atributo com interno=true pertencem ao interno;
 *   sem a marca, pertencem à associativa atuando como entidade (ela também pode ter atributos e ligar-se a outros
 *   relacionamentos).
 *
 * O QUE É DERIVADO (não guardado): auto-relacionamento, especialização total/parcial (parcial só vale com >1 formas
 * ligadas e ponto principal), exclusiva (o principal só é principal de UMA especialização) vs não exclusiva (de várias),
 * atributo composto (tem ligações onde ele é `de`).
 *
 * DICIONÁRIO E OBSERVAÇÃO: `Forma.props.descricao` = texto do dicionário de dados e
 * `props.observacao` = `observacao`. Na conversão para o Lógico viram `descricao`/`observacao` da tabela e
 * `dicionario`/`observacao` do campo (mesmos nomes de `tipos.ts`).
 */
import type { Diagrama, Forma, Ligacao } from './tipos';

export const KINDS_CONCEITUAL = [
  'entidade', 'relacionamento', 'autorelacionamento', 'entidadeAssociativa', 'atributo', 'atributoMulti',
  'especializacao', 'especializacaoExclusiva', 'especializacaoDupla', 'uniao', 'uniaoEntidades',
] as const;

/** Cardinalidades, NESTA ORDEM (C11, C01, C1N, C0N) - a conversão compara por ordinal. */
export const CARDINALIDADES = ['(1,1)', '(0,1)', '(1,n)', '(0,n)'] as const;
export type Cardinalidade = (typeof CARDINALIDADES)[number];

/** Ordinal da cardinalidade; texto desconhecido vira (0,n). */
export function cardParaInt(c: string | null | undefined): number {
  const i = CARDINALIDADES.indexOf(c as Cardinalidade);
  return i < 0 ? 3 : i;
}

/** Texto da cardinalidade: "(?,?)" para índice fora do enum. */
export function cardParaTexto(i: number): string {
  if (i < 0 || i >= CARDINALIDADES.length) return '(?,?)';
  return CARDINALIDADES[i];
}

export interface PropsEntidade {
  descricao?: string;
  observacao?: string;
  atributosOcultos?: string;
}

export interface PropsEntidadeAssociativa extends PropsEntidade {
  interno?: { texto?: string; descricao?: string; observacao?: string };
}

export interface PropsAtributo {
  tipo?: string;
  identificador?: boolean;
  opcional?: boolean;
  multivalorado?: boolean;
  cardMin?: number;
  cardMax?: number;
  direcao?: 'Left' | 'Right';
  descricao?: string;
  observacao?: string;
}

export interface PropsEspecializacao {
  parcial?: boolean;
  direcao?: string;
  descricao?: string;
  observacao?: string;
}

export interface PropsLigacaoConceitual {
  papel?: string;
  duplaLinha?: boolean;
  interno?: boolean;
  principal?: boolean;
}

// ------------------------------------------------------------------------------------------------------------
// Utilitários de leitura
// ------------------------------------------------------------------------------------------------------------

export const ehAtributo = (f: Forma): boolean => f.kind === 'atributo' || f.kind === 'atributoMulti';
export const ehRelacionamento = (f: Forma): boolean => f.kind === 'relacionamento' || f.kind === 'autorelacionamento';
export const ehEspecializacao = (f: Forma): boolean => f.kind.startsWith('especializacao');
export const ehUniao = (f: Forma): boolean => f.kind === 'uniao' || f.kind === 'uniaoEntidades';
/** Entidade ou EntidadeAssociativa. */
export const ehPreEntidade = (f: Forma): boolean => f.kind === 'entidade' || f.kind === 'entidadeAssociativa';

export function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Uma ponta de ligação vista de uma forma: a Ligacao, a forma da outra ponta e se a ligação é do "interno". */
export interface Ponto {
  lig: Ligacao;
  outra: Forma;
  /** true quando esta forma é o dono (`de`) da ligação. */
  souDe: boolean;
}

/**
 * Índice de leitura de um diagrama conceitual: pontos ligados, formas ligadas, atributos, ponto principal,
 * auto-relacionamento etc.
 */
export class GrafoConceitual {
  readonly formas: Forma[];
  readonly ligacoes: Ligacao[];
  private porId = new Map<string, Forma>();

  constructor(public readonly diagrama: Diagrama) {
    this.formas = diagrama.formas;
    this.ligacoes = diagrama.ligacoes;
    for (const f of this.formas) this.porId.set(f.id, f);
  }

  forma(id: string): Forma | undefined {
    return this.porId.get(id);
  }

  ehInterno(l: Ligacao): boolean {
    return l.props?.interno === true;
  }

  /**
   * "Pontos ligados" de uma forma, na ordem das ligações. Para a entidade associativa, `interno` escolhe entre os
   * pontos do Relacionamento interno (true) e os da caixa externa (false); nas demais formas é ignorado.
   */
  pontos(f: Forma, interno = false): Ponto[] {
    const res: Ponto[] = [];
    for (const l of this.ligacoes) {
      const souDe = l.de === f.id;
      const souPara = l.para === f.id;
      if (!souDe && !souPara) continue;
      const outra = this.porId.get(souDe ? l.para : l.de);
      if (!outra) continue;
      if (f.kind === 'entidadeAssociativa') {
        // `interno` marca a ponta que age como RELACIONAMENTO: `para` numa ligação entidade->relacionamento,
        // `de` (o dono) numa ligação dono->atributo. A outra ponta age como entidade (caixa externa).
        const agindoComoInterno = this.ehInterno(l) && (souDe ? ehAtributo(outra) : !ehAtributo(outra));
        if (agindoComoInterno !== interno) continue;
      }
      res.push({ lig: l, outra, souDe });
    }
    return res;
  }

  /** Formas ligadas, sem repetição. */
  formasLigadas(f: Forma, interno = false): Forma[] {
    const res: Forma[] = [];
    for (const p of this.pontos(f, interno)) if (!res.includes(p.outra)) res.push(p.outra);
    return res;
  }

  /** Atributos diretamente ligados ao dono, na ordem dos pontos. */
  atributos(f: Forma, interno = false): Forma[] {
    return this.pontos(f, interno).filter((p) => p.souDe && ehAtributo(p.outra)).map((p) => p.outra);
  }

  /** Sub-atributos de um atributo composto. */
  subAtributos(a: Forma): Forma[] {
    return this.atributos(a);
  }

  isComposto(a: Forma): boolean {
    return this.subAtributos(a).length > 0;
  }

  /** Ligações entidade-relacionamento de um relacionamento (as que têm cardinalidade), na ordem dos pontos. */
  ligacoesDeEntidade(rel: Forma, interno = false): Ponto[] {
    return this.pontos(rel, interno).filter((p) => !p.souDe && ehPreEntidade(p.outra));
  }

  /** Auto-relacionamento: exatamente duas ligações de entidade e para a mesma entidade. */
  ehAutoRelacionamento(rel: Forma, interno = false): boolean {
    const l = this.ligacoesDeEntidade(rel, interno);
    return l.length === 2 && l[0].outra === l[1].outra;
  }

  /** Entidade principal (generalizada / resultante) de uma especialização ou união, ou null (`LigadaAoPontoPrincipal`). */
  principal(esp: Forma): Forma | null {
    for (const p of this.pontos(esp)) if (p.lig.props?.principal === true && ehPreEntidade(p.outra)) return p.outra;
    return null;
  }

  /** Quantidade de pontos ligados. */
  qtdPontos(f: Forma): number {
    return this.pontos(f).length;
  }

  /** Especialização parcial: só vale com mais de uma forma ligada e um ponto principal. */
  isParcial(esp: Forma): boolean {
    return this.formasLigadas(esp).length > 1 && this.principal(esp) !== null && esp.props?.parcial === true;
  }

  isTotal(esp: Forma): boolean {
    return !this.isParcial(esp) && this.principal(esp) !== null;
  }

  /** Especializações cujo ponto principal é `ent`. */
  private especializacoesDe(ent: Forma): Forma[] {
    return this.formasLigadas(ent).filter((f) => ehEspecializacao(f) && this.principal(f) === ent);
  }

  isNaoExclusiva(esp: Forma): boolean {
    const t = this.principal(esp);
    return this.formasLigadas(esp).length > 1 && t !== null && this.especializacoesDe(t).length > 1;
  }

  isExclusiva(esp: Forma): boolean {
    const t = this.principal(esp);
    return this.formasLigadas(esp).length > 1 && t !== null && this.especializacoesDe(t).length === 1;
  }
}
