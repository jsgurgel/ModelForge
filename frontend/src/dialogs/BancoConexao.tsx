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

import { CSSProperties, useEffect, useState } from 'react';
import { bancoApi, ConexaoNoSqlDados, ConexaoSalva, ConexaoSql, TipoBancoInfo } from '../api';

const grade: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(64px, 34%) minmax(0, 1fr)', gap: '6px 8px', alignItems: 'center' };
const TODOS = '';

export interface EstadoSql extends ConexaoSql {
  nomeSalvar: string;
  salvarSenha: boolean;
}

export const conexaoSqlPadrao = (): EstadoSql => ({
  tipo: 'postgresql', host: 'localhost', porta: 5432, database: '', usuario: '', senha: '', confiarCertificado: false, tls: false,
  schema: TODOS, nomeSalvar: '', salvarSenha: false,
});

/** Só os campos que o servidor aceita (sem os auxiliares do formulário). */
export const paraConexaoSql = (e: EstadoSql): ConexaoSql => ({
  id: e.id, tipo: e.tipo, host: e.host, porta: e.porta, database: e.database, usuario: e.usuario, senha: e.senha,
  confiarCertificado: e.confiarCertificado, tls: e.tls, schema: e.schema,
});

export function validarSql(e: EstadoSql): string | null {
  if (e.tipo === 'sqlite') return e.database.trim() ? null : 'Escolha o arquivo SQLite.';
  if (!e.host.trim() || !e.database.trim() || !e.usuario.trim()) return 'Preencha host, database e usuário.';
  if (!Number.isInteger(e.porta) || e.porta < 1 || e.porta > 65535) return 'Porta inválida.';
  return null;
}

function useSalvas() {
  const [lista, setLista] = useState<ConexaoSalva[]>([]);
  const recarregar = () => bancoApi.conexoes().then(setLista).catch(() => setLista([]));
  useEffect(() => { recarregar(); }, []);
  return { lista, recarregar };
}

/** Formulário de conexão SQL no estilo do assistente: salvas, SGBD, dados, TLS, testar. */
export function FormConexaoSql({ valor, onChange, comSchema = true }: { valor: EstadoSql; onChange: (v: EstadoSql) => void; comSchema?: boolean }) {
  const { lista, recarregar } = useSalvas();
  const [tipos, setTipos] = useState<TipoBancoInfo[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { bancoApi.tipos().then((r) => setTipos(r.tipos)).catch(() => undefined); }, []);
  const info = tipos.find((t) => t.id === valor.tipo);
  const sqlite = valor.tipo === 'sqlite';
  const salvas = lista.filter((c) => c.kind === 'sql');
  //# Mexer nos dados de rede desvincula da conexão salva (o servidor só usa os dados salvos quando há id).
  const editar = (p: Partial<EstadoSql>, desvincular = true) => onChange({ ...valor, ...p, ...(desvincular ? { id: undefined } : {}) });

  const escolherSalva = (id: string) => {
    const c = salvas.find((x) => x.id === id);
    if (!c) { onChange({ ...conexaoSqlPadrao() }); return; }
    onChange({
      id: c.id, tipo: c.tipo as EstadoSql['tipo'], host: c.host ?? '', porta: c.porta ?? 0, database: c.database, usuario: c.usuario ?? '',
      senha: '', confiarCertificado: !!c.confiarCertificado, tls: !!c.tls, schema: c.schema ?? '', nomeSalvar: c.nome, salvarSenha: !!c.salvarSenha,
    });
    setSchemas([]); setStatus(null);
  };

  const mudarTipo = (t: EstadoSql['tipo']) => {
    const i = tipos.find((x) => x.id === t);
    editar({ tipo: t, porta: i?.portaPadrao ?? 0, tls: t !== 'postgresql' && t !== 'sqlite', confiarCertificado: false, schema: TODOS });
    setSchemas([]); setStatus(null);
  };

  const testar = async () => {
    const erro = validarSql(valor);
    if (erro) { setStatus({ ok: false, texto: erro }); return; }
    setOcupado(true); setStatus({ ok: true, texto: 'Conectando...' });
    try {
      const r = await bancoApi.testar(paraConexaoSql(valor));
      if (r.ok) { setSchemas(r.schemas); setStatus({ ok: true, texto: '✓ Conexão bem-sucedida' }); }
      else setStatus({ ok: false, texto: r.erro ?? 'Falha ao conectar.' });
    } catch (e) { setStatus({ ok: false, texto: (e as Error).message }); }
    setOcupado(false);
  };

  const salvar = async () => {
    const erro = validarSql(valor);
    if (erro) { setStatus({ ok: false, texto: erro }); return; }
    if (!valor.nomeSalvar.trim()) { setStatus({ ok: false, texto: 'Informe um nome pra conexão.' }); return; }
    if (salvas.some((c) => c.nome.toLowerCase() === valor.nomeSalvar.trim().toLowerCase() && c.id !== valor.id) && !window.confirm('Já existe uma conexão salva com esse nome. Sobrescrever?')) return;
    try {
      const r = await bancoApi.salvarSql({ ...paraConexaoSql({ ...valor, id: undefined }), nome: valor.nomeSalvar.trim(), salvarSenha: valor.salvarSenha });
      await recarregar();
      onChange({ ...valor, id: r.id });
      setStatus({ ok: true, texto: 'Conexão salva.' });
    } catch (e) { setStatus({ ok: false, texto: (e as Error).message }); }
  };

  const excluir = async () => {
    if (!valor.id || !window.confirm('Excluir a conexão salva?')) return;
    try { await bancoApi.removerConexao(valor.id); await recarregar(); onChange({ ...conexaoSqlPadrao() }); } catch (e) { setStatus({ ok: false, texto: (e as Error).message }); }
  };

  return (
    <div style={grade}>
      <label>Conexões salvas</label>
      <select value={valor.id ?? ''} onChange={(e) => escolherSalva(e.target.value)}>
        <option value="">(nova conexão)</option>
        {salvas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <label>SGBD</label>
      <select value={valor.tipo} onChange={(e) => mudarTipo(e.target.value as EstadoSql['tipo'])}>
        {(tipos.length ? tipos : [{ id: 'postgresql', nome: 'PostgreSQL', disponivel: true } as TipoBancoInfo]).map((t) => (
          <option key={t.id} value={t.id} disabled={!t.disponivel}>{t.nome}{t.disponivel ? '' : ' (indisponível neste servidor)'}</option>
        ))}
      </select>
      {!sqlite && <>
        <label>Host</label><input value={valor.host} onChange={(e) => editar({ host: e.target.value })} />
        <label>Porta</label><input type="number" value={valor.porta || ''} onChange={(e) => editar({ porta: Number(e.target.value) })} />
      </>}
      <label>{sqlite ? 'Arquivo (no servidor)' : 'Database'}</label>
      <input value={valor.database} onChange={(e) => editar({ database: e.target.value })} placeholder={sqlite ? '/caminho/no/servidor/banco.db' : ''} />
      {!sqlite && <>
        <label>Usuário</label><input value={valor.usuario} autoComplete="off" onChange={(e) => editar({ usuario: e.target.value }, false)} />
        <label>Senha</label>
        <input type="password" autoComplete="new-password" value={valor.senha} placeholder={valor.id ? '(usa a senha salva, se houver)' : ''} onChange={(e) => editar({ senha: e.target.value }, false)} />
        <span />
        <label><input type="checkbox" checked={valor.tls} onChange={(e) => editar({ tls: e.target.checked, confiarCertificado: e.target.checked ? valor.confiarCertificado : false })} /> Usar TLS/SSL</label>
        {valor.tls && <>
          <span />
          <div>
            <label><input type="checkbox" checked={valor.confiarCertificado} onChange={(e) => editar({ confiarCertificado: e.target.checked })} /> Confiar em certificado autoassinado (rede interna)</label>
            <div className="dica">Mantém a conexão criptografada, mas não valida a identidade do servidor. Marque só numa rede interna confiável.</div>
          </div>
        </>}
      </>}
      {comSchema && info?.usaSchema && <>
        <label>Schema</label>
        <select value={valor.schema ?? ''} onChange={(e) => editar({ schema: e.target.value }, false)}>
          <option value="">(todos os schemas)</option>
          {[...new Set([...(valor.schema ? [valor.schema] : []), ...schemas])].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </>}
      <span />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={testar} disabled={ocupado}>Testar conexão</button>
        {status && <span style={{ color: status.ok ? '#1e7e34' : '#b03030' }}>{status.texto}</span>}
      </div>
      <label>Salvar como</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input value={valor.nomeSalvar} onChange={(e) => onChange({ ...valor, nomeSalvar: e.target.value })} placeholder="nome da conexão" style={{ flex: 1, minWidth: 100 }} />
        <button onClick={salvar}>Salvar</button>
        {valor.id && <button onClick={excluir}>Excluir</button>}
      </div>
      {!sqlite && <>
        <span />
        <label><input type="checkbox" checked={valor.salvarSenha} onChange={(e) => onChange({ ...valor, salvarSenha: e.target.checked })} /> Salvar a senha (cifrada no servidor)</label>
      </>}
    </div>
  );
}

// ---- NoSQL ----------------------------------------------------------------------------------

export interface EstadoNoSql extends ConexaoNoSqlDados {
  amostra: number;
  nomeSalvar: string;
  salvarCredenciais: boolean;
}

export const conexaoNoSqlPadrao = (): EstadoNoSql => ({ uri: 'mongodb://localhost:27017', database: '', amostra: 50, nomeSalvar: '', salvarCredenciais: false });

export const paraConexaoNoSql = (e: EstadoNoSql): ConexaoNoSqlDados => ({ id: e.id, uri: e.uri, database: e.database, amostra: e.amostra });

export function FormConexaoNoSql({ valor, onChange, onColecoes }: { valor: EstadoNoSql; onChange: (v: EstadoNoSql) => void; onColecoes?: (c: string[]) => void }) {
  const { lista, recarregar } = useSalvas();
  const salvas = lista.filter((c) => c.kind === 'nosql');
  const [status, setStatus] = useState<{ ok: boolean; texto: string } | null>(null);
  const [colecoes, setColecoes] = useState<string[]>([]);
  const validar = () => (!valor.uri.trim() || !valor.database.trim() ? 'Preencha a string de conexão e o database.' : null);

  const testar = async () => {
    const erro = validar();
    if (erro) { setStatus({ ok: false, texto: erro }); return; }
    setStatus({ ok: true, texto: 'Conectando...' });
    try {
      const r = await bancoApi.nosqlTestar(paraConexaoNoSql(valor));
      if (r.ok) { setColecoes(r.colecoes); onColecoes?.(r.colecoes); setStatus({ ok: true, texto: `✓ Conexão bem-sucedida (${r.colecoes.length} coleções)` }); }
      else setStatus({ ok: false, texto: r.erro ?? 'Falha ao conectar.' });
    } catch (e) { setStatus({ ok: false, texto: (e as Error).message }); }
  };

  const escolher = (id: string) => {
    const c = salvas.find((x) => x.id === id);
    if (!c) { onChange(conexaoNoSqlPadrao()); return; }
    onChange({ id: c.id, uri: c.uri ?? '', database: c.database, amostra: c.amostra ?? 50, nomeSalvar: c.nome, salvarCredenciais: !!c.salvarCredenciais });
  };

  const salvar = async () => {
    const erro = validar();
    if (erro) { setStatus({ ok: false, texto: erro }); return; }
    if (!valor.nomeSalvar.trim()) { setStatus({ ok: false, texto: 'Informe um nome pra conexão.' }); return; }
    try {
      const r = await bancoApi.salvarNoSql({ ...paraConexaoNoSql({ ...valor, id: undefined }), nome: valor.nomeSalvar.trim(), salvarCredenciais: valor.salvarCredenciais });
      await recarregar();
      onChange({ ...valor, id: r.id });
      setStatus({ ok: true, texto: 'Conexão salva.' });
    } catch (e) { setStatus({ ok: false, texto: (e as Error).message }); }
  };

  const excluir = async () => {
    if (!valor.id || !window.confirm('Excluir a conexão salva?')) return;
    try { await bancoApi.removerConexao(valor.id); await recarregar(); onChange(conexaoNoSqlPadrao()); } catch (e) { setStatus({ ok: false, texto: (e as Error).message }); }
  };

  return (
    <div style={grade}>
      <label>Conexões salvas</label>
      <select value={valor.id ?? ''} onChange={(e) => escolher(e.target.value)}>
        <option value="">(nova conexão)</option>
        {salvas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <label>SGBD</label><select disabled><option>MongoDB</option></select>
      <label>String de conexão</label>
      <input value={valor.uri} autoComplete="off" onChange={(e) => onChange({ ...valor, uri: e.target.value, id: valor.id && valor.salvarCredenciais ? undefined : valor.id })} />
      <label>Database</label><input value={valor.database} onChange={(e) => onChange({ ...valor, database: e.target.value })} />
      <label>Amostra por coleção</label>
      <input type="number" min={1} max={1000} value={valor.amostra} onChange={(e) => onChange({ ...valor, amostra: Number(e.target.value) })} />
      <span />
      <label><input type="checkbox" checked={valor.salvarCredenciais} onChange={(e) => onChange({ ...valor, salvarCredenciais: e.target.checked })} /> Salvar credenciais da string de conexão (cifradas no servidor)</label>
      <span />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={testar}>Testar conexão</button>
        {status && <span style={{ color: status.ok ? '#1e7e34' : '#b03030' }}>{status.texto}</span>}
      </div>
      <label>Salvar como</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={valor.nomeSalvar} onChange={(e) => onChange({ ...valor, nomeSalvar: e.target.value })} placeholder="nome da conexão" style={{ flex: 1 }} />
        <button onClick={salvar}>Salvar</button>
        {valor.id && <button onClick={excluir}>Excluir</button>}
      </div>
      {colecoes.length > 0 && <><label>Coleções</label><div style={{ maxHeight: 90, overflow: 'auto', fontSize: 12 }}>{colecoes.join(', ')}</div></>}
    </div>
  );
}
