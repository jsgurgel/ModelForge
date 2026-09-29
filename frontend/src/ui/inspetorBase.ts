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

import { atualizarProps } from '../editor/ops';
import { PASSOS_ZOOM, indiceDoZoom, rotuloZoom, Config } from '../editor/config';
import { caminhoDaLigacao } from '../editor/roteamento';
import { mutar } from '../editor/store';
import { Diagrama, Forma, Ligacao, NOME_TIPO } from '../editor/types';
import { FORMAS } from '../shapes/registry';
import { Grupo, Prop } from './PropertyGrid';
import { area, bool, cor, leitura, num, sel, txt } from './propHelpers';
import { FonteSel, estiloDaFonte } from './fontesCores';
import { fonte as linhaFonte } from './propHelpers';

/** Linhas-base do Inspector. */

/** Formas cujo campo de texto se chama "Nome/Texto" (formas não retangulares e processo da EAP). */
export const NOME_TEXTO = new Set(['fluxProcesso', 'fluxDocumento', 'fluxVDocumentos', 'fluxNota', 'eapProcesso']);

/** Formas em que o campo é "Texto" (Texto, Desenhador e os textos apensos). */
export const ROTULO_TEXTO = new Set(['texto', 'desenhador', 'fluxSeta', 'setaAtividade']);

/** Sem o campo Dicionário. */
export const SEM_DICIONARIO = new Set(['texto', 'legenda', 'fluxSeta', 'setaAtividade']);

export function rotuloDoNome(kind: string): string {
  if (ROTULO_TEXTO.has(kind)) return 'Texto';
  if (NOME_TEXTO.has(kind) || (kind.startsWith('livre') && kind !== 'livreDrawer' && kind !== 'livreTriangulo')) return 'Nome/Texto';
  return 'Nome';
}

export const temDicionario = (kind: string): boolean => !SEM_DICIONARIO.has(kind);

const FONTE_BASE = (doc: Diagrama, f?: Forma): FonteSel => ({
  nome: f?.fonte?.nome ?? doc.fonte.nome,
  tamanho: f?.fonte?.tamanho ?? doc.fonte.tamanho,
  negrito: f?.fonte?.negrito ?? doc.fonte.negrito,
  italico: f?.fonte?.italico ?? doc.fonte.italico,
});
export const fonteEfetiva = FONTE_BASE;

/** Bloco de dimensão de uma linha: largura/altura da caixa que a envolve, somente leitura. */
export function dimensoesDaLinha(doc: Diagrama, l: Ligacao): { w: number; h: number } | null {
  const cam = caminhoDaLigacao(doc, l);
  if (!cam) return null;
  const xs = cam.pontos.map((p) => p.x);
  const ys = cam.pontos.map((p) => p.y);
  return { w: Math.round(Math.max(...xs) - Math.min(...xs)), h: Math.round(Math.max(...ys) - Math.min(...ys)) };
}

export function gruposDimensoesLinha(doc: Diagrama, l: Ligacao): Grupo {
  const d = dimensoesDaLinha(doc, l);
  return { titulo: 'Dimensões, cor e etc.', props: [leitura('Largura', d?.w ?? 0), leitura('Altura', d?.h ?? 0)] };
}

// ------------------------------------------------------------------ diagrama

export function gruposDiagrama(doc: Diagrama, cfg: Pick<Config, 'mostrarIds'>, comandoFonte: (f: FonteSel) => void): Grupo[] {
  const fonte = FONTE_BASE(doc);
  const versao: Prop[] = [
    leitura('Versão do diagrama', doc.versao),
    txt('Nome', doc.nome, (v) => v.trim() && mutar((d) => ({ ...d, nome: v }))),
  ];
  if (cfg.mostrarIds) versao.push(leitura('ID ÚNICO', doc.id ?? ''));
  versao.push(
    leitura('Arquivo', doc.arquivo),
    area('Autor(es)', doc.autores, (v) => mutar((d) => ({ ...d, autores: v }))),
    area('Observações', doc.observacoes, (v) => mutar((d) => ({ ...d, observacoes: v }))),
    leitura('Diagrama', NOME_TIPO[doc.tipo]),
  );
  const passos = PASSOS_ZOOM.map(rotuloZoom);
  return [
    { titulo: 'Versão', props: versao },
    {
      titulo: 'Dimensões, cor e etc.',
      props: [
        leitura('Largura', doc.largura),
        leitura('Altura', doc.altura),
        sel('Zoom', passos[indiceDoZoom(doc.zoom)], passos, (v) => mutar((d) => ({ ...d, zoom: PASSOS_ZOOM[Math.max(0, passos.indexOf(v))] }), { historico: false })),
      ],
    },
    {
      titulo: 'Espaço para alinhamento',
      props: [
        num('Espaço horizontal', doc.espacoH, (v) => mutar((d) => ({ ...d, espacoH: v })), 0),
        num('Espaço vertical', doc.espacoV, (v) => mutar((d) => ({ ...d, espacoV: v })), 0),
      ],
    },
    {
      titulo: 'Fonte',
      props: [
        leitura('Nome fonte', fonte.nome),
        leitura('Tamanho da fonte', fonte.tamanho),
        leitura('Estilo da fonte', estiloDaFonte(fonte.negrito, fonte.italico)),
        linhaFonte('Editar fonte', fonte, comandoFonte),
      ],
    },
  ];
}

/** Aplica a fonte escolhida no seletor ao diagrama. */
export const definirFonteDoDiagrama = (f: FonteSel) => mutar((d) => ({ ...d, fonte: { ...d.fonte, ...f } }));

// ------------------------------------------------------------------ formas

/**
 * Grupos "Dimensões, cor e etc." e "Diagrama" de uma forma:
 * [ID], Esquerda, Acima, Largura, Altura, Ancorar, Editar fonte, Cor ... | Nome/Texto, Observação, Dicionário.
 */
export function gruposBaseDaForma(doc: Diagrama, f: Forma, cfg: Pick<Config, 'mostrarIds'>, semFonte: boolean, aplicar: (patch: Partial<Forma>) => void, aoMudarTexto: (v: string) => void): Grupo[] {
  const def = FORMAS[f.kind];
  const ap = (p: Record<string, unknown>) => mutar((d) => atualizarProps(d, f.id, p));
  const dim: Prop[] = [];
  if (cfg.mostrarIds) dim.push(leitura('ID', f.id));
  const fixa = !!def?.fixa;
  dim.push(
    num('Esquerda', f.x, (v) => aplicar({ x: Math.max(0, v) }), 0),
    num('Acima', f.y, (v) => aplicar({ y: Math.max(0, v) }), 0),
    fixa ? leitura('Largura', f.w) : num('Largura', f.w, (v) => aplicar({ w: Math.max(20, v) }), 20),
    fixa ? leitura('Altura', f.h) : num('Altura', f.h, (v) => aplicar({ h: Math.max(10, v) }), 10),
    bool('Ancorar', !!f.props.ancorado, (v) => ap({ ancorado: v })),
  );
  if (!semFonte) {
    dim.push(linhaFonte('Editar fonte', FONTE_BASE(doc, f), (n) => aplicar({ fonte: { ...f.fonte, ...n } }), FONTE_BASE(doc)));
  }
  dim.push(
    cor('Cor', f.corBorda, (v) => aplicar({ corBorda: v || undefined })),
    cor('Preenchimento', f.cor, (v) => aplicar({ cor: v || undefined })),
    cor('Cor do texto', f.corTexto, (v) => aplicar({ corTexto: v || undefined })),
  );
  const nome: Prop[] = [
    area(rotuloDoNome(f.kind), f.texto, aoMudarTexto),
    area('Observação', String(f.props.observacao ?? ''), (v) => ap({ observacao: v })),
  ];
  if (temDicionario(f.kind)) nome.push(area('Dicionário', String(f.props.descricao ?? ''), (v) => ap({ descricao: v })));
  return [
    { titulo: 'Dimensões, cor e etc.', props: dim },
    { titulo: 'Diagrama', props: nome },
  ];
}

/** Cores e fonte para uma seleção múltipla (aplica a todas as formas). */
export function gruposMultiplos(doc: Diagrama, formas: Forma[], semFonte: boolean, aplicar: (patch: Partial<Forma>) => void): Grupo[] {
  const p = formas[0];
  const grupos: Grupo[] = [{
    titulo: 'Cores',
    props: [
      cor('Cor', p.corBorda, (v) => aplicar({ corBorda: v || undefined })),
      cor('Preenchimento', p.cor, (v) => aplicar({ cor: v || undefined })),
      cor('Cor do texto', p.corTexto, (v) => aplicar({ corTexto: v || undefined })),
    ],
  }];
  if (!semFonte) grupos.push({ titulo: 'Fonte', props: [linhaFonte('Editar fonte', FONTE_BASE(doc, p), (n) => aplicar({ fonte: { ...p.fonte, ...n } }), FONTE_BASE(doc))] });
  return grupos;
}
