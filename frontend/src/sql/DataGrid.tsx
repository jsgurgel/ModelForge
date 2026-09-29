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
 * Data Grid: visualizar e editar os dados de uma tabela do banco conectado.
 * Paginação server-side, filtro textual, ordenação por coluna, edição inline
 * (UPDATE pela PK), inserir, excluir e duplicar registro — sempre com confirmação
 * para operações destrutivas (a linha "sem PK" é somente leitura).
 */
import { useCallback, useEffect, useState } from 'react';
import { bancoApi, ColunaBanco, ConexaoSql } from '../api';
import { fecharDialogo, abrirDialogo, aviso } from '../ui/dialogos';
import { Modal } from '../dialogs/Modal';
import { chaveDaLinha, valorCelula } from './dataGridHelpers';
import { exportarResultado, EXT_FORMATO, FormatoExportacao, MIME_FORMATO } from './exportarResultado';
import { obterConexao } from './sqlStudioStore';
import { useVisorCodigo } from '../dialogs/MostradorCodigo';

const POR_PAGINA = [50, 100, 250, 500];

function baixar(nome: string, conteudo: string, mime: string) {
  const blob = new Blob([conteudo], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

interface Estado {
  colunas: string[];
  linhas: unknown[][];
  total: number;
  pagina: number;
  porPagina: number;
}

/** Aba DDL: o mesmo visor da tela de DDL (zoom, copiar, editar SQL, salvar arquivo e limpar caracteres especiais). */
function AbaDdl({ texto, nomeArquivo }: { texto: string; nomeArquivo: string }) {
  const { botoes, codigo } = useVisorCodigo(texto, nomeArquivo);
  return (
    <>
      <div className="modal-rodape" style={{ borderTop: 0, padding: '4px 0' }}>{botoes}</div>
      {codigo}
    </>
  );
}

export function DataGrid({ schema, tabela, titulo }: { schema: string; tabela: string; titulo?: string }) {
  const [conexao, setConexao] = useState<ConexaoSql | null>(null);
  const [infoColunas, setInfoColunas] = useState<ColunaBanco[]>([]);
  const [pk, setPk] = useState<string[]>([]);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(50);
  const [ordenar, setOrdenar] = useState<{ coluna: string; desc?: boolean }[]>([]);
  const [filtroColuna, setFiltroColuna] = useState('');
  const [filtroValor, setFiltroValor] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState<{ linha: number; coluna: number; valor: string } | null>(null);
  const [aba, setAba] = useState<'dados' | 'ddl'>('dados');
  const [ddl, setDdl] = useState('');

  useEffect(() => {
    const c = obterConexao();
    if (!c) { aviso('Dados da tabela', 'Conecte-se a um banco na aba "Banco" primeiro.'); fecharDialogo(); return; }
    setConexao(c);
    //# Colunas + PK do catálogo: a grade edita só o que tem PK.
    bancoApi.colunas(c, schema, tabela).then((r) => {
      setInfoColunas(r.colunas);
      setPk(r.colunas.filter((x) => x.chavePrimaria).map((x) => x.nome));
    }).catch((e) => setErro((e as Error).message));
  }, [schema, tabela]);

  const carregar = useCallback(async () => {
    if (!conexao) return;
    setOcupado(true); setErro('');
    const filtro = filtroColuna && filtroValor ? [{ coluna: filtroColuna, valor: filtroValor }] : [];
    try {
      const r = await bancoApi.dados(conexao, schema, tabela, filtro, ordenar, pagina, porPagina);
      setEstado(r);
    } catch (e) { setErro((e as Error).message); }
    setOcupado(false);
  }, [conexao, schema, tabela, filtroColuna, filtroValor, ordenar, pagina, porPagina]);

  useEffect(() => { if (conexao) carregar(); }, [conexao, pagina, porPagina, ordenar]);

  const ordenarPor = (coluna: string) => {
    const atual = ordenar[0];
    if (!atual || atual.coluna !== coluna) setOrdenar([{ coluna }]);
    else if (!atual.desc) setOrdenar([{ coluna, desc: true }]);
    else setOrdenar([]);
    setPagina(0);
  };

  const iniciarEdicao = (linhaIdx: number, colunaIdx: number, valor: unknown) => {
    if (!pk.length || !estado) return;
    const coluna = estado.colunas[colunaIdx];
    if (pk.includes(coluna)) return; //# PK não edita inline
    setEditando({ linha: linhaIdx, coluna: colunaIdx, valor: valorCelula(valor) });
  };

  const salvarEdicao = async () => {
    if (!editando || !estado || !conexao) return;
    const linha = estado.linhas[editando.linha];
    const coluna = estado.colunas[editando.coluna];
    const pkValores = chaveDaLinha(linha, estado.colunas, pk);
    setOcupado(true);
    try {
      await bancoApi.dadosAtualizar(conexao, schema, tabela, [coluna], pk, [editando.valor], pkValores);
      setEditando(null);
      await carregar();
    } catch (e) { setErro((e as Error).message); }
    setOcupado(false);
  };

  const excluir = (linhaIdx: number) => {
    if (!estado || !conexao) return;
    const linha = estado.linhas[linhaIdx];
    const pkValores = chaveDaLinha(linha, estado.colunas, pk);
    abrirDialogo({
      tipo: 'confirmar', titulo: 'Excluir registro',
      mensagem: `Excluir o registro com ${pk.map((c, i) => `${c} = ${pkValores[i]}`).join(', ')}? Essa ação não poderá ser desfeita.`,
      aoConfirmar: async () => {
        try {
          await bancoApi.dadosExcluir(conexao, schema, tabela, pk, pkValores);
          await carregar();
        } catch (e) { setErro((e as Error).message); }
      },
    });
  };

  const duplicar = async (linhaIdx: number) => {
    if (!estado || !conexao) return;
    const linha = estado.linhas[linhaIdx];
    const pkValores = chaveDaLinha(linha, estado.colunas, pk);
    setOcupado(true);
    try {
      await bancoApi.dadosDuplicar(conexao, schema, tabela, estado.colunas, pk, pkValores);
      await carregar();
    } catch (e) { setErro((e as Error).message); }
    setOcupado(false);
  };

  const inserir = async () => {
    if (!estado || !conexao) return;
    const colunasSemPkAuto = infoColunas.filter((c) => !pk.includes(c.nome) || c.padrao == null);
    if (!colunasSemPkAuto.length) { setErro('Todas as colunas são PK sem valor default: use o SQL Studio.'); return; }
    abrirDialogo({
      tipo: 'confirmar', titulo: 'Inserir registro',
      mensagem: `Inserir um registro com valores vazios em: ${colunasSemPkAuto.map((c) => c.nome).join(', ')}?`,
      aoConfirmar: async () => {
        try {
          await bancoApi.dadosInserir(conexao, schema, tabela, colunasSemPkAuto.map((c) => c.nome), colunasSemPkAuto.map(() => ''));
          await carregar();
        } catch (e) { setErro((e as Error).message); }
      },
    });
  };

  const verDdl = async () => {
    if (!conexao) return;
    try {
      const r = await bancoApi.detalhes(conexao, schema, tabela, 'TABELA');
      setDdl(r.ddl + (r.avisos.length ? '\n-- Avisos: ' + r.avisos.join('; ') + '\n' : ''));
    } catch (e) { setErro((e as Error).message); }
  };

  const exportar = (formato: FormatoExportacao) => {
    if (!estado) return;
    const r = { sql: '', colunas: estado.colunas, linhas: estado.linhas, afetadas: null, truncado: estado.linhas.length >= estado.total, ms: 0 };
    baixar(`${tabela}.${EXT_FORMATO[formato]}`, exportarResultado(r, formato, tabela), MIME_FORMATO[formato]);
  };

  const totalPaginas = estado ? Math.max(1, Math.ceil(estado.total / estado.porPagina)) : 1;

  return (
    <Modal titulo={titulo ?? `Dados: ${tabela}`} onFechar={fecharDialogo} largura={1100}
      rodape={<>
        <button onClick={() => carregar()} disabled={ocupado}>{ocupado ? '...' : 'Atualizar'}</button>
        <button onClick={fecharDialogo}>Fechar</button>
      </>}>
      <div className="data-grid">
        <div className="ed-abas">
          <button className={aba === 'dados' ? 'ativa' : ''} onClick={() => setAba('dados')}>Dados</button>
          <button className={aba === 'ddl' ? 'ativa' : ''} onClick={() => { setAba('ddl'); if (!ddl) verDdl(); }}>DDL</button>
        </div>
        {aba === 'dados' ? (
          <>
            <div className="data-grid-barra">
              <select value={filtroColuna} onChange={(e) => setFiltroColuna(e.target.value)}>
                <option value="">(sem filtro)</option>
                {estado?.colunas.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input placeholder="contém..." value={filtroValor} disabled={!filtroColuna}
                onChange={(e) => setFiltroValor(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setPagina(0); carregar(); } }} />
              <button onClick={() => { setPagina(0); carregar(); }} disabled={ocupado}>Filtrar</button>
              <span className="dica">{estado ? `${estado.total} linha(s)` : ''}{pk.length ? '' : ' · tabela sem PK: somente leitura'}</span>
              <span style={{ flex: 1 }} />
              <button onClick={inserir} disabled={ocupado || !pk.length} title={pk.length ? 'Inserir registro com valores vazios' : 'Requer PK'}>+ Inserir</button>
              <select onChange={(e) => { if (e.target.value) exportar(e.target.value as FormatoExportacao); e.target.value = ''; }} defaultValue="">
                <option value="">Exportar...</option>
                <option value="csv">CSV</option><option value="json">JSON</option><option value="sql">SQL INSERT</option>
                <option value="markdown">Markdown</option><option value="html">HTML</option>
              </select>
            </div>
            {erro && <pre className="erros">{erro}</pre>}
            {estado && (
              <div className="data-grid-corpo">
                <table className="ed-campos">
                  <thead>
                    <tr>
                      {estado.colunas.map((c, i) => (
                        <th key={c} className="sql-th" onClick={() => ordenarPor(c)}>
                          {c}{pk.includes(c) ? ' 🔑' : ''}
                          {ordenar[0]?.coluna === c ? (ordenar[0].desc ? ' ▼' : ' ▲') : ''}
                        </th>
                      ))}
                      {pk.length > 0 && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {estado.linhas.map((l, li) => (
                      <tr key={li}>
                        {l.map((v, ci) => (
                          <td key={ci} className="sql-td" title={pk.length ? 'Clique para editar' : ''}
                            onClick={() => iniciarEdicao(li, ci, v)}>
                            {editando && editando.linha === li && editando.coluna === ci ? (
                              <input autoFocus value={editando.valor}
                                onChange={(e) => setEditando({ ...editando, valor: e.target.value })}
                                onBlur={salvarEdicao}
                                onKeyDown={(e) => { if (e.key === 'Enter') salvarEdicao(); if (e.key === 'Escape') setEditando(null); }} />
                            ) : v == null ? <i>null</i> : String(v)}
                          </td>
                        ))}
                        {pk.length > 0 && (
                          <td className="data-grid-acoes">
                            <button onClick={() => duplicar(li)} disabled={ocupado} title="Duplicar registro">⧉</button>
                            <button onClick={() => excluir(li)} disabled={ocupado} title="Excluir registro">✕</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {estado && (
              <div className="sql-paginacao">
                <button onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0 || ocupado}>◀</button>
                <span>{pagina + 1} / {totalPaginas}</span>
                <button onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))} disabled={pagina >= totalPaginas - 1 || ocupado}>▶</button>
                <select value={porPagina} onChange={(e) => { setPorPagina(Number(e.target.value)); setPagina(0); }}>
                  {POR_PAGINA.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}
          </>
        ) : (
          <div className="data-grid-ddl">
            {erro && <pre className="erros">{erro}</pre>}
            {ddl ? <AbaDdl texto={ddl} nomeArquivo={`${tabela}.sql`} /> : !erro && 'Carregando...'}
          </div>
        )}
      </div>
    </Modal>
  );
}