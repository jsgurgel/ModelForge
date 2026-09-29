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

import { COR_TOKEN, tokenizar } from '../editor/realce';
import { ReactNode } from 'react';
import { setasDaLogicoLinha } from '../editor/logicoLinha';
import { useRoqueLigacao } from '../editor/roque';
import { CorpoObjetoLogico, RoqueTabela } from './renderLogico';
import { ALT_LINHA, ALT_TITULO, camposDaTabela, linhasColecao } from '../editor/geometry';
import { alturasDaLegenda, itensDaLegenda, tipoDaLegenda } from '../editor/legenda';
import { cabecasDaSeta, caixaDosItens, caminhoDoItem, geometriaDaSeta, itensDoDesenho, tipoDoDesenhador } from '../editor/desenhador';
import { layoutTabela, nomeDaConstraint, opcoesDaTabela, validarConstraint } from '../editor/logico';
import { caminhoDaLigacao } from '../editor/roteamento';
import { DrawerSvg } from './renderDrawer';
import { TextoApensoSvg } from './renderApenso';
import { FonteCard, caixaDaCardinalidade } from '../editor/cardinalidade';
import { ehAtributoKind, textoDoAtributo } from '../editor/atributo';
import { ehComposto, internoDaAssociativa, parcialEfetiva, pontoEBandaParcial } from '../editor/conceitual';
import { CampoNoSql, CampoTabela, Diagrama, Forma, Ligacao, PropsTabela } from '../editor/types';
import { caminhoComentario, caminhoDocumento, caminhoNotaOndulada, caminhoVariosDocumentos, larguraDeSetaValida, pontosDeSeta, pontosParaSvg, pontosTriangulo } from './caminhos';
import { quebrarLinhas } from './texto';
import { FORMAS, LIGACOES, PALETA } from './registry';

const icone = (nome: string) => `/icons/${nome}`;

function fundo(f: Forma, padrao: string): string {
  const c = f.cor || padrao;
  return c === '#ffffff' ? 'var(--forma-branco)' : c;
}

function estiloTexto(doc: Diagrama, f?: Forma) {
  const fonte = { ...doc.fonte, ...(f?.fonte ?? {}) };
  return {
    fontFamily: fonte.nome,
    fontSize: fonte.tamanho,
    fontWeight: fonte.negrito ? 700 : 400,
    fontStyle: fonte.italico ? 'italic' : 'normal',
    fill: f?.corTexto || 'var(--forma-texto)',
  } as const;
}

const tamFonte = (doc: Diagrama, f?: Forma) => f?.fonte?.tamanho ?? doc.fonte.tamanho;
const negritoDe = (doc: Diagrama, f?: Forma) => f?.fonte?.negrito ?? doc.fonte.negrito;

// ------------------------------------------------------------------ estilo (gradiente / opacidade)

export interface EstiloForma { gradiente: boolean; c1: string; c2: string; dir: string; alfa: number }

const LIVRES = new Set([
  'livreRetangulo', 'livreRetanguloArr', 'livreDocumento', 'livreVariosDocumentos', 'livreNota', 'livreCirculo',
  'livreLosango', 'livreComentario', 'livreJuncao', 'livreSuperTexto',
]);
const OBJETOS_LOGICOS = new Set(['view', 'seq', 'domain', 'enum', 'routine']);

/** Padrões: Tabela/Coleção (alfa .25), demais objetos lógicos (.5), Livre* (gradiente, .8), Raia (.4). */
export function estiloDaForma(f: Forma): EstiloForma {
  const geo = FORMAS[f.kind]?.geo;
  let e: EstiloForma = { gradiente: false, c1: '#000000', c2: '#cccccc', dir: 'Vertical', alfa: 1 };
  if (geo === 'table' || geo === 'colecao') e = { ...e, gradiente: true, alfa: 0.25 };
  else if (geo && OBJETOS_LOGICOS.has(geo)) e = { ...e, gradiente: true, alfa: 0.5 };
  else if (f.kind === 'eapProcesso') e = { ...e, gradiente: true, c1: '#ffffff', alfa: 0.5 };
  else if (LIVRES.has(f.kind)) e = { ...e, gradiente: true, c2: '#ffffff', alfa: 0.8 };
  else if (f.kind === 'livreTriangulo') e = { ...e, gradiente: true, alfa: 0.8 };
  else if (geo === 'lane') e = { ...e, gradiente: true, c1: '#c0c0c0', c2: '#ffffff', dir: 'Horizontal', alfa: 0.4 };
  else if (geo === 'text') e = { ...e, alfa: 0.8 };
  const p = f.props;
  if (typeof p.gradiente === 'boolean') e.gradiente = p.gradiente;
  if (typeof p.gradCor1 === 'string' && p.gradCor1) e.c1 = p.gradCor1;
  if (typeof p.gradCor2 === 'string' && p.gradCor2) e.c2 = p.gradCor2;
  if (typeof p.gradDir === 'string') e.dir = p.gradDir;
  if (typeof p.alfa === 'number') e.alfa = Math.min(100, Math.max(0, p.alfa)) / 100;
  return e;
}

interface Pintura { fill: string; fillOpacity?: number }

function Gradiente({ id, e }: { id: string; e: EstiloForma }) {
  const [x2, y2] = e.dir === 'Horizontal' ? [1, 0] : e.dir === 'Diagonal' ? [1, 1] : [0, 1];
  return (
    <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
      <stop offset="0%" stopColor={e.c1} />
      <stop offset="100%" stopColor={e.c2} />
    </linearGradient>
  );
}

// ------------------------------------------------------------------ texto

function Linhas({ texto, x, y, doc, f, anchor = 'middle', vertical = true, max }: {
  texto: string; x: number; y: number; doc: Diagrama; f?: Forma; anchor?: 'start' | 'middle' | 'end'; vertical?: boolean; max?: number;
}) {
  const tam = tamFonte(doc, f);
  const linhas = max ? quebrarLinhas(texto, max, tam, negritoDe(doc, f)) : texto.split('\n');
  const passo = tam + 3;
  const inicio = vertical ? y - ((linhas.length - 1) * passo) / 2 : y;
  return (
    <text textAnchor={anchor} dominantBaseline="central" style={estiloTexto(doc, f)} className="forma-texto">
      {linhas.map((l, i) => (
        <tspan key={i} x={x} y={inicio + i * passo}>{l || ' '}</tspan>
      ))}
    </text>
  );
}

type Alinhamento = 'Centro' | 'Esquerda' | 'Direita';
const alinhamentoDe = (f: Forma): Alinhamento => (f.props.alinhamento === 'Esquerda' || f.props.alinhamento === 'Direita' ? f.props.alinhamento : 'Centro');

/** Texto dentro de uma área: alinhamento horizontal, "centrar vertical" e corte pela área (DesenhadorDeTexto). */
function Bloco({ texto, x, y, w, h, alinh, vcentro, doc, f, fill }: {
  texto: string; x: number; y: number; w: number; h: number; alinh: Alinhamento; vcentro: boolean; doc: Diagrama; f: Forma; fill?: string;
}) {
  if (w <= 0 || h <= 0) return null;
  const tam = tamFonte(doc, f);
  const passo = tam + 3;
  const linhas = quebrarLinhas(texto, w - 4, tam, negritoDe(doc, f));
  const total = linhas.length * passo;
  const y0 = (vcentro ? Math.max(0, (h - total) / 2) : 0) + passo / 2;
  const ax = alinh === 'Esquerda' ? 2 : alinh === 'Direita' ? w - 2 : w / 2;
  const anchor = alinh === 'Esquerda' ? 'start' : alinh === 'Direita' ? 'end' : 'middle';
  const st = estiloTexto(doc, f);
  return (
    <svg x={x} y={y} width={w} height={h} overflow="hidden">
      <text textAnchor={anchor} dominantBaseline="central" style={fill ? { ...st, fill } : st} className="forma-texto">
        {linhas.map((l, i) => <tspan key={i} x={ax} y={y0 + i * passo}>{l || ' '}</tspan>)}
      </text>
    </svg>
  );
}

// ------------------------------------------------------------------ cabeçalho / objetos lógicos

const roundrectDe = (f: Forma, padrao: number) => (typeof f.props.roundrect === 'number' ? Number(f.props.roundrect) : padrao);

function Cabecalho({ f, doc, subtitulo, pf, ry }: { f: Forma; doc: Diagrama; subtitulo?: string; pf: Pintura; ry?: number }) {
  const r = Math.min(roundrectDe(f, 22) / 2, f.h / 2, f.w / 2);
  const borda = f.corBorda || 'var(--forma-borda)';
  return (
    <>
      {pf.fillOpacity !== undefined && <rect width={f.w} height={f.h} fill="var(--forma-branco)" rx={ry ?? r} />}
      <rect width={f.w} height={f.h} {...pf} rx={ry ?? r} />
      <rect width={f.w} height={f.h} fill="none" stroke={borda} rx={ry ?? r} />
      {f.props.delimite !== false && <line x1={1} x2={f.w - 1} y1={ALT_TITULO} y2={ALT_TITULO} stroke={borda} />}
      <Linhas texto={f.texto} x={f.w / 2} y={subtitulo ? 9 : ALT_TITULO / 2} doc={doc} f={f} max={f.w - 8} />
      {subtitulo && <text x={f.w / 2} y={19} textAnchor="middle" className="forma-sub" fontSize={9}>{subtitulo}</text>}
    </>
  );
}

const ICONE_IR: Record<string, string> = { PK: 'ir_pk.png', FK: 'ir_fk.png', UNIQUE: 'CampoUN.png', CHECK: 'ir_check.png' };

function Tabela({ f, doc, pf }: { f: Forma; doc: Diagrama; pf: Pintura }) {
  const campos = camposDaTabela(f);
  const p = f.props as unknown as PropsTabela;
  const tam = tamFonte(doc, f);
  const L = layoutTabela(f, tam, doc);
  const o = opcoesDaTabela(f);
  const borda = f.corBorda || 'var(--forma-borda)';
  const secao = (y: number) => <line x1={1} x2={f.w - 1} y1={y - 2} y2={y - 2} stroke={borda} strokeOpacity={0.6} />;
  return (
    <>
      <Cabecalho f={f} doc={doc} pf={pf} />
      {!o.plain && campos.map((c: CampoTabela, i) => {
        const y = L.yCampos + i * ALT_LINHA;
        const img = c.pk && c.fk ? 'CampoKFK.png' : c.pk ? 'CampoK.png' : c.fk ? 'CampoFK.png' : c.unique ? 'CampoUN.png' : 'Campo.png';
        return (
          <g key={c.id}>
            <image href={icone(img)} x={4} y={y + 2} width={14} height={14} />
            <text x={22} y={y + ALT_LINHA / 2 + 1} dominantBaseline="central" className="campo-texto" style={{ fontSize: tam - 1 }}>
              {c.nome}<tspan className="campo-tipo">: {c.tipo}</tspan>
            </text>
          </g>
        );
      })}
      {o.plain && L.plain && (
        <g className="campo-texto" style={{ fontSize: tam - 1 }}>
          <text x={3} y={L.plain.linhas[0].y} dominantBaseline="central">{L.plain.titulo}</text>
          {L.plain.linhas.map((ln, i) => ln.itens.map((it) => {
            const c = campos.find((k) => k.id === it.campoId);
            return (
              <g key={it.campoId}>
                <text x={it.x} y={ln.y + (i === 0 ? 0 : 0)} dominantBaseline="central">{it.texto}</text>
                {c?.pk && <line x1={it.x} x2={it.x + it.largura - 4} y1={ln.y - L.plain!.rowH / 2 + 2} y2={ln.y - L.plain!.rowH / 2 + 2} stroke={borda} />}
                {c?.fk && <line x1={it.x} x2={it.x + it.largura - 4} y1={ln.y + L.plain!.rowH / 2 - 2} y2={ln.y + L.plain!.rowH / 2 - 2} stroke={borda} />}
              </g>
            );
          }))}
          <text x={L.plain.fecha.x} y={L.plain.fecha.y} dominantBaseline="central">{'}'}</text>
        </g>
      )}
      {L.yIR !== null && (
        <>
          {secao(L.yIR)}
          {o.plainIR
            ? p.constraints.map((c, i) => {
              const ok = validarConstraint(f, c, doc) === 'ok';
              const x = 1 + i * (L.rowIR + 2);
              return (
                <g key={c.id}>
                  <title>{nomeDaConstraint(c)}</title>
                  <image href={icone(ICONE_IR[c.tipo])} x={x + 3} y={L.yIR! + 3} width={16} height={16} />
                  {!ok && <rect x={x + 2} y={L.yIR! + 2} width={18} height={18} rx={4} fill="none" stroke="#d9480f" />}
                </g>
              );
            })
            : p.constraints.map((c, i) => {
              const y = L.yIR! + i * L.rowIR;
              const ok = validarConstraint(f, c, doc) === 'ok';
              return (
                <g key={c.id}>
                  <image href={icone(ICONE_IR[c.tipo])} x={4} y={y + 3} width={16} height={16} />
                  {!ok && <rect x={3} y={y + 2} width={18} height={18} rx={4} fill="none" stroke="#d9480f" />}
                  <text x={24} y={y + L.rowIR / 2 + 1} dominantBaseline="central" className="campo-texto" style={{ fontSize: tam - 1 }}>{nomeDaConstraint(c)}</text>
                </g>
              );
            })}
        </>
      )}
      {L.yIndices !== null && (
        <>
          {secao(L.yIndices)}
          {p.indices.map((ix, i) => (
            <g key={ix.id}>
              <image href={icone('indice.png')} x={4} y={L.yIndices! + i * L.rowIR + 3} width={16} height={16} />
              <text x={24} y={L.yIndices! + i * L.rowIR + L.rowIR / 2 + 1} dominantBaseline="central" className="campo-texto" style={{ fontSize: tam - 1 }}>{ix.nome || 'índice'}</text>
            </g>
          ))}
        </>
      )}
      {L.yGatilhos !== null && (
        <>
          {secao(L.yGatilhos)}
          {p.gatilhos.map((gt, i) => (
            <g key={gt.id}>
              <image href={icone('gatilho.png')} x={4} y={L.yGatilhos! + i * L.rowIR + 3} width={16} height={16} />
              <text x={24} y={L.yGatilhos! + i * L.rowIR + L.rowIR / 2 + 1} dominantBaseline="central" className="campo-texto" style={{ fontSize: tam - 1 }}>{gt.nome || 'gatilho'}</text>
            </g>
          ))}
        </>
      )}
      {L.yDDL !== null && (
        <>
          {secao(L.yDDL)}
          <svg x={0} y={L.yDDL} width={f.w} height={Math.max(0, f.h - L.yDDL)} overflow="hidden">
            {L.ddl.map((ln, i) => (
              <text key={i} x={4} y={(tam + 2) * (i + 1) - 2} xmlSpace="preserve" className="campo-texto" style={{ fontSize: tam - 2, whiteSpace: 'pre' }}>{tokenizar(ln, 'sql').map((t, k) => <tspan key={k} fill={COR_TOKEN[t.tipo]}>{t.texto}</tspan>)}</text>
            ))}
          </svg>
        </>
      )}
      <RoqueTabela f={f} doc={doc} tam={tam} />
    </>
  );
}

function Colecao({ f, doc, pf }: { f: Forma; doc: Diagrama; pf: Pintura }) {
  const linhas = linhasColecao((f.props.campos as CampoNoSql[] | undefined) ?? []);
  return (
    <>
      <Cabecalho f={f} doc={doc} pf={pf} />
      {linhas.map((l, i) => (
        <text key={i} x={8 + l.nivel * 12} y={ALT_TITULO + i * ALT_LINHA + ALT_LINHA / 2 + 1} dominantBaseline="central" className="campo-texto" style={{ fontSize: doc.fonte.tamanho - 1 }}>
          {l.texto}
        </text>
      ))}
    </>
  );
}

//# Padrão: direção Left = círculo à esquerda.
const ladoEsquerdo = (f: Forma) => f.props.direcao !== 'Right';

function corpoLinhas(texto: string): string[] {
  return texto.split('\n').filter(Boolean).slice(0, 4);
}


// ------------------------------------------------------------------ Texto

const TIPO_TEXTO = (f: Forma): 'embranco' | 'nota' | 'retangulo' | 'arredondado' => {
  const t = f.props.tipoTexto;
  return t === 'embranco' || t === 'retangulo' || t === 'arredondado' ? t : 'nota';
};

function TextoForma({ f, doc, gradId, e }: { f: Forma; doc: Diagrama; gradId?: string; e: EstiloForma }) {
  const p = f.props;
  const tipo = TIPO_TEXTO(f);
  const borda = f.corBorda || 'var(--forma-texto)';
  const fundoCor = String(p.corFundo || '#ffffff');
  const sombra = p.sombra !== false;
  const corSombra = String(p.corSombra || '#333333');
  const paint: Pintura = { fill: e.gradiente && gradId ? `url(#${gradId})` : fundoCor === '#ffffff' ? 'var(--forma-branco)' : fundoCor, fillOpacity: e.alfa };
  const titulo = p.pintarTitulo && String(p.titulo ?? '') ? String(p.titulo) : '';
  const tam = tamFonte(doc, f);
  const db = 6;
  const tituloH = titulo ? Math.round(tam * 1.5) + db : 0;
  const rx = 6;
  const detalhe = e.gradiente && p.gradDetalhe !== false && (tipo === 'retangulo' || tipo === 'arredondado');
  const stroke = tipo === 'nota' ? borda : sombra ? corSombra : borda;
  return (
    <>
      {tipo === 'nota' && (
        <>
          <path d={caminhoComentario(f.w, f.h)} {...paint} stroke={borda} />
        </>
      )}
      {(tipo === 'retangulo' || tipo === 'arredondado') && (
        <>
          {sombra && <path d={`M2,${f.h} H${f.w + 2} V2 M2,${f.h + 1} H${f.w + 2} V3`} stroke={corSombra} strokeWidth={2} fill="none" />}
          <rect width={f.w} height={f.h} rx={tipo === 'arredondado' ? rx : 0} {...paint} stroke={stroke} />
          {detalhe && <path d={`M2,2 Q${f.w / 2 + 1},${f.h / 2 + 1} ${f.w - 1},2 Z`} fill={String(p.gradCorDetalhe || '#666666')} />}
        </>
      )}
      {tipo === 'embranco' && <rect width={f.w} height={f.h} fill="transparent" />}
      {titulo && (
        <svg x={0} y={0} width={f.w} height={tituloH} overflow="hidden">
          <text x={db} y={Math.round(tam * 1.5)} style={estiloTexto(doc, f)} className="forma-texto">{titulo}</text>
        </svg>
      )}
      <Bloco texto={f.texto} x={4} y={titulo ? tituloH : 4} w={f.w - 8} h={f.h - (titulo ? tituloH : 4) - 4} alinh={alinhamentoDe(f)} vcentro={!!p.centrarVertical} doc={doc} f={f} />
    </>
  );
}

// ------------------------------------------------------------------ Legenda

function LegendaForma({ f, doc, pf }: { f: Forma; doc: Diagrama; pf: Pintura }) {
  const tipo = tipoDaLegenda(f);
  const itens = itensDaLegenda(f);
  const tam = tamFonte(doc, f) - 2;
  const a = alturasDaLegenda(tamFonte(doc, f), tipo);
  const borda = String(f.props.corBordaLegenda || '#c0c0c0');
  const st = { ...estiloTexto(doc, f), fontSize: tam, fontWeight: 400 } as const;
  return (
    <>
      <rect width={f.w} height={f.h} {...pf} />
      <rect width={f.w - 1} height={f.h - 1} fill="none" stroke={borda} />
      <svg x={0} y={0} width={f.w} height={f.h} overflow="hidden">
        <text x={f.w / 2} y={a.titulo / 2 + 2} textAnchor="middle" dominantBaseline="central" style={estiloTexto(doc, f)} className="forma-texto">{f.texto}</text>
        {itens.map((it, i) => {
          const topo = a.titulo + i * (a.item + 4);
          const sel = f.props.itemSel === i;
          const cx = 2;
          return (
            <g key={i} opacity={0.8}>
              {sel && <rect x={cx} y={topo - 2} width={f.w} height={a.item + 4} fill="#ccccff" fillOpacity={0.4} />}
              {tipo === 'linhas' && (
                <>
                  <rect x={cx} y={topo + a.item / 2 - 2} width={3 * a.item - 2} height={4} rx={2} fill={it.cor} />
                  <text x={cx + 3 * a.item} y={topo + a.item / 2} dominantBaseline="central" style={st} className="forma-texto">{it.texto}</text>
                </>
              )}
              {tipo === 'objetos' && (
                <>
                  <filter id={`recor-${f.id}-${i}`} x="0" y="0" width="100%" height="100%">
                    <feFlood floodColor={it.cor} result="c" />
                    <feComposite in="c" in2="SourceAlpha" operator="in" />
                  </filter>
                  {(() => {
                    const arte = artefatoDaTag(doc, it.tag);
                    return arte ? <image href={icone(arte)} x={cx} y={topo} width={a.item - 2} height={a.item - 2} filter={`url(#recor-${f.id}-${i})`} /> : null;
                  })()}
                  <text x={cx + a.item + 2} y={topo + a.item / 2 + 1} dominantBaseline="central" style={st} className="forma-texto">{it.texto}</text>
                </>
              )}
              {tipo === 'cores' && (
                <>
                  <rect x={cx} y={topo} width={a.item - 4} height={a.item - 4} fill={it.cor} stroke="var(--forma-texto)" />
                  <text x={cx + a.item} y={topo + (a.item - 4) / 2} dominantBaseline="central" style={st} className="forma-texto">{it.texto}</text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </>
  );
}

/** Ícone do artefato `tag` (índice na lista de formas da paleta do diagrama). */
function artefatoDaTag(doc: Diagrama, tag: number): string | null {
  const lista = artefatosDaPaleta(doc);
  return lista[tag] ? FORMAS[lista[tag]]?.icone ?? null : null;
}

function artefatosDaPaleta(doc: Diagrama): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const p of PALETA[doc.tipo]) if (p.tipo === 'forma' && !vistos.has(p.kind)) { vistos.add(p.kind); out.push(p.kind); }
  return out;
}

// ------------------------------------------------------------------ Desenhador / desenho livre

function ItensDesenho({ f, e }: { f: Forma; e: EstiloForma }) {
  const itens = itensDoDesenho(f);
  return (
    <svg x={0} y={0} width={f.w} height={f.h} overflow="hidden">
      {itens.map((it, i) => {
        const fill = it.preencher ? it.cor : 'none';
        const comum = { fill, stroke: it.cor, strokeWidth: it.largura || 1, fillOpacity: it.preencher ? e.alfa : undefined };
        switch (it.tipo) {
          case 'retangulo': return <rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} {...comum} />;
          case 'elipse': return <ellipse key={i} cx={it.x + it.w / 2} cy={it.y + it.h / 2} rx={it.w / 2} ry={it.h / 2} {...comum} />;
          case 'linha': {
            const [a, b] = it.pontos ?? [];
            return a && b ? <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={it.cor} strokeWidth={it.largura || 1} /> : null;
          }
          default: return <path key={i} d={caminhoDoItem(it)} {...comum} fill={it.tipo === 'polilinha' ? fill : 'none'} strokeLinejoin="round" strokeLinecap="round" />;
        }
      })}
    </svg>
  );
}

function DesenhadorForma({ f, e }: { f: Forma; e: EstiloForma }) {
  const p = f.props;
  const tipo = tipoDoDesenhador(f);
  const alfa = typeof p.alfa === 'number' ? Math.min(100, Math.max(0, p.alfa)) / 100 : 1;
  if (tipo === 'seta') {
    const cor = String(p.setaCor || '#000000');
    const larg = Number(p.setaLargura ?? 2);
    const g = geometriaDaSeta(f.w, f.h, Number(p.anguloSeta ?? 0), Number(p.desvioX ?? 0), Number(p.desvioY ?? 0));
    const { linha, cabecas } = cabecasDaSeta(g, larg, p.pontaDireita !== false, p.pontaEsquerda !== false);
    return (
      <g transform="translate(2 2)">
        <line x1={linha[0].x} y1={linha[0].y} x2={linha[1].x} y2={linha[1].y} stroke={cor} strokeWidth={larg} strokeLinecap="round" />
        {cabecas.map((c, i) => <polygon key={i} points={pontosParaSvg(c)} fill={cor} stroke={cor} strokeLinejoin="round" />)}
      </g>
    );
  }
  if (tipo === 'livre') return <ItensDesenho f={f} e={{ ...e, alfa }} />;
  return p.src ? (
    <image href={String(p.src)} x={2} y={2} width={Math.max(1, f.w - 4)} height={Math.max(1, f.h - 4)} preserveAspectRatio="none" opacity={alfa} />
  ) : (
    <>
      <rect x={0.5} y={0.5} width={f.w - 1} height={f.h - 1} fill="none" stroke="#c0c0c0" />
      <text x={f.w / 2} y={f.h / 2} textAnchor="middle" dominantBaseline="central" className="campo-tipo">{f.texto || 'imagem'}</text>
    </>
  );
}

// ------------------------------------------------------------------ Raia

interface AreaRaia { texto: string; largura: number }
export const areasDaRaia = (f: Forma): AreaRaia[] => (Array.isArray(f.props.areas) ? (f.props.areas as AreaRaia[]) : []);

function Raia({ f, doc, e, gradId }: { f: Forma; doc: Diagrama; e: EstiloForma; gradId?: string }) {
  const tam = tamFonte(doc, f);
  const alturaTexto = Math.round(tam * 1.25 * 1.5);
  const borda = f.corBorda || 'var(--forma-borda)';
  const tracejado = f.props.dashed ? '1 2' : undefined;
  const areas = areasDaRaia(f);
  const padrao = String(f.props.areaPadrao ?? 'Área default');
  let x = 0;
  let ultimo = 2;
  let excesso = false;
  const divisorias: ReactNode[] = [];
  for (let i = 0; i < areas.length; i++) {
    x += Math.max(1, areas[i].largura);
    if (x >= f.w - 2 || x <= 0) { excesso = true; break; }
    divisorias.push(
      <g key={i}>
        <line x1={x} x2={x} y1={alturaTexto + 1} y2={f.h - 2} stroke={borda} strokeDasharray={tracejado} />
        <Bloco texto={areas[i].texto} x={x - areas[i].largura} y={alturaTexto + 1} w={areas[i].largura} h={alturaTexto - 2} alinh="Centro" vcentro doc={doc} f={f} />
      </g>,
    );
    ultimo = x;
  }
  return (
    <>
      <rect width={f.w} height={f.h} fill="none" stroke={borda} strokeDasharray={tracejado} />
      <rect x={1} y={1} width={Math.max(0, f.w - 2)} height={2 * alturaTexto - 1} fill={gradId ? `url(#${gradId})` : 'var(--forma-titulo)'} fillOpacity={e.alfa} />
      <Bloco texto={f.texto} x={0} y={0} w={f.w} h={alturaTexto} alinh={alinhamentoDe(f)} vcentro doc={doc} f={f} />
      {divisorias}
      <Bloco texto={excesso ? `... ${padrao}` : padrao} x={ultimo} y={alturaTexto + 1} w={Math.max(0, f.w - ultimo)} h={alturaTexto - 2} alinh="Centro" vcentro doc={doc} f={f} />
      <line x1={0} x2={f.w} y1={alturaTexto - 1 + alturaTexto} y2={alturaTexto - 1 + alturaTexto} stroke={borda} strokeDasharray={tracejado} />
    </>
  );
}

// ------------------------------------------------------------------ Forma

/** Aplica os detalhes comuns de Forma (opacidade, gradiente, serrilhado) antes de desenhar a geometria. */
export function FormaSvg({ f, doc }: { f: Forma; doc: Diagrama }): ReactNode {
  const def = FORMAS[f.kind];
  if (!def) return null;
  const e = estiloDaForma(f);
  const gid = `grad-${f.id}`;
  const usaGrad = e.gradiente;
  const forma = f;
  const cor = fundo(forma, def.cor);
  //# Gradiente: preenche com o degradê; senão a cor de fundo (com a opacidade só quando alfa foi definido/padrão < 1).
  const pf: Pintura = usaGrad
    ? { fill: `url(#${gid})`, fillOpacity: e.alfa }
    : { fill: cor, fillOpacity: e.alfa < 1 && def.geo !== 'text' ? e.alfa : undefined };
  const livre = LIVRES.has(f.kind) || f.kind === 'livreTriangulo';
  const dash = f.props.dashed ? (livre ? '1 2' : '6 4') : undefined;
  return (
    <g strokeDasharray={dash}>
      {usaGrad && <defs><Gradiente id={gid} e={e} /></defs>}
      <FormaSvgBase f={forma} doc={doc} pf={pf} e={e} gradId={usaGrad ? gid : undefined} />
      {!!f.props.ancorado && <image href={icone('ancorar.png')} x={f.w - 14} y={-6} width={14} height={14} />}
    </g>
  );
}

function FormaSvgBase({ f, doc, pf, e, gradId }: { f: Forma; doc: Diagrama; pf: Pintura; e: EstiloForma; gradId?: string }): ReactNode {
  const def = FORMAS[f.kind];
  const stroke = f.corBorda || 'var(--forma-borda)';
  const cor = fundo(f, def.cor);
  const cx = f.w / 2;
  const cy = f.h / 2;
  const txt = <Linhas texto={f.texto} x={cx} y={cy} doc={doc} f={f} max={f.w - 10} />;

  switch (def.geo) {
    case 'rect':
      return <><rect width={f.w} height={f.h} rx={Number(f.props.roundrect) ? Number(f.props.roundrect) / 2 : 0} {...pf} stroke={stroke} />{f.kind === 'eapProcesso' ? <Bloco texto={f.texto} x={0} y={0} w={f.w} h={f.h} alinh="Centro" vcentro doc={doc} f={f} /> : txt}</>;
    case 'round':
      return <><rect width={f.w} height={f.h} rx={14} {...pf} stroke={stroke} />{txt}</>;
    case 'pill':
      //# Retângulo arredondado (arco = largura/3 x altura): cantos com raio w/6 por h/2.
      return <><rect width={f.w} height={f.h} rx={Math.min(f.w / 6, f.w / 2)} ry={f.h / 2} {...pf} stroke={stroke} />{txt}</>;
    case 'ellipse':
      return <><ellipse cx={cx} cy={cy} rx={cx} ry={cy} {...pf} stroke={stroke} />{txt}</>;
    case 'circle':
      return <><ellipse cx={cx} cy={cy} rx={cx} ry={cy} {...pf} stroke={stroke} />{txt}</>;
    case 'fluxconector':
      //# O conector de fluxo não desenha o texto: não mostra o texto (o nome fica só no Inspector).
      return <ellipse cx={cx} cy={cy} rx={cx} ry={cy} {...pf} stroke={stroke} />;
    case 'diamond':
      return (
        <>
          <polygon points={`${cx},0 ${f.w},${cy} ${cx},${f.h} 0,${cy}`} {...pf} stroke={stroke} />
          {f.kind !== 'decisaoAtividade' && txt}
        </>
      );
    case 'triangle': {
      const pts = pontosTriangulo(f.w, f.h, String(f.props.direcao ?? 'Right'));
      return <><polygon points={pontosParaSvg(pts)} {...pf} stroke={stroke} strokeLinejoin="miter" />{f.texto ? <Linhas texto={f.texto} x={cx} y={f.h * 0.66} doc={doc} f={f} /> : null}</>;
    }
    case 'special':
    case 'union': {
      const dir = String(f.props.direcao ?? 'Up');
      const parcial = def.geo === 'special' && parcialEfetiva(doc, f);
      const clip = `esp-clip-${f.id}`;
      const p = pontoEBandaParcial(dir, f.w, f.h, tamFonte(doc, f));
      return (
        <>
          <polygon points={pontosParaSvg(pontosTriangulo(f.w, f.h, dir))} fill={cor} stroke={stroke} />
          {parcial && (
            <>
              <clipPath id={clip}><polygon points={pontosParaSvg(pontosTriangulo(f.w, f.h, dir))} /></clipPath>
              <rect x={p.banda.x} y={p.banda.y} width={p.banda.w} height={p.banda.h} fill={stroke} clipPath={`url(#${clip})`} />
              <text x={p.letra.x} y={p.letra.y} style={estiloTexto(doc, f)} className="forma-texto">p</text>
            </>
          )}
          {f.kind === 'especializacaoDupla' && <line x1={cx * 0.5} y1={f.h + 4} x2={f.w - cx * 0.5} y2={f.h + 4} stroke={stroke} />}
          {def.geo === 'union' && <Linhas texto="U" x={cx} y={f.h * 0.68} doc={doc} f={f} />}
        </>
      );
    }
    case 'doc':
      return (
        <>
          <path d={caminhoDocumento(f.w, f.h)} {...pf} stroke={stroke} />
          <Linhas texto={f.texto} x={cx} y={(f.h - Math.trunc(f.h / 9)) / 2} doc={doc} f={f} max={f.w - 10} />
        </>
      );
    case 'docs':
      return (
        <>
          <path d={caminhoVariosDocumentos(f.w, f.h)} {...pf} stroke={stroke} fillRule="evenodd" />
          <Linhas texto={f.texto} x={cx - 4} y={(f.h - 6) / 2 + 4} doc={doc} f={f} max={f.w - 20} />
        </>
      );
    case 'wave':
      return <><path d={caminhoNotaOndulada(f.w, f.h)} {...pf} stroke={stroke} />{txt}</>;
    case 'comment':
      return <><path d={caminhoComentario(f.w, f.h)} {...pf} stroke={stroke} />{txt}</>;
    case 'note':
      return (
        <>
          <path d={caminhoComentario(f.w, f.h)} {...pf} stroke={stroke} />
          {txt}
        </>
      );
    case 'bar':
      if (f.kind === 'eapBarraLigacao') {
        const vertical = f.props.direcao === 'Vertical';
        const m = vertical ? f.w / 2 : f.h / 2;
        return (
          <>
            <rect width={f.w} height={f.h} fill="transparent" />
            {vertical
              ? <line x1={m} x2={m} y1={0} y2={f.h} stroke={f.corBorda || 'var(--forma-barra)'} strokeWidth={2} />
              : <line x1={0} x2={f.w} y1={m} y2={m} stroke={f.corBorda || 'var(--forma-barra)'} strokeWidth={2} />}
          </>
        );
      }
      return <rect width={f.w} height={f.h} fill={f.cor || 'var(--forma-barra)'} stroke={stroke} />;
    case 'lane':
      return <Raia f={f} doc={doc} e={e} gradId={gradId} />;
    case 'inicio':
      return <ellipse cx={cx} cy={cy} rx={cx} ry={cy} fill={f.cor && f.cor !== '#222222' ? f.cor : 'var(--forma-barra)'} stroke={stroke} />;
    case 'fim':
      return (
        <>
          <ellipse cx={cx} cy={cy} rx={cx - 1} ry={cy - 1} fill="var(--forma-branco)" stroke={stroke} />
          <ellipse cx={cx} cy={cy} rx={Math.max(1, cx - 5)} ry={Math.max(1, cy - 5)} fill={f.cor && f.cor !== '#222222' ? f.cor : 'var(--forma-barra)'} />
        </>
      );
    case 'junction':
      return (
        <>
          <ellipse cx={cx} cy={cy} rx={cx} ry={cy} fill="none" stroke={stroke} strokeDasharray="1 2" strokeOpacity={0.5} />
          <rect x={cx - 1} y={cy - 1} width={2} height={2} fill="none" stroke={stroke} />
        </>
      );
    case 'arrow':
      //# Formas antigas (FluxSeta/SetaAtividade eram formas); hoje são ligações. Mantém a leitura de arquivos já salvos.
      return (
        <>
          <polygon points={`0,${f.h * 0.3} ${f.w * 0.65},${f.h * 0.3} ${f.w * 0.65},0 ${f.w},${cy} ${f.w * 0.65},${f.h} ${f.w * 0.65},${f.h * 0.7} 0,${f.h * 0.7}`} fill={cor} stroke={stroke} />
          {f.texto && <Linhas texto={f.texto} x={f.w * 0.32} y={cy} doc={doc} f={f} />}
        </>
      );
    case 'text':
      if (f.kind === 'livreSuperTexto') {
        const grad = f.props.gradiente === true && gradId;
        return <Bloco texto={f.texto} x={0} y={0} w={f.w} h={f.h} alinh={alinhamentoDe(f)} vcentro={f.props.centrarVertical !== false} doc={doc} f={f} fill={grad ? `url(#${gradId})` : undefined} />;
      }
      return <TextoForma f={f} doc={doc} gradId={gradId} e={e} />;
    case 'legend':
      return <LegendaForma f={f} doc={doc} pf={pf} />;
    case 'image':
      return <DesenhadorForma f={f} e={e} />;
    case 'drawer':
      return <DrawerSvg f={f} doc={doc} gradiente={e.gradiente} c1={e.c1} c2={e.c2} dir={e.dir} alfa={typeof f.props.alfa === 'number' ? e.alfa : 0.5} />;
    case 'attr':
    case 'multiattr': {
      //# A caixa contém o círculo (lado do dono) e o nome; Left = círculo à esquerda.
      const d = Math.max(8, f.h - 1);
      const esq = ladoEsquerdo(f);
      const ccx = esq ? d / 2 : f.w - d / 2;
      const fundoBola = f.props.identificador ? 'var(--forma-barra)' : 'none';
      const trecho = { x0: esq ? f.h + 2 : 0, x1: esq ? f.w : f.w - f.h - 2 };
      return (
        <>
          <ellipse cx={ccx} cy={cy} rx={d / 2} ry={d / 2} fill={fundoBola} stroke={stroke} strokeDasharray={f.props.opcional ? '4 2' : undefined} />
          {f.kind === 'atributoMulti' && <ellipse cx={ccx} cy={cy} rx={Math.max(1, d / 2 - 3)} ry={Math.max(1, d / 2 - 3)} fill="none" stroke={stroke} />}
          <Linhas texto={textoDoAtributo(f)} x={esq ? trecho.x0 : trecho.x1} y={cy} doc={doc} f={f} anchor={esq ? 'start' : 'end'} />
          {/* Atributo composto: marcador triangular na ponta do texto oposta ao círculo. */}
          {ehComposto(doc, f.id) && (esq
            ? <polygon points={`${f.w},${cy} ${f.w - 3},${cy - 3} ${f.w - 3},${cy + 3}`} fill={stroke} />
            : <polygon points={`0,${cy} 3,${cy - 3} 3,${cy + 3}`} fill={stroke} />)}
        </>
      );
    }
    case 'assoc': {
      //# O relacionamento interno ocupa (8, 8, w-18, h-18).
      const ri = internoDaAssociativa(f);
      const interno = f.props.interno as { cor?: string } | undefined;
      const corInterno = interno?.cor || stroke;
      return (
        <>
          <rect width={f.w} height={f.h} fill={cor} stroke={stroke} />
          <polygon points={`${ri.x + ri.w / 2},${ri.y} ${ri.x + ri.w},${ri.y + ri.h / 2} ${ri.x + ri.w / 2},${ri.y + ri.h} ${ri.x},${ri.y + ri.h / 2}`} fill={cor} stroke={corInterno} />
          {txt}
        </>
      );
    }
    case 'table':
      return <Tabela f={f} doc={doc} pf={pf} />;
    case 'view':
    case 'seq':
    case 'domain':
    case 'enum':
    case 'routine':
      return (
        <>
          <Cabecalho f={f} doc={doc} pf={pf} />
          <CorpoObjetoLogico f={f} doc={doc} tam={tamFonte(doc, f)} negrito={negritoDe(doc, f)} />
        </>
      );
    case 'colecao':
      return <Colecao f={f} doc={doc} pf={pf} />;
    default:
      return null;
  }
}

// ------------------------------------------------------------------ Ligações

type Pt = { x: number; y: number };

function Cabeca({ tip, outro, largura, aberta, cor }: { tip: Pt; outro: Pt; largura: number; aberta: boolean; cor: string }) {
  const pts = pontosDeSeta(tip, outro, largura, aberta);
  return <polygon points={pontosParaSvg(pts)} fill={cor} stroke={cor} strokeLinejoin="miter" />;
}

const numeroOu = (v: unknown, pad: number) => (typeof v === 'number' && Number.isFinite(v) ? v : pad);

/** Marca de "ancorada": pino no ponto médio da linha. */
export function LigacaoSvg({ l, doc, selecionada }: { l: Ligacao; doc: Diagrama; selecionada: boolean }): ReactNode {
  const realcada = useRoqueLigacao(doc, l.id);
  const def = LIGACOES[l.kind];
  const cam = caminhoDaLigacao(doc, l);
  if (!cam || !def) return null;
  const cor = selecionada ? 'var(--selecao)' : l.corBorda || 'var(--forma-borda)';
  //# Atributo opcional: a ligação principal (dono -> atributo) é tracejada.
  const alvoAttr = l.kind === 'linha' && doc.tipo === 'conceitual' ? doc.formas.find((x) => x.id === l.para) : undefined;
  const opcionalDoAtributo = !!alvoAttr && ehAtributoKind(alvoAttr.kind) && !!alvoAttr.props.opcional;
  const tracejada = def.tracejada || l.props.tracejada || l.props.dashed || opcionalDoAtributo ? '6 4' : undefined;
  const config = !def.semSeta;
  const logica = l.kind === 'logicoLinha' ? setasDaLogicoLinha(l, def.seta === 'fim') : null;
  const setaB = config && (logica ? logica.setaB : l.props.setaB === undefined ? def.seta === 'fim' : !!l.props.setaB);
  const setaA = config && (logica ? logica.setaA : !!l.props.setaA);
  const largura = larguraDeSetaValida(numeroOu(l.props.setaLargura, def.larguraSeta ?? 10));
  const aberta = l.props.setaAberta === undefined ? true : !!l.props.setaAberta;
  const { a, b, meio, laco } = cam;
  //# Fonte própria da ligação (props.fonte) sobre a do diagrama.
  const fonteL = l.props.fonte as Partial<Forma['fonte']> | undefined;
  const estilo = estiloTexto(doc, { fonte: fonteL, corTexto: undefined } as Forma);
  const tx = meio.x + numeroOu(l.props.textoDx, 0);
  const ty = meio.y - 6 + numeroOu(l.props.textoDy, 0);
  const perto = (p: Pt, q: Pt, d: number) => {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const n = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / n) * d - (dy / n) * 10, y: p.y + (dy / n) * d + (dx / n) * 10 };
  };
  const rotulo = l.texto ? (def.apenso === 'atividade' ? `[${l.texto}]` : l.texto) : '';
  //# Conceitual: "(card) papel" com posição automática junto à ponta (ou deslocada com "Movimento manual").
  const conceitualCard = doc.tipo === 'conceitual' && l.kind === 'linha';
  const fonteCard = { ...doc.fonte, ...(fonteL ?? {}) } as FonteCard;
  return (
    <g data-ligacao={l.id}>
      <path d={cam.d} stroke="transparent" strokeWidth={12} fill="none" />
      <path d={cam.d} stroke={cor} strokeWidth={(selecionada ? 2 : 1) * (realcada ? 2 : 1)} fill="none" strokeDasharray={tracejada} strokeLinejoin="round" />
      {!!l.props.duplaLinha && !laco && <path d={cam.d} transform={deslocamentoPerpendicular(a, b, 4)} stroke={cor} strokeWidth={1} fill="none" />}
      {setaB && <Cabeca tip={b} outro={laco ? cam.antesB : cam.antesB} largura={largura} aberta={aberta} cor={cor} />}
      {setaA && !laco && <Cabeca tip={a} outro={cam.antesA} largura={largura} aberta={aberta} cor={cor} />}
      {rotulo && def.apenso && <TextoApensoSvg l={l} texto={rotulo} meio={meio} tam={fonteL?.tamanho ?? doc.fonte.tamanho} negrito={fonteL?.negrito ?? doc.fonte.negrito} estilo={estilo} apenso={def.apenso} />}
      {rotulo && !def.apenso && (
        <text x={tx} y={ty} textAnchor="middle" className="forma-texto" style={{ ...estilo, paintOrder: 'stroke', stroke: 'var(--forma-branco)', strokeWidth: 3 }}>
          {rotulo}
        </text>
      )}
      {conceitualCard
        ? (['A', 'B'] as const).map((ponta) => {
          const forma = doc.formas.find((x) => x.id === (ponta === 'A' ? l.de : l.para));
          const caixa = forma && !laco ? caixaDaCardinalidade(l, ponta, ponta === 'A' ? a : b, forma, fonteCard) : null;
          return caixa ? (
            <text key={ponta} x={caixa.x + caixa.w / 2} y={caixa.y + caixa.h / 2} textAnchor="middle" dominantBaseline="central" className="cardinalidade" style={{ ...estilo, paintOrder: 'stroke', stroke: 'var(--forma-branco)', strokeWidth: 2 }}>{caixa.texto}</text>
          ) : null;
        })
        : (
          <>
            {l.cardDe && <text {...perto(a, cam.antesA, 22)} textAnchor="middle" className="cardinalidade">{l.cardDe}</text>}
            {l.cardPara && <text {...perto(b, cam.antesB, 22)} textAnchor="middle" className="cardinalidade">{l.cardPara}</text>}
          </>
        )}
      {!!l.props.ancorado && <image href={icone('ancorar.png')} x={meio.x - 7} y={meio.y - 7} width={14} height={14} />}
    </g>
  );
}

function deslocamentoPerpendicular(a: Pt, b: Pt, d: number): string {
  const n = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return `translate(${(-(b.y - a.y) / n) * d} ${((b.x - a.x) / n) * d})`;
}

/** Caixa do conteúdo de um Desenhador em modo livre (usada pelo editor para "ajustar ao desenho"). */
export const caixaDoDesenho = (f: Forma) => caixaDosItens(itensDoDesenho(f));
