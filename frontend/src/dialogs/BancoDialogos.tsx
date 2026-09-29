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

import { EditorCodigo } from '../ui/Codigo';
import { useState } from 'react';
import { bancoApi } from '../api';
import { abaAtiva } from '../editor/store';
import { abrirImportadoBanco, abrirNoSqlImportado } from '../editor/comandosBanco';
import { abrirDialogo, fecharDialogo } from '../ui/dialogos';
import { Modal } from './Modal';
import {
  conexaoNoSqlPadrao, conexaoSqlPadrao, EstadoNoSql, EstadoSql, FormConexaoNoSql, FormConexaoSql, paraConexaoNoSql, paraConexaoSql, validarSql,
} from './BancoConexao';

/** Importar do banco conectado (ImportarBancoDialog): conecta, gera o DDL do schema e importa como Lógico, Conceitual ou ambos. */
export function BancoImportar() {
  const [c, setC] = useState<EstadoSql>(conexaoSqlPadrao);
  const [modo, setModo] = useState<'logico' | 'conceitual' | 'ambos'>('logico');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const importar = async () => {
    const e = validarSql(c);
    if (e) { setErro(e); return; }
    setOcupado(true); setErro('');
    try {
      const r = await bancoApi.importar({ conexao: { ...paraConexaoSql(c) }, schema: c.schema, modo, nome: c.database.split('/').pop() || 'Banco' });
      fecharDialogo();
      abrirImportadoBanco(r, 'Importar do banco conectado');
    } catch (x) { setErro('Falha ao conectar/introspeccionar: ' + (x as Error).message); }
    setOcupado(false);
  };
  return (
    <Modal titulo="Importar do banco conectado" onFechar={fecharDialogo} largura={620} rodape={<>
      <button onClick={importar} disabled={ocupado}>{ocupado ? 'Importando...' : 'Conectar e importar'}</button><button onClick={fecharDialogo}>Cancelar</button></>}>
      <FormConexaoSql valor={c} onChange={setC} />
      <p style={{ marginTop: 10 }}>
        Importar como:{' '}
        <select value={modo} onChange={(e) => setModo(e.target.value as typeof modo)}>
          <option value="logico">Modelo Lógico</option><option value="conceitual">Modelo Conceitual</option><option value="ambos">Ambos</option>
        </select>
      </p>
      {erro && <pre className="erros">{erro}</pre>}
    </Modal>
  );
}

/** Importar do banco NoSQL (ImportarNoSqlDialog): amostra documentos e desenha uma coleção por coleção. */
export function BancoNoSql() {
  const [c, setC] = useState<EstadoNoSql>(conexaoNoSqlPadrao);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const importar = async () => {
    if (!c.uri.trim() || !c.database.trim()) { setErro('Preencha a string de conexão e o database.'); return; }
    setOcupado(true); setErro('');
    try {
      const r = await bancoApi.nosqlImportar(paraConexaoNoSql(c), c.amostra);
      fecharDialogo();
      abrirNoSqlImportado(r.formas, c.database);
    } catch (x) { setErro('Falha ao conectar/amostrar: ' + (x as Error).message); }
    setOcupado(false);
  };
  return (
    <Modal titulo="Importar do banco NoSQL conectado" onFechar={fecharDialogo} largura={620} rodape={<>
      <button onClick={importar} disabled={ocupado}>{ocupado ? 'Amostrando...' : 'Conectar e importar'}</button><button onClick={fecharDialogo}>Cancelar</button></>}>
      <FormConexaoNoSql valor={c} onChange={setC} />
      {erro && <pre className="erros">{erro}</pre>}
    </Modal>
  );
}

/** Gerar script de migração (MigracaoBancoDialog): diff do modelo Lógico aberto contra o banco conectado. */
export function BancoMigracao() {
  const [c, setC] = useState<EstadoSql>(conexaoSqlPadrao);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const gerar = async () => {
    const e = validarSql(c);
    if (e) { setErro(e); return; }
    const a = abaAtiva();
    if (!a || a.doc.tipo !== 'logico') { setErro('Abra um diagrama Lógico.'); return; }
    setOcupado(true); setErro('');
    try {
      const r = await bancoApi.migracao(paraConexaoSql(c), c.schema ?? '', a.doc);
      abrirDialogo({ tipo: 'texto', titulo: 'Script de migração', texto: r.texto, nomeArquivo: `${a.doc.nome.replace(/[^\w.-]+/g, '_') || 'modelo'}_migracao.sql` });
    } catch (x) { setErro('Falha ao conectar/comparar: ' + (x as Error).message); }
    setOcupado(false);
  };
  return (
    <Modal titulo="Gerar script de migração" onFechar={fecharDialogo} largura={620} rodape={<>
      <button onClick={gerar} disabled={ocupado}>{ocupado ? 'Comparando...' : 'Conectar e gerar'}</button><button onClick={fecharDialogo}>Cancelar</button></>}>
      <p className="dica">Compara o modelo Lógico aberto com o schema do banco e gera um script incremental. Só CREATE TABLE, ADD COLUMN e ADD CONSTRAINT saem prontos; DROP e mudança de tipo saem comentados.</p>
      <FormConexaoSql valor={c} onChange={setC} />
      {erro && <pre className="erros">{erro}</pre>}
    </Modal>
  );
}

/** Executar SQL no banco conectado, com a confirmação ("essa alteração não poderá ser desfeita"). */
export function BancoExecutar({ sql: inicial }: { sql?: string }) {
  const [c, setC] = useState<EstadoSql>(conexaoSqlPadrao);
  const [sql, setSql] = useState(inicial ?? '');
  const [continuar, setContinuar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [res, setRes] = useState<Awaited<ReturnType<typeof bancoApi.executar>> | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const pedir = () => {
    const e = validarSql(c);
    if (e) { setErro(e); return; }
    if (!sql.trim()) { setErro('Informe o comando SQL.'); return; }
    setErro(''); setConfirmando(true);
  };
  const executar = async () => {
    setConfirmando(false); setOcupado(true); setErro(''); setRes(null);
    try { setRes(await bancoApi.executar({ conexao: paraConexaoSql(c), sql, confirmar: true, continuarNoErro: continuar })); }
    catch (x) { setErro((x as Error).message); }
    setOcupado(false);
  };
  return (
    <Modal titulo="Executar SQL no banco" onFechar={fecharDialogo} largura={860} rodape={<>
      <button onClick={pedir} disabled={ocupado}>{ocupado ? 'Executando...' : 'Executar'}</button><button onClick={fecharDialogo}>Fechar</button></>}>
      <FormConexaoSql valor={c} onChange={setC} comSchema={false} />
      <EditorCodigo valor={sql} aoMudar={setSql} linguagem="sql" rows={8} placeholder="Comandos SQL separados por ;" style={{ marginTop: 10 }} />
      <label><input type="checkbox" checked={continuar} onChange={(e) => setContinuar(e.target.checked)} /> Continuar mesmo se um comando falhar</label>
      {confirmando && (
        <div className="erros" style={{ marginTop: 8 }}>
          <p><b>Confirmar ação.</b> Você tem certeza que deseja executar o comando fornecido? Essa alteração não poderá ser desfeita.</p>
          <button onClick={executar}>Sim, executar</button> <button onClick={() => setConfirmando(false)}>Não</button>
        </div>
      )}
      {erro && <pre className="erros">{erro}</pre>}
      {res && res.resultados.map((r, i) => (
        <div key={i} style={{ marginTop: 8 }}>
          <div className="dica"><code>{r.sql.length > 120 ? r.sql.slice(0, 120) + '...' : r.sql}</code> ({r.ms} ms)</div>
          {r.erro ? <pre className="erros">{r.erro}</pre>
            : r.colunas.length ? (
              <div style={{ maxHeight: 220, overflow: 'auto' }}>
                <table className="ed-campos"><thead><tr>{r.colunas.map((k, j) => <th key={j}>{k}</th>)}</tr></thead>
                  <tbody>{r.linhas.map((l, j) => <tr key={j}>{l.map((v, k) => <td key={k}>{v == null ? <i>null</i> : String(v)}</td>)}</tr>)}</tbody></table>
                {r.truncado && <div className="dica">Resultado cortado no limite de linhas.</div>}
              </div>
            ) : <div>Comando executado com sucesso{r.afetadas != null ? ` (${r.afetadas} linhas afetadas)` : ''}.</div>}
        </div>
      ))}
      {res?.parou && <p className="erros">A execução parou no primeiro erro.</p>}
    </Modal>
  );
}

