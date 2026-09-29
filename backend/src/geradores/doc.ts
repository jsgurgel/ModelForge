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

import { CampoTabela, Diagrama, Forma } from '../modelo/tipos';
import { ehHerdada, ehParticao, ehParticionada, ehEspacial, formasTabela, jtrim, propsTabela, validarLogico } from './validador';

/**
 * Documentação HTML autocontida do modelo Lógico.
 * A única parte dependente do ambiente é a data "Gerado pelo ModelForge em dd/MM/yyyy",
 * por isso o segundo parâmetro permite fixar a data.
 */
export function gerarDocumentacaoHtml(diagrama: Diagrama, agora: Date = new Date()): string {
  const tabelas = formasTabela(diagrama);
  const visoes = diagrama.formas.filter((f) => f.kind === 'visao' || f.kind === 'visaoMaterializada');
  const sequencias = diagrama.formas.filter((f) => f.kind === 'sequencia');
  const tipos = diagrama.formas.filter((f) => f.kind === 'dominio' || f.kind === 'enum');
  const rotinas = diagrama.formas.filter((f) => f.kind === 'funcao' || f.kind === 'procedure');
  const problemas = validarLogico(diagrama);
  const nome = esc(diagrama.nome ? diagrama.nome : '<<Lógico>>');
  const porId = new Map<string, Forma>(tabelas.map((t) => [t.id, t]));
  const campoPorId = new Map<string, CampoTabela>();
  for (const t of tabelas) for (const c of propsTabela(t).campos) campoPorId.set(c.id, c);

  let sb = '';
  sb += '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n';
  sb += '<meta charset="UTF-8">\n';
  sb += '<meta name="viewport" content="width=device-width, initial-scale=1">\n';
  sb += `<title>${nome} - Dicionário do modelo</title>\n`;
  sb += ESTILO;
  sb += '</head>\n<body>\n';

  sb += '<header>\n<p class="eyebrow">Documentação de modelo lógico</p>\n';
  sb += `<h1>${nome}</h1>\n`;
  sb += `<p class="meta">Gerado pelo ModelForge em ${dataBr(agora)}</p>\n</header>\n`;

  const soma = (f: (p: ReturnType<typeof propsTabela>) => number) => tabelas.reduce((a, t) => a + f(propsTabela(t)), 0);
  sb += '<section class="resumo">\n';
  sb += cartao(tabelas.length, 'Tabelas');
  sb += cartao(soma((p) => p.campos.length), 'Colunas');
  sb += cartao(soma((p) => p.indices.length), 'Índices');
  sb += cartao(visoes.length, 'Views');
  sb += cartao(sequencias.length, 'Sequences');
  sb += cartao(tipos.length, 'Tipos');
  sb += cartao(rotinas.length, 'Rotinas');
  sb += cartao(soma((p) => p.gatilhos.length), 'Gatilhos');
  sb += cartao(problemas.length, problemas.length === 0 ? 'Problemas' : 'Problemas *');
  sb += '</section>\n';

  sb += '<nav><h2>Conteúdo</h2>\n<ul class="toc">\n';
  for (const t of tabelas) sb += `<li><a href="#tb-${ancora(t.texto)}">${esc(t.texto)}</a></li>\n`;
  for (const v of visoes) sb += `<li><a href="#vw-${ancora(v.texto)}">${esc(v.texto)} <span class="tag">view</span></a></li>\n`;
  for (const t of tipos) {
    sb += `<li><a href="#tp-${ancora(t.texto)}">${esc(t.texto)} <span class="tag">${t.kind === 'enum' ? 'enum' : 'domain'}</span></a></li>\n`;
  }
  for (const s of sequencias) sb += `<li><a href="#sq-${ancora(s.texto)}">${esc(s.texto)} <span class="tag">sequence</span></a></li>\n`;
  for (const r of rotinas) {
    sb += `<li><a href="#rt-${ancora(r.texto)}">${esc(r.texto)} <span class="tag">${r.kind === 'procedure' ? 'procedure' : 'function'}</span></a></li>\n`;
  }
  sb += '</ul>\n</nav>\n';

  if (problemas.length > 0) {
    sb += '<section class="problemas">\n<h2>Problemas encontrados</h2>\n<ul>\n';
    for (const p of problemas) sb += `<li>${esc(p)}</li>\n`;
    sb += '</ul>\n</section>\n';
  }

  for (const t of tabelas) sb += escreverTabela(t, porId, campoPorId);
  for (const v of visoes) sb += escreverVisao(v);
  for (const t of tipos) sb += escreverTipo(t);
  for (const s of sequencias) sb += escreverSequencia(s);
  for (const r of rotinas) sb += escreverRotina(r);

  sb += '<footer><p>ModelForge</p></footer>\n</body>\n</html>\n';
  return sb;
}

function escreverTabela(f: Forma, porId: Map<string, Forma>, campoPorId: Map<string, CampoTabela>): string {
  const t = propsTabela(f);
  let sb = `<section class="objeto" id="tb-${ancora(f.texto)}">\n`;
  sb += `<h2>${esc(f.texto)}`;
  if (t.schema !== '') sb += ` <span class="tag">${esc(t.schema)}</span>`;
  sb += '</h2>\n';
  if (ehParticionada(t) || ehParticao(t) || ehHerdada(t)) {
    sb += '<p class="descricao">';
    if (ehParticao(t)) sb += `Partição de <strong>${esc(t.tabelaPai)}</strong>: <span class="mono">${esc(t.limiteParticao)}</span>. `;
    if (ehHerdada(t)) sb += `Herda de <strong>${esc(t.tabelaPai)}</strong>. `;
    if (ehParticionada(t)) sb += `Particionada por <span class="mono">${esc(t.estrategiaParticao)} (${esc(t.chaveParticao)})</span>.`;
    sb += '</p>\n';
  }
  if (t.descricao !== '') sb += `<p class="descricao">${esc(t.descricao)}</p>\n`;

  sb += '<div class="rolagem">\n<table>\n<thead><tr>';
  sb += '<th>Coluna</th><th>Tipo</th><th>Chave</th><th>Nulo</th>';
  sb += '<th>Default</th><th>Descrição</th></tr></thead>\n<tbody>\n';
  for (const c of t.campos) {
    if (c.separador) continue;
    const notNull = (c.complemento ?? '').toUpperCase().includes('NOT NULL');
    sb += `<tr><td class="nome">${esc(c.nome)}</td>`;
    sb += `<td class="mono">${esc(tipoDDL(c))}`;
    if (ehEspacial(c) && (c.srid ?? '') === '') sb += ' <span class="chip alerta">sem SRID</span>';
    sb += '</td>';
    sb += '<td>';
    if (c.pk) sb += '<span class="chip pk">PK</span>';
    if (c.fk) sb += '<span class="chip fk">FK</span>';
    if (c.unique) sb += '<span class="chip un">UNIQUE</span>';
    sb += '</td>';
    sb += `<td>${notNull ? 'não' : 'sim'}</td>`;
    sb += `<td class="mono">${esc(c.padrao)}</td>`;
    sb += `<td>${esc(c.dicionario)}</td></tr>\n`;
  }
  sb += '</tbody>\n</table>\n</div>\n';

  const fks = t.constraints.filter((c) => c.tipo === 'FK');
  if (fks.length > 0) {
    sb += '<h3>Relacionamentos</h3>\n<ul class="lista">\n';
    for (const fk of fks) {
      const destino = fk.constraintOrigem == null ? '(indefinida)' : (porId.get(fk.constraintOrigem.tabelaId)?.texto ?? '');
      sb += `<li><span class="mono">${esc(camposStr(fk.camposDestino, campoPorId))}</span> referencia <strong>${esc(destino)}</strong>`;
      if (fk.nomeada && fk.nome !== '') sb += ` <span class="tag">${esc(fk.nome)}</span>`;
      sb += '</li>\n';
    }
    sb += '</ul>\n';
  }

  const checks = t.constraints.filter((c) => c.tipo === 'CHECK');
  if (checks.length > 0) {
    sb += '<h3>Verificações (CHECK)</h3>\n<ul class="lista">\n';
    for (const c of checks) {
      sb += '<li>';
      if (c.nomeada && c.nome !== '') sb += `<span class="tag">${esc(c.nome)}</span> `;
      sb += `<span class="mono">${esc(c.expressao)}</span></li>\n`;
    }
    sb += '</ul>\n';
  }

  if (t.indices.length > 0) {
    sb += '<h3>Índices</h3>\n<ul class="lista">\n';
    t.indices.forEach((i, pos) => {
      const nomeFmt = i.nome !== '' ? i.nome : `idx_${f.texto}_${pos + 1}`;
      const cps = i.campos.map((id) => (id == null ? '' : (campoPorId.get(id)?.nome ?? ''))).join(', ');
      sb += `<li><span class="mono">${esc(nomeFmt)}</span> (${esc(cps)})`;
      if (i.unico) sb += ' <span class="chip un">UNIQUE</span>';
      if (i.metodo !== '') sb += ` <span class="tag">${esc(i.metodo)}</span>`;
      if (i.condicao !== '') sb += ` <em>parcial: <span class="mono">${esc(i.condicao)}</span></em>`;
      sb += '</li>\n';
    });
    sb += '</ul>\n';
  }
  if (t.gatilhos.length > 0) {
    sb += '<h3>Gatilhos</h3>\n<ul class="lista">\n';
    t.gatilhos.forEach((g, pos) => {
      const nomeFmt = g.nome === '' ? `trg_${f.texto}_${pos + 1}` : g.nome;
      sb += `<li><span class="mono">${esc(nomeFmt)}</span> ${esc(g.momento)} ${esc(g.eventos)}`;
      sb += g.porLinha ? ' por linha' : ' por comando';
      sb += ` &rarr; <span class="mono">${esc(g.funcao)}</span>`;
      if (g.condicao !== '') sb += ` <em>quando <span class="mono">${esc(g.condicao)}</span></em>`;
      sb += '</li>\n';
    });
    sb += '</ul>\n';
  }
  sb += '</section>\n';
  return sb;
}

function escreverRotina(r: Forma): string {
  const p = r.props ?? {};
  const proc = r.kind === 'procedure';
  const schema: string = p.schema ?? '';
  let sb = `<section class="objeto" id="rt-${ancora(r.texto)}">\n`;
  sb += `<h2>${esc(`${r.texto}(${p.parametros ?? ''})`)} <span class="tag">${proc ? 'procedure' : 'function'}</span>`;
  if (schema !== '') sb += ` <span class="tag">${esc(schema)}</span>`;
  sb += '</h2>\n';
  sb += '<ul class="lista">\n';
  if (!proc) sb += `<li>retorna: <span class="mono">${esc(p.retorno ?? '')}</span></li>\n`;
  const ling: string = p.linguagem == null || jtrim(p.linguagem) === '' ? 'plpgsql' : p.linguagem;
  sb += `<li>linguagem: <span class="mono">${esc(ling)}</span></li>\n`;
  sb += '</ul>\n';
  sb += `<div class="rolagem"><pre class="sql">${esc(p.corpo ?? '')}</pre></div>\n`;
  sb += '</section>\n';
  return sb;
}

function escreverVisao(v: Forma): string {
  const schema: string = v.props?.schema ?? '';
  let sb = `<section class="objeto" id="vw-${ancora(v.texto)}">\n`;
  sb += `<h2>${esc(v.texto)} <span class="tag">${v.kind === 'visaoMaterializada' ? 'view materializada' : 'view'}</span>`;
  if (schema !== '') sb += ` <span class="tag">${esc(schema)}</span>`;
  sb += '</h2>\n';
  sb += `<div class="rolagem"><pre class="sql">${esc(v.props?.corpo ?? '')}</pre></div>\n`;
  sb += '</section>\n';
  return sb;
}

function escreverTipo(t: Forma): string {
  const p = t.props ?? {};
  const ehEnum = t.kind === 'enum';
  const schema: string = p.schema ?? '';
  let sb = `<section class="objeto" id="tp-${ancora(t.texto)}">\n`;
  sb += `<h2>${esc(t.texto)} <span class="tag">${ehEnum ? 'enum' : 'domain'}</span>`;
  if (schema !== '') sb += ` <span class="tag">${esc(schema)}</span>`;
  sb += '</h2>\n';
  sb += '<ul class="lista">\n';
  if (ehEnum) {
    // Um rótulo por linha (\R), sem linhas vazias
    for (const linha of String(p.rotulos ?? '').split(QUEBRA_DE_LINHA)) {
      const v = jtrim(linha);
      if (v !== '') sb += `<li><span class="mono">${esc(v)}</span></li>\n`;
    }
  } else {
    sb += `<li>tipo base: <span class="mono">${esc(p.tipoBase ?? '')}</span></li>\n`;
    if ((p.padrao ?? '') !== '') sb += `<li>default: <span class="mono">${esc(p.padrao)}</span></li>\n`;
    if (p.naoNulo) sb += '<li>não nulo</li>\n';
    if ((p.restricao ?? '') !== '') sb += `<li>restrição: <span class="mono">${esc(p.restricao)}</span></li>\n`;
  }
  sb += '</ul>\n</section>\n';
  return sb;
}

function escreverSequencia(s: Forma): string {
  const p = s.props ?? {};
  const schema: string = p.schema ?? '';
  let sb = `<section class="objeto" id="sq-${ancora(s.texto)}">\n`;
  sb += `<h2>${esc(s.texto)} <span class="tag">sequence</span>`;
  if (schema !== '') sb += ` <span class="tag">${esc(schema)}</span>`;
  sb += '</h2>\n';
  sb += '<ul class="lista">\n';
  sb += item('início', p.inicio);
  sb += item('incremento', p.incremento);
  sb += item('valor mínimo', p.minimo);
  sb += item('valor máximo', p.maximo);
  if (p.ciclo) sb += '<li>cíclica</li>\n';
  sb += '</ul>\n</section>\n';
  return sb;
}

function item(rotulo: string, valor: string | null | undefined): string {
  return valor != null && valor !== '' ? `<li>${rotulo}: <span class="mono">${esc(valor)}</span></li>\n` : '';
}

/** Qualquer quebra de linha (\r\n, \n, \r e separadores Unicode). */
const QUEBRA_DE_LINHA = new RegExp('\\r\\n|[\\n\\r\\u000B\\u000C\\u0085\\u2028\\u2029]');

const cartao = (valor: number, rotulo: string) => `<div class="cartao"><span class="n">${valor}</span><span class="r">${rotulo}</span></div>\n`;

/** Colunas da constraint, separadas por vírgula. */
function camposStr(ids: (string | null)[], campoPorId: Map<string, CampoTabela>): string {
  if (!ids || ids.length === 0) return '()';
  return (
    '(' +
    ids
      .map((id) => {
        if (id == null) return '[]';
        const nome = campoPorId.get(id)?.nome ?? '';
        return jtrim(nome) === '' ? '?' : nome;
      })
      .join(', ') +
    ')'
  );
}

/** Coluna espacial ganha o modificador (subtipo, SRID) do PostGIS. */
function tipoDDL(c: CampoTabela): string {
  const t = c.tipo ?? '';
  if (!ehEspacial(c) || t.indexOf('(') > -1) return t;
  let sub = c.subtipoGeometria ?? '';
  const sr = c.srid ?? '';
  if (sub === '' && sr === '') return t;
  if (sub === '') sub = 'Geometry';
  return `${t}(${sub}${sr === '' ? '' : ',' + sr})`;
}

/** Escapa HTML. */
function esc(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Âncora estável: só letras, números e hífen. */
function ancora(s: string | null | undefined): string {
  if (s == null) return '';
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function dataBr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const ESTILO = `<style>
:root {
  --fundo: #f6f7f9; --papel: #fff; --tinta: #16202b; --suave: #5b6672;
  --linha: #dde3ea; --acento: #1f5c8b; --acento-fraco: #e6eef5;
  --pk: #8a6100; --pk-bg: #fbf0d8; --fk: #1f5c8b; --fk-bg: #e2edf6;
  --un: #2e7d5b; --un-bg: #e2f0e9; --alerta: #a8433b; --alerta-bg: #f8e7e5;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fundo: #10161d; --papel: #171f28; --tinta: #e3e9ef; --suave: #9aa7b3;
    --linha: #26313d; --acento: #74b4df; --acento-fraco: #17293a;
    --pk: #d9ab5b; --pk-bg: #2b2214; --fk: #74b4df; --fk-bg: #14283a;
    --un: #5fb88e; --un-bg: #142a20; --alerta: #de7a70; --alerta-bg: #2e1a18;
  }
}
* { box-sizing: border-box; }
body { margin: 0; padding: 2rem 1.25rem 4rem; background: var(--fundo); color: var(--tinta);
       font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.6; }
header, nav, section, footer { max-width: 60rem; margin-inline: auto; }
header { border-top: 3px solid var(--acento); padding-top: 1.25rem; margin-bottom: 2rem; }
.eyebrow { margin: 0; font-size: .72rem; letter-spacing: .12em; text-transform: uppercase; color: var(--acento); }
h1 { margin: .3rem 0; font-size: clamp(1.6rem, 4vw, 2.3rem); letter-spacing: -.02em; }
.meta { margin: 0; color: var(--suave); font-size: .9rem; }
.resumo { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
          gap: 1px; background: var(--linha); border: 1px solid var(--linha); margin-bottom: 2rem; }
.cartao { background: var(--papel); padding: .9rem 1rem; display: flex; flex-direction: column; }
.cartao .n { font-size: 1.8rem; font-weight: 650; line-height: 1; font-variant-numeric: tabular-nums; }
.cartao .r { font-size: .7rem; letter-spacing: .08em; text-transform: uppercase; color: var(--suave); }
nav { margin-bottom: 2rem; }
h2 { font-size: 1.3rem; letter-spacing: -.01em; border-bottom: 2px solid var(--linha); padding-bottom: .4rem; }
h3 { font-size: 1rem; margin: 1.4rem 0 .5rem; }
.toc { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: .5rem 1.2rem; }
.toc a { color: var(--acento); text-decoration: none; }
.toc a:hover { text-decoration: underline; }
.objeto { background: var(--papel); border: 1px solid var(--linha); padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; }
.descricao { color: var(--suave); margin-top: 0; }
.rolagem { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; min-width: 34rem; font-size: .9rem; }
th, td { text-align: left; padding: .5rem .7rem; border-bottom: 1px solid var(--linha); vertical-align: top; }
thead th { font-size: .7rem; letter-spacing: .07em; text-transform: uppercase; color: var(--suave);
           background: var(--acento-fraco); white-space: nowrap; }
td.nome { font-weight: 600; }
.mono, pre.sql { font-family: ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace; font-size: .86em; }
pre.sql { background: var(--acento-fraco); padding: .9rem 1rem; margin: 0; white-space: pre-wrap; }
.chip { display: inline-block; font-size: .66rem; letter-spacing: .05em; padding: .1rem .4rem;
        border-radius: 2px; margin-right: .25rem; border: 1px solid currentColor; }
.chip.pk { color: var(--pk); background: var(--pk-bg); }
.chip.fk { color: var(--fk); background: var(--fk-bg); }
.chip.un { color: var(--un); background: var(--un-bg); }
.chip.alerta { color: var(--alerta); background: var(--alerta-bg); }
.tag { font-size: .7rem; color: var(--suave); border: 1px solid var(--linha); padding: .05rem .35rem; border-radius: 2px; }
.lista { margin: 0; padding-left: 1.1rem; }
.problemas { background: var(--alerta-bg); border: 1px solid var(--alerta); padding: 1rem 1.5rem; margin-bottom: 1.5rem; }
.problemas h2 { color: var(--alerta); border-bottom-color: var(--alerta); }
footer { margin-top: 2rem; color: var(--suave); font-size: .8rem; border-top: 1px solid var(--linha); padding-top: 1rem; }
</style>
`;
