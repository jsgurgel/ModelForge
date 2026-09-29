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

/** SQL Studio — múltiplas abas de consulta, execução, resultados, histórico, exportação.
 * A conexão ativa vem do store (definida pelo BancoPanel ao conectar). Não há formulário de conexão aqui. */
import { useEffect, useState } from 'react';
import { ResultadoComandoSql } from '../api';
import { fecharDialogo } from '../ui/dialogos';
import { Modal } from '../dialogs/Modal';
import {
  adicionarHistorico, ativarAba, fecharAbaSql, limparHistorico, limparResultadoAba,
  mostrarHistorico, novaAbaSql, obterCatalogo, recarregarCatalogo, renomearAba, setResultadoAba, setSqlAba, useSqlStudio,
} from './sqlStudioStore';
import { EditorSql } from './EditorSql';
import { ResultadoGrid } from './ResultadoGrid';
import { exportarResultado, EXT_FORMATO, FormatoExportacao, MIME_FORMATO } from './exportarResultado';

function baixar(nome: string, conteudo: string, mime: string) {
  const blob = new Blob([conteudo], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

function formatarData(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function agruparPorDia(historico: { id: string; sql: string; data: number; duracao: number; sucesso: boolean; erro?: string; conexaoNome: string }[]) {
  const grupos: Record<string, typeof historico> = {};
  const hoje = new Date().toDateString();
  const ontem = new Date(Date.now() - 86400000).toDateString();
  for (const h of historico) {
    const dia = new Date(h.data).toDateString();
    const rotulo = dia === hoje ? 'Hoje' : dia === ontem ? 'Ontem' : new Date(h.data).toLocaleDateString();
    if (!grupos[rotulo]) grupos[rotulo] = [];
    grupos[rotulo].push(h);
  }
  return grupos;
}

export function SqlStudio({ sql: sqlInicial }: { sql?: string }) {
  const studio = useSqlStudio();
  const [erro, setErro] = useState('');
  const [continuar, setContinuar] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [abaResultado, setAbaResultado] = useState(0);
  const [editandoTitulo, setEditandoTitulo] = useState<number | null>(null);

  const aba = studio.abas[studio.ativa];
  const catalogo = obterCatalogo();

  useEffect(() => {
    if (sqlInicial && aba && !aba.alterado) setSqlAba(studio.ativa, sqlInicial);
  }, []);

  const executar = async () => {
    setConfirmando(false);
    if (!studio.conexao) { setErro('Nenhuma conexão ativa.'); return; }
    if (!aba.sql.trim()) { setErro('Informe o comando SQL.'); return; }
    setErro('');
    setResultadoAba(studio.ativa, { executando: true, erro: undefined, resultados: undefined });
    const t0 = Date.now();
    try {
      const r = await import('../api').then((m) => m.bancoApi.executar({ conexao: studio.conexao!, sql: aba.sql, confirmar: true, continuarNoErro: continuar }));
      const duracao = Date.now() - t0;
      setResultadoAba(studio.ativa, { ...r, executando: false, tempoTotal: duracao, alterado: false });
      adicionarHistorico({ sql: aba.sql, data: Date.now(), conexaoNome: studio.conexaoNome, duracao, sucesso: !r.parou });
      setAbaResultado(0);
    } catch (e) {
      const msg = (e as Error).message;
      setResultadoAba(studio.ativa, { executando: false, erro: msg });
      adicionarHistorico({ sql: aba.sql, data: Date.now(), conexaoNome: studio.conexaoNome, duracao: Date.now() - t0, sucesso: false, erro: msg });
    }
  };

  const pedirExecucao = () => {
    if (!studio.conexao) { setErro('Nenhuma conexão ativa.'); return; }
    if (!aba.sql.trim()) { setErro('Informe o comando SQL.'); return; }
    setErro('');
    setConfirmando(true);
  };

  const limpar = () => {
    setSqlAba(studio.ativa, '');
    limparResultadoAba(studio.ativa);
  };

  const exportar = (r: ResultadoComandoSql, formato: FormatoExportacao) => {
    const conteudo = exportarResultado(r, formato);
    const nome = `resultado.${EXT_FORMATO[formato]}`;
    baixar(nome, conteudo, MIME_FORMATO[formato]);
  };

  const abrirDoHistorico = (sql: string) => {
    setSqlAba(studio.ativa, sql);
    mostrarHistorico(false);
  };

  const gruposHistorico = agruparPorDia(studio.historico);

  if (!studio.conexao) {
    return (
      <Modal titulo="SQL Studio" onFechar={fecharDialogo} largura={500} rodape={<button onClick={fecharDialogo}>Fechar</button>}>
        <p className="dica">Nenhuma conexão ativa. Conecte-se a um banco na aba "Banco" da barra lateral e clique em "SQL Studio..." novamente.</p>
      </Modal>
    );
  }

  return (
    <Modal titulo="SQL Studio" onFechar={fecharDialogo} largura={1100} sujo={aba?.alterado}
      rodape={<><button onClick={fecharDialogo}>Fechar</button></>}>
      <div className="sql-studio">
        {/* Barra de conexão — apenas informativa */}
        <div className="sql-studio-conexao">
          <span className="dica">🟢 {studio.conexaoNome}{studio.schema ? ` · ${studio.schema}` : ''}</span>
          <button onClick={() => recarregarCatalogo()} disabled={studio.catalogoCarregando}>
            {studio.catalogoCarregando ? 'Carregando catálogo...' : 'Atualizar catálogo'}
          </button>
          {studio.catalogoCarregado && <span className="dica">✓ catálogo carregado</span>}
          {!studio.catalogoCarregado && !studio.catalogoCarregando && (
            <span className="erros">catálogo não carregado{studio.catalogoErro ? ` — ${studio.catalogoErro}` : ''}</span>
          )}
          <button onClick={() => mostrarHistorico(!studio.mostrarHistorico)}>Histórico</button>
        </div>
        {erro && <pre className="erros">{erro}</pre>}

        {/* Abas SQL */}
        <div className="sql-studio-abas">
          {studio.abas.map((a, i) => (
            <div key={a.id} className={`aba${i === studio.ativa ? ' ativa' : ''}`} onClick={() => ativarAba(i)}>
              {editandoTitulo === i ? (
                <input
                  className="aba-edicao"
                  autoFocus
                  value={a.titulo}
                  onChange={(e) => renomearAba(i, e.target.value)}
                  onBlur={() => setEditandoTitulo(null)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditandoTitulo(null); }}
                />
              ) : (
                <span onDoubleClick={() => setEditandoTitulo(i)}>{a.titulo}{a.alterado ? ' •' : ''}</span>
              )}
              {studio.abas.length > 1 && <button className="aba-fechar" onClick={(e) => { e.stopPropagation(); fecharAbaSql(i); }}>×</button>}
            </div>
          ))}
          <button className="aba-nova" onClick={novaAbaSql}>+</button>
        </div>

        {/* Toolbar */}
        <div className="sql-studio-toolbar">
          <button onClick={pedirExecucao} disabled={aba?.executando}>▶ Executar</button>
          {aba?.executando && <span className="dica">executando...</span>}
          <button onClick={limpar} disabled={aba?.executando}>Limpar</button>
          <label><input type="checkbox" checked={continuar} onChange={(e) => setContinuar(e.target.checked)} /> Continuar no erro</label>
          <span className="dica" style={{ marginLeft: 'auto' }}>Ctrl+Enter = executar · F5 = executar · Ctrl+Space = autocomplete</span>
        </div>

        {/* Editor */}
        <EditorSql
          valor={aba?.sql ?? ''}
          aoMudar={(v) => setSqlAba(studio.ativa, v)}
          catalogo={catalogo}
          onExecutar={pedirExecucao}
          onPrecisaCatalogo={() => { if (!studio.catalogoCarregado && !studio.catalogoCarregando) recarregarCatalogo(); }}
          executando={!!aba?.executando}
          style={{ height: '180px', marginBottom: 8 }}
        />

        {/* Confirmação */}
        {confirmando && (
          <div className="erros" style={{ marginTop: 4, marginBottom: 8 }}>
            <p><b>Confirmar execução.</b> Você tem certeza que deseja executar? Essa alteração não poderá ser desfeita.</p>
            <button onClick={executar}>Sim, executar</button> <button onClick={() => setConfirmando(false)}>Não</button>
          </div>
        )}

        {/* Resultados */}
        {aba?.erro && <pre className="erros">{aba.erro}</pre>}
        {aba?.resultados && aba.resultados.length > 0 && (
          <div className="sql-resultados">
            <div className="ed-abas">
              {aba.resultados.map((r, i) => (
                <button key={i} className={i === abaResultado ? 'ativa' : ''} onClick={() => setAbaResultado(i)}>
                  {i + 1}{r.erro ? ' ⚠' : ''}
                </button>
              ))}
            </div>
            {aba.resultados[abaResultado] && (
              (() => { const rc = aba.resultados[abaResultado]; return rc.erro ? (
                <div className="sql-resultado">
                  <div className="sql-resultado-barra"><span className="dica">{rc.ms} ms</span></div>
                  <pre className="erros">{rc.erro}</pre>
                </div>
              ) : (
                <ResultadoGrid r={rc} onExportar={(f) => exportar(rc, f as FormatoExportacao)} />
              ); })()
            )}
          </div>
        )}
        {aba?.parou && <p className="erros" style={{ marginTop: 4 }}>A execução parou no primeiro erro.</p>}
        {aba?.tempoTotal != null && !aba.erro && (
          <div className="dica" style={{ marginTop: 4 }}>{aba.totalComandos} comando(s) · {aba.tempoTotal} ms total</div>
        )}

        {/* Painel de histórico */}
        {studio.mostrarHistorico && (
          <div className="sql-historico">
            <div className="sql-historico-header">
              <b>Histórico</b>
              <button onClick={() => limparHistorico()}>Limpar</button>
            </div>
            <div className="sql-historico-lista">
              {studio.historico.length === 0 && <div className="vazio">Nenhuma consulta no histórico.</div>}
              {Object.entries(gruposHistorico).map(([dia, itens]) => (
                <div key={dia}>
                  <div className="sql-historico-dia">{dia}</div>
                  {itens.map((h) => (
                    <div key={h.id} className="sql-historico-item" onClick={() => abrirDoHistorico(h.sql)}>
                      <span className="sql-historico-hora">{formatarData(h.data)}</span>
                      <span className={h.sucesso ? 'dica' : 'erros'}>{h.sucesso ? '✓' : '✗'} {h.sql.slice(0, 80)}{h.sql.length > 80 ? '...' : ''}</span>
                      <span className="dica">{h.duracao}ms</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}