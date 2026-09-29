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

import { useState } from 'react';
import { bancoApi, ColunaBanco, ObjetoBanco, TipoObjetoBanco } from '../api';
import {
  conexaoSqlPadrao, EstadoSql, FormConexaoSql, paraConexaoSql, validarSql,
} from '../dialogs/BancoConexao';
import { TIPO_DND_TABELA, TabelaDoBanco } from '../editor/bancoDrop';
import { definirConexao } from '../sql/sqlStudioStore';
import { abrirDialogo } from './dialogos';

const ICONE: Record<TipoObjetoBanco, string> = {
  TABELA: 'Tabela.png', VIEW: 'Visao.png', VIEW_MATERIALIZADA: 'Visao.png', SEQUENCIA: 'sequencia.png', ROTINA: 'funcao.png',
};

interface NoSchema {
  nome: string;
  aberto: boolean;
  carregando?: boolean;
  erro?: string;
  objetos?: ObjetoBanco[];
  sequencias?: ObjetoBanco[];
  rotinas?: ObjetoBanco[];
}

const arrastavel = (t: TipoObjetoBanco) => t === 'TABELA' || t === 'VIEW' || t === 'VIEW_MATERIALIZADA';
const textoColuna = (c: ColunaBanco) => `${c.nome}: ${c.tipo}${c.chavePrimaria ? '  [PK]' : ''}${c.nullable ? '' : '  NOT NULL'}`;

/**
 * Aba "Banco" da barra lateral: conexão, conexões salvas e árvore schemas -> tabelas -> colunas.
 * Arrastar uma tabela/view para o diagrama Lógico grava o JSON de TabelaDoBanco em 'application/x-modelforge-tabela'.
 */
export function BancoPanel() {
  const [c, setC] = useState<EstadoSql>(conexaoSqlPadrao);
  const [formAberto, setFormAberto] = useState(true);
  const [nos, setNos] = useState<NoSchema[] | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [usaSchema, setUsaSchema] = useState(true);
  const conexao = () => paraConexaoSql(c);

  const alterarNo = (nome: string, p: Partial<NoSchema>) => setNos((l) => l?.map((n) => (n.nome === nome ? { ...n, ...p } : n)) ?? l);

  const carregarSchema = async (nome: string) => {
    alterarNo(nome, { carregando: true, erro: undefined });
    try {
      const r = await bancoApi.objetos(conexao(), nome);
      alterarNo(nome, { carregando: false, objetos: r.objetos, sequencias: r.sequencias, rotinas: r.rotinas });
    } catch (e) { alterarNo(nome, { carregando: false, erro: (e as Error).message }); }
  };

  const conectar = async () => {
    const e = validarSql(c);
    if (e) { setErro(e); return; }
    setOcupado(true); setErro('');
    try {
      const t = await bancoApi.testar(conexao());
      if (!t.ok) { setErro(t.erro ?? 'Falha ao conectar.'); setOcupado(false); return; }
      const tipos = await bancoApi.tipos();
      const us = tipos.tipos.find((x) => x.id === c.tipo)?.usaSchema ?? false;
      setUsaSchema(us);
      const lista = us ? (c.schema ? [c.schema] : t.schemas) : [''];
      setNos(lista.map((nome) => ({ nome, aberto: !us || lista.length === 1 })));
      setFormAberto(false);
      setAbertos(new Set());
      //# Repassa a conexão ativa para o SQL Studio.
      definirConexao(conexao(), c.nomeSalvar || c.database || 'Conexão', us ? (c.schema ?? lista[0] ?? '') : '');
      //# Sem schemas (MySQL, SQLite) ou com um só escolhido: já mostra os objetos.
      if (!us || lista.length === 1) await carregarSchema(lista[0]);
    } catch (x) { setErro((x as Error).message); }
    setOcupado(false);
  };

  const alternarSchema = (n: NoSchema) => {
    alterarNo(n.nome, { aberto: !n.aberto });
    if (!n.aberto && !n.objetos && !n.carregando) carregarSchema(n.nome);
  };

  const alternar = (chave: string) => setAbertos((s) => { const x = new Set(s); if (x.has(chave)) x.delete(chave); else x.add(chave); return x; });

  const verDdl = async (schema: string, o: ObjetoBanco) => {
    try {
      const r = await bancoApi.detalhes(conexao(), schema, o.nome, o.tipo);
      abrirDialogo({ tipo: 'texto', titulo: `DDL de ${o.nome}`, texto: r.ddl + (r.avisos.length ? '\n-- Avisos: ' + r.avisos.join('; ') + '\n' : ''), nomeArquivo: `${o.nome}.sql` });
    } catch (e) { setErro((e as Error).message); }
  };

  const verDados = (schema: string, o: ObjetoBanco) => abrirDialogo({ tipo: 'dataGrid', schema: usaSchema ? schema : '', tabela: o.nome, titulo: o.nome });

  const iniciarArraste = (ev: React.DragEvent, schema: string, o: ObjetoBanco) => {
    const payload: TabelaDoBanco = { nome: o.nome, tipo: o.tipo, schema: usaSchema ? schema : '', colunas: o.colunas ?? [], conexao: conexao() };
    ev.dataTransfer.setData(TIPO_DND_TABELA, JSON.stringify(payload));
    ev.dataTransfer.setData('text/plain', o.nome);
    ev.dataTransfer.effectAllowed = 'copy';
  };

  const Objeto = ({ schema, o }: { schema: string; o: ObjetoBanco }) => {
    const chave = `${schema}/${o.tipo}/${o.nome}`;
    const abre = !!o.colunas?.length;
    return (
      <>
        <div className="arvore-item" style={{ paddingLeft: 28 }} draggable={arrastavel(o.tipo)} onDragStart={(ev) => arrastavel(o.tipo) && iniciarArraste(ev, schema, o)}
          onDoubleClick={() => (o.tipo === 'TABELA' ? verDados(schema, o) : o.tipo.startsWith('VIEW') && verDdl(schema, o))}
          title={arrastavel(o.tipo) ? 'Arraste para o diagrama; duplo clique abre os dados (tabela) ou o DDL (view)' : undefined}>
          <span className="arvore-sinal" onClick={() => abre && alternar(chave)}>{abre ? (abertos.has(chave) ? '▾' : '▸') : ''}</span>
          <img src={`/icons/${ICONE[o.tipo]}`} alt="" width={14} height={14} />{o.nome}
        </div>
        {abertos.has(chave) && o.colunas?.map((k) => (
          <div key={k.nome} className="arvore-item filho" style={{ paddingLeft: 52 }}>
            <img src={`/icons/${k.chavePrimaria ? 'CampoK.png' : 'Campo.png'}`} alt="" width={14} height={14} />{textoColuna(k)}
          </div>
        ))}
      </>
    );
  };

  const Grupo = ({ schema, itens }: { schema: string; itens?: ObjetoBanco[] }) => <>{itens?.map((o) => <Objeto key={`${o.tipo}${o.nome}`} schema={schema} o={o} />)}</>;

  return (
    <div style={{ padding: 8, fontSize: 12 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        <button onClick={() => setFormAberto((v) => !v)}>{formAberto ? 'Ocultar conexão' : 'Conexão...'}</button>
        <button onClick={conectar} disabled={ocupado}>{ocupado ? 'Conectando...' : nos ? 'Atualizar' : 'Conectar'}</button>
        <button onClick={() => abrirDialogo({ tipo: 'bancoImportar' })}>Importar...</button>
        <button onClick={() => abrirDialogo({ tipo: 'bancoExecutar' })}>Executar SQL...</button>
        <button onClick={() => abrirDialogo({ tipo: 'sqlStudio' })} disabled={!nos} title={nos ? 'Abrir SQL Studio' : 'Conecte a um banco primeiro'}>SQL Studio...</button>
      </div>
      {formAberto && <FormConexaoSql valor={c} onChange={setC} />}
      {erro && <pre className="erros" style={{ whiteSpace: 'pre-wrap' }}>{erro}</pre>}
      {nos && (
        <div className="arvore" role="tree" style={{ marginTop: 8 }}>
          <div className="arvore-raiz"><img src="/icons/db_conexao.png" alt="" width={14} height={14} /> {c.nomeSalvar || c.database || 'Conexão'}</div>
          {nos.map((n) => (
            <div key={n.nome}>
              {usaSchema && (
                <div className="arvore-item" onClick={() => alternarSchema(n)}>
                  <span className="arvore-sinal">{n.aberto ? '▾' : '▸'}</span>
                  <img src="/icons/db_schema.png" alt="" width={14} height={14} />{n.nome}
                </div>
              )}
              {n.aberto && (
                <>
                  {n.carregando && <div className="arvore-vazia">Carregando...</div>}
                  {n.erro && <div className="arvore-vazia" style={{ color: '#b03030' }}>{n.erro}</div>}
                  <Grupo schema={n.nome} itens={n.objetos} />
                  <Grupo schema={n.nome} itens={n.sequencias} />
                  <Grupo schema={n.nome} itens={n.rotinas} />
                  {n.objetos && !n.objetos.length && <div className="arvore-vazia">Nenhuma tabela.</div>}
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {!nos && !formAberto && <div className="arvore-vazia">Não conectado.</div>}
    </div>
  );
}
