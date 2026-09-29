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

import { Linguagem, linguagemDoArquivo } from '../editor/realce';
import { Codigo, EditorCodigo } from '../ui/Codigo';
import { useEffect, useMemo, useState } from 'react';
import ajuda from '../ajuda.json';
import { Topico, achar, buscarTopicos, destacarHtml, htmlDoTopico, linksDoTopico, htmlSobre, URL_REPOSITORIO, AVISO_AUTORIA } from '../editor/ajudaBusca';
import { api, ResumoDiagrama } from '../api';
import { baixar } from '../editor/exportar';
import { camposDaTabela } from '../editor/geometry';
import { dicionarioCsv, editarCampoDicionario, editarTabelaDicionario, linhasDeCampos, linhasDeTabelas, tabelasDo } from '../editor/dicionario';
import { abrirDiagrama, abaAtiva, mutar, selecionar, useEditor } from '../editor/store';
import { FORMAS } from '../shapes/registry';
import { fecharDialogo, useDialogo } from '../ui/dialogos';
import { BancoExecutar, BancoImportar, BancoMigracao, BancoNoSql } from './BancoDialogos';
import { SqlStudio } from '../sql/SqlStudio';
import { DataGrid } from '../sql/DataGrid';
import { EditorCampos } from './EditorCampos';
import { EditorAtributos } from './EditorAtributos';
import { EditorDsl } from './EditorDsl';
import { Modal } from './Modal';
import { DialogosD } from './DialogosD';
import { DialogosG2 } from './DialogosG2';
import { MostradorCodigo } from './MostradorCodigo';
import { DialogosH } from './DialogosH';

function Ajuda({ topico, busca: buscaInicial }: { topico?: number; busca?: string }) {
  const raiz = ajuda as Topico;
  const [atual, setAtual] = useState<Topico>(() => (topico !== undefined ? achar(raiz, topico) : undefined) ?? raiz);
  const [filtro, setFiltro] = useState(buscaInicial ?? '');
  const resultados = useMemo(() => (filtro.trim() ? buscarTopicos(raiz, filtro) : null), [raiz, filtro]);
  const links = linksDoTopico(atual, raiz);
  const html = useMemo(() => destacarHtml(htmlDoTopico(atual, raiz), filtro), [atual, raiz, filtro]);
  const No = ({ t, nivel }: { t: Topico; nivel: number }) => (
    <>
      <div className={`arvore-item${atual === t ? ' sel' : ''}`} style={{ paddingLeft: 8 + nivel * 14 }} onClick={() => setAtual(t)}>{t.titulo}</div>
      {t.filhos.map((f) => <No key={f.id} t={f} nivel={nivel + 1} />)}
    </>
  );
  return (
    <Modal titulo="Ajuda" onFechar={fecharDialogo} largura={980} fundoFecha>
      <div className="ajuda">
        <div className="ajuda-indice">
          <input placeholder="Buscar na ajuda..." value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Buscar na ajuda" />
          {resultados ? (resultados.length ? resultados.map((t) => <div key={t.id} className="arvore-item" onClick={() => setAtual(t)}>{t.titulo}</div>) : <div className="vazio">Nada encontrado.</div>)
            : <No t={raiz} nivel={0} />}
        </div>
        {/* Conteúdo estático empacotado da ajuda do próprio projeto (não vem do usuário). */}
        <div className="ajuda-texto">
          <div dangerouslySetInnerHTML={{ __html: html }} />
          {atual.imagem && <p style={{ textAlign: 'center' }}><img src={`/${atual.imagem}`} alt={atual.titulo} style={{ maxWidth: '100%' }} /></p>}
          {links.length > 0 && (
            <div className="ajuda-links">
              <b>Links</b>
              {links.map((l) => <div key={l.id}><a href="#" onClick={(e) => { e.preventDefault(); const t = achar(raiz, l.id); if (t) setAtual(t); }}>{l.n}. {l.titulo}</a></div>)}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Servidor() {
  const [lista, setLista] = useState<ResumoDiagrama[] | null>(null);
  const [erro, setErro] = useState('');
  const carregar = () => api.listar().then(setLista).catch((e: Error) => setErro(e.message));
  useEffect(() => { carregar(); }, []);
  return (
    <Modal titulo="Abrir do servidor" onFechar={fecharDialogo} fundoFecha>
      {erro && <p className="erros">{erro}</p>}
      {lista && !lista.length && <p className="vazio">Nenhum diagrama salvo no servidor.</p>}
      <table className="ed-campos"><tbody>
        {lista?.map((d) => (
          <tr key={d.id}>
            <td>{d.nome}</td><td>{d.tipo}</td>
            <td>
              <button onClick={async () => { try { abrirDiagrama(await api.obter(d.id)); fecharDialogo(); } catch (e) { setErro((e as Error).message); } }}>Abrir</button>
              <button onClick={async () => { try { await api.remover(d.id); await carregar(); } catch (e) { setErro((e as Error).message); } }}>Excluir</button>
            </td>
          </tr>
        ))}
      </tbody></table>
    </Modal>
  );
}

function Busca() {
  const aba = abaAtiva();
  const [q, setQ] = useState('');
  const itens = useMemo(() => {
    if (!aba) return [];
    const out: { id: string; rotulo: string; detalhe: string }[] = [];
    for (const f of aba.doc.formas) {
      out.push({ id: f.id, rotulo: f.texto.split('\n')[0], detalhe: FORMAS[f.kind].rotulo });
      if (FORMAS[f.kind].geo === 'table') for (const c of camposDaTabela(f)) out.push({ id: f.id, rotulo: `${f.texto}.${c.nome}`, detalhe: c.tipo });
    }
    return out;
  }, [aba]);
  const achados = q.trim() ? itens.filter((i) => i.rotulo.toLowerCase().includes(q.toLowerCase())).slice(0, 30) : itens.slice(0, 30);
  const ir = (id: string) => {
    selecionar([id]);
    const f = aba?.doc.formas.find((x) => x.id === id);
    if (f) window.dispatchEvent(new CustomEvent('modelforge:rolar', { detail: { x: f.x + f.w / 2, y: f.y + f.h / 2 } }));
    fecharDialogo();
  };
  return (
    <Modal titulo="Busca global" onFechar={fecharDialogo} fundoFecha>
      <input className="busca-entrada" autoFocus placeholder="Digite para filtrar tabelas, entidades e campos..." value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && achados[0] && ir(achados[0].id)} />
      <div className="busca-lista">
        {achados.map((a, i) => <div key={i} className="arvore-item" onClick={() => ir(a.id)}><b>{a.rotulo}</b> <span className="campo-tipo">{a.detalhe}</span></div>)}
      </div>
    </Modal>
  );
}


function Escolha({ titulo, rotulo, opcoes, aoEscolher }: { titulo: string; rotulo: string; opcoes: string[]; aoEscolher: (v: string) => void }) {
  const [v, setV] = useState(opcoes[0]);
  return (
    <Modal titulo={titulo} onFechar={fecharDialogo} largura={420} aoConfirmar={() => { fecharDialogo(); aoEscolher(v); }} rodape={<><button onClick={() => { fecharDialogo(); aoEscolher(v); }}>OK</button><button onClick={fecharDialogo}>Cancelar</button></>}>
      <label className="entrada">{rotulo}<select value={v} onChange={(e) => setV(e.target.value)}>{opcoes.map((o) => <option key={o}>{o}</option>)}</select></label>
    </Modal>
  );
}

function ImportarTexto({ titulo, dica, linguagem = 'texto', aoConfirmar }: { titulo: string; dica: string; linguagem?: Linguagem; aoConfirmar: (t: string) => void }) {
  const [texto, setTexto] = useState('');
  return (
    <Modal titulo={titulo} onFechar={fecharDialogo} largura={820} sujo={!!texto.trim()} rodape={<><button disabled={!texto.trim()} onClick={() => { fecharDialogo(); aoConfirmar(texto); }}>OK</button><button onClick={fecharDialogo}>Cancelar</button></>}>
      <p className="dica">{dica}</p>
      <div className="linha-acoes"><button onClick={async () => { const { escolherArquivo } = await import('../editor/arquivo'); const f = await escolherArquivo('.sql,.txt,.dsl,text/plain'); if (f) setTexto(await f.text()); }}>Carregar arquivo...</button></div>
      <EditorCodigo valor={texto} aoMudar={setTexto} linguagem={linguagem} rows={18} />
    </Modal>
  );
}

function Dicionario() {
  useEditor();
  const doc = abaAtiva()!.doc;
  const todas = tabelasDo(doc);
  const [sel, setSel] = useState(-1);
  const [comFk, setComFk] = useState(false);
  const [comOrigem, setComOrigem] = useState(false);
  const alvo = sel < 0 ? todas : [todas[sel]];
  const tabelas = linhasDeTabelas(alvo);
  const campos = linhasDeCampos(doc, alvo);
  return (
    <Modal titulo="Dicionário de dados" onFechar={fecharDialogo} largura={1100}
      rodape={<><button onClick={() => baixar(`${doc.nome}_dicionario.csv`, '\ufeff' + dicionarioCsv(tabelas, campos, comFk, comOrigem), 'text/csv;charset=utf-8')}>Salvar dicionário (CSV)</button><button onClick={fecharDialogo}>Fechar</button></>}>
      <div className="linha-acoes">
        <label>Tabela <select value={sel} onChange={(e) => setSel(Number(e.target.value))}>
          {todas.map((t, i) => <option key={t.id} value={i}>{t.texto}</option>)}<option value={-1}>Todas as tabelas</option></select></label>
        <label><input type="checkbox" checked={comFk} onChange={(e) => setComFk(e.target.checked)} /> Chave estrangeira</label>
        <label><input type="checkbox" checked={comOrigem} onChange={(e) => setComOrigem(e.target.checked)} /> Origem da FK</label>
      </div>
      <table className="ed-campos"><thead><tr><th>Tabela</th><th>Descrição</th><th>Observação</th></tr></thead>
        <tbody>{tabelas.map((t) => <tr key={t.tabelaId ?? t.tabela}><td>{t.tabela}</td>
          <td><input aria-label={`Descrição de ${t.tabela}`} value={t.descricao} onChange={(e) => mutar((d) => editarTabelaDicionario(d, t.tabelaId!, { descricao: e.target.value }))} /></td>
          <td><input aria-label={`Observação de ${t.tabela}`} value={t.observacao} onChange={(e) => mutar((d) => editarTabelaDicionario(d, t.tabelaId!, { observacao: e.target.value }))} /></td></tr>)}</tbody></table>
      <div className="ed-campos-scroll">
        <table className="ed-campos"><thead><tr><th>Nome da tabela</th><th>Nome da coluna</th><th>Tipo</th><th>Pos.</th><th>PK</th><th>Único</th><th>Complemento</th><th>Dicionário</th><th>Observação</th>{comFk && <th>FK</th>}{comOrigem && <><th>Tabela origem</th><th>Campo origem</th></>}</tr></thead>
          <tbody>{campos.map((c, i) => (
            <tr key={i}><td>{c.tabela}</td><td>{c.campo}</td><td>{c.tipo}</td><td>{c.posicao}</td><td>{String(c.pk)}</td><td>{String(c.unico)}</td><td>{c.complemento}</td><td><input aria-label={`Dicionário de ${c.tabela}.${c.campo}`} value={c.dicionario} onChange={(e) => mutar((d) => editarCampoDicionario(d, c.tabelaId!, c.campoId!, { dicionario: e.target.value }))} /></td>
              <td><input aria-label={`Observação de ${c.tabela}.${c.campo}`} value={c.observacao} onChange={(e) => mutar((d) => editarCampoDicionario(d, c.tabelaId!, c.campoId!, { observacao: e.target.value }))} /></td>
              {comFk && <td>{String(c.fk)}</td>}{comOrigem && <><td>{c.tabelaOrigem}</td><td>{c.campoOrigem}</td></>}</tr>))}</tbody></table>
      </div>
    </Modal>
  );
}

function HtmlPrevia({ titulo, html, nomeArquivo }: { titulo: string; html: string; nomeArquivo: string }) {
  return (
    <Modal titulo={titulo} onFechar={fecharDialogo} largura={1000} fundoFecha
      rodape={<><button onClick={() => baixar(nomeArquivo, html, 'text/html;charset=utf-8')}>Salvar arquivo</button><button onClick={fecharDialogo}>Fechar</button></>}>
      {/* sandbox vazio: o HTML gerado é só para leitura (sem scripts, sem acesso à página). */}
      <iframe title={titulo} sandbox="" srcDoc={html} className="previa-html" />
    </Modal>
  );
}

function Entrada({ titulo, rotulo, valor, aoConfirmar }: { titulo: string; rotulo: string; valor: string; aoConfirmar: (v: string) => void }) {
  const [v, setV] = useState(valor);
  const ok = () => { aoConfirmar(v); fecharDialogo(); };
  return (
    <Modal titulo={titulo} onFechar={fecharDialogo} largura={420} sujo={v !== valor} aoConfirmar={ok} rodape={<><button onClick={ok}>OK</button><button onClick={fecharDialogo}>Cancelar</button></>}>
      <label className="entrada">{rotulo}<input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} /></label>
    </Modal>
  );
}

export function Dialogos() {
  const d = useDialogo();
  if (!d) return null;
  switch (d.tipo) {
    case 'campos': return <EditorCampos id={d.id} aba={d.aba} onFechar={fecharDialogo} />;
    case 'atributos': return <EditorAtributos id={d.id} onFechar={fecharDialogo} />;
    case 'dsl': return <EditorDsl id={d.id} onFechar={fecharDialogo} />;
    case 'texto': return <MostradorCodigo titulo={d.titulo} texto={d.texto} nomeArquivo={d.nomeArquivo} linguagem={d.linguagem} />;
    case 'entrada': return <Entrada {...d} />;
    case 'escolha': return <Escolha {...d} />;
    case 'importarTexto': return <ImportarTexto {...d} />;
    case 'dicionario': return <Dicionario />;
    case 'html': return <HtmlPrevia {...d} />;
    case 'confirmar': {
      const nao = () => { fecharDialogo(); d.aoRecusar?.(); };
      return (
        <Modal titulo={d.titulo} onFechar={nao} largura={440} aoConfirmar={() => { fecharDialogo(); d.aoConfirmar(); }}
          rodape={<><button autoFocus onClick={() => { fecharDialogo(); d.aoConfirmar(); }}>Sim</button><button onClick={nao}>Não</button></>}>
          <p>{d.mensagem}</p>
        </Modal>
      );
    }
    case 'aviso':
      return <Modal titulo={d.titulo} onFechar={fecharDialogo} largura={520} fundoFecha aoConfirmar={fecharDialogo} rodape={<button autoFocus onClick={fecharDialogo}>OK</button>}><p className="aviso-texto">{d.mensagem}</p></Modal>;
    case 'd': return <DialogosD d={d} />;
    case 'g2': return <DialogosG2 d={d} />;
    case 'h': return <DialogosH d={d} />;
    case 'bancoImportar': return <BancoImportar />;
    case 'bancoNosql': return <BancoNoSql />;
    case 'bancoMigracao': return <BancoMigracao />;
    case 'bancoExecutar': return <BancoExecutar sql={d.sql} />;
    case 'sqlStudio': return <SqlStudio sql={d.sql} />;
    case 'dataGrid': return <DataGrid schema={d.schema} tabela={d.tabela} titulo={d.titulo} />;
    case 'servidor': return <Servidor />;
    case 'busca': return <Busca />;
    case 'ajuda': return <Ajuda topico={d.topico} busca={d.busca} />;
    case 'sobre':
      return (
        <Modal titulo="Sobre" onFechar={fecharDialogo} largura={520} fundoFecha aoConfirmar={fecharDialogo} rodape={<button autoFocus onClick={fecharDialogo}>OK</button>}>
          <div className="sobre">
            <img src="/icons/ModelForge.png" alt="" width={64} height={64} />
            {/* HTML estático do próprio app (produto, versão e desenvolvedor). */}
            <div dangerouslySetInnerHTML={{ __html: htmlSobre() }} />
            <p>Projeto inspirado no brModelo.</p>
            <p className="dica">
              <a href={URL_REPOSITORIO} target="_blank" rel="noopener noreferrer">{AVISO_AUTORIA}</a>.
              {' '}Software livre distribuído sob a GNU Affero General Public License, versão 3 ou posterior, sem nenhuma garantia.
              {' '}Versões modificadas devem preservar esta atribuição e indicar que foram modificadas. Veja https://www.gnu.org/licenses/agpl-3.0.html
            </p>
          </div>
        </Modal>
      );
  }
}
