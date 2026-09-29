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

import { useMemo, useState } from 'react';
import { alternarFk, alternarPk, alternarUnique, constraintVazia, nomeieCampo, propsTabela, removerCampo, sincronizarFlags } from '../editor/logico';
import { reapontarAutoFk } from '../editor/integridade';
import { atualizarProps } from '../editor/ops';
import { abaAtiva, mutar } from '../editor/store';
import { CampoTabela, ConstraintTabela, Forma, GatilhoTabela, IndiceTabela, campoVazio, novoId } from '../editor/types';
import { Modal } from './Modal';
import { BotaoSerieCampos } from './AdicionarEmSerie';

const TIPOS = ['INTEGER', 'BIGINT', 'SMALLINT', 'SERIAL', 'BIGSERIAL', 'VARCHAR(80)', 'VARCHAR(255)', 'TEXT', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'TIME', 'NUMERIC(10,2)', 'REAL', 'DOUBLE PRECISION', 'UUID', 'JSONB', 'BYTEA', 'GEOMETRY', 'GEOGRAPHY'];
const ACOES = ['', 'CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT', 'NO ACTION'];
const METODOS = ['', 'btree', 'hash', 'gist', 'gin', 'spgist', 'brin'];
const MOMENTOS = ['BEFORE', 'AFTER', 'INSTEAD OF'];
const EVENTOS = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'];

type Aba = 'campos' | 'constraints' | 'indices' | 'gatilhos';

function Marcadores({ campos, valor, onChange }: { campos: CampoTabela[]; valor: (string | null)[]; onChange: (v: string[]) => void }) {
  return (
    <span className="marcadores">
      {campos.map((c) => (
        <label key={c.id}>
          <input type="checkbox" checked={valor.includes(c.id)} onChange={(e) => onChange(e.target.checked ? [...valor.filter((x): x is string => !!x), c.id] : valor.filter((x): x is string => !!x && x !== c.id))} />
          {c.nome}
        </label>
      ))}
    </span>
  );
}

/** Editor da Tabela (Lógico): campos, constraints (PK/UNIQUE/FK/CHECK), índices e gatilhos. */
export function EditorCampos({ id, onFechar, aba: abaInicial = 'campos' }: { id: string; onFechar: () => void; aba?: Aba }) {
  const doc = abaAtiva()!.doc;
  const original = doc.formas.find((f) => f.id === id);
  const [t, setT] = useState<Forma | undefined>(() => (original ? structuredClone(original) : undefined));
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [sel, setSel] = useState(-1);
  const outras = useMemo(() => doc.formas.filter((f) => f.kind === 'tabela' && f.id !== id), [doc, id]);
  if (!t || !original) return null;
  const p = propsTabela(t);
  const set = (parcial: Partial<typeof p>) => setT({ ...t, props: { ...t.props, ...parcial } });
  const setCampos = (campos: CampoTabela[]) => set({ campos });
  const editCampo = (i: number, patch: Partial<CampoTabela>) => setCampos(p.campos.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const mover = (d: number) => {
    const j = sel + d;
    if (sel < 0 || j < 0 || j >= p.campos.length) return;
    const n = p.campos.slice();
    [n[sel], n[j]] = [n[j], n[sel]];
    setCampos(n);
    setSel(j);
  };

  //# Chaves referenciáveis (PK/UNIQUE) de todas as tabelas do diagrama, para a origem de uma FK.
  const origens = [t, ...outras].flatMap((tb) =>
    propsTabela(tb).constraints.map((c, indice) => ({ tb, c, indice })).filter((x) => x.c.tipo === 'PK' || x.c.tipo === 'UNIQUE'),
  );
  const nomeCampos = (tb: Forma, ids: (string | null)[]) => ids.map((x) => propsTabela(tb).campos.find((c) => c.id === x)?.nome ?? '?').join(', ');
  const rotuloOrigem = (o: { tb: Forma; c: ConstraintTabela }) => `${o.tb.texto}.${o.c.tipo}(${nomeCampos(o.tb, o.c.camposOrigem)})`;

  //# Auto-referência: as FKs desta tabela que apontam para as próprias IR seguem a IR ao inserir/remover/reordenar.
  const setConstraints = (cs: ConstraintTabela[]) => setT(sincronizarFlags({ ...t, props: { ...t.props, constraints: reapontarAutoFk(t.id, p.constraints, cs) } }));
  const editCons = (i: number, patch: Partial<ConstraintTabela>) => setConstraints(p.constraints.map((c, k) => (k === i ? { ...c, ...patch } : c)));

  const aplicar = () => {
    mutar((d) => atualizarProps(d, id, { ...p, campos: p.campos }));
    onFechar();
  };

  return (
    <Modal
      titulo={`Editor da tabela - ${t.texto}`} onFechar={onFechar} largura={1040}
      rodape={<><button onClick={aplicar}>OK</button><button onClick={onFechar}>Cancelar</button></>}
    >
      <div className="ed-abas" role="tablist">
        {([['campos', 'Campos'], ['constraints', 'Constraints'], ['indices', 'Índices'], ['gatilhos', 'Gatilhos']] as [Aba, string][]).map(([k, r]) => (
          <button key={k} role="tab" aria-selected={aba === k} className={aba === k ? 'ativa' : ''} onClick={() => { setAba(k); setSel(-1); }}>{r}</button>
        ))}
      </div>

      {aba === 'campos' && (
        <>
          <div className="ed-campos-barra">
            <button onClick={() => { setCampos([...p.campos, campoVazio(nomeieCampo(p.campos, 'Campo'))]); setSel(p.campos.length); }}>+ Adicionar</button>
            <BotaoSerieCampos aoAdicionar={(its) => setCampos([...p.campos, ...its.map((it) => ({ ...campoVazio(it.nome, it.tipo), complemento: it.complemento }))])} />
            <button disabled={sel < 0} onClick={() => { const c = p.campos[sel]; setT(removerCampo(t, c.id)); setSel(-1); }}>Remover</button>
            <button disabled={sel < 0} onClick={() => mover(-1)}>↑</button>
            <button disabled={sel < 0} onClick={() => mover(1)}>↓</button>
          </div>
          <datalist id="tipos-sql">{TIPOS.map((x) => <option key={x} value={x} />)}</datalist>
          <div className="ed-campos-scroll">
            <table className="ed-campos">
              <thead><tr><th>Nome</th><th>Tipo</th><th>PK</th><th>Único</th><th>FK</th><th>Complemento</th><th>Padrão</th><th>SRID</th><th>Subtipo</th><th>Dicionário</th><th>Observação</th></tr></thead>
              <tbody>
                {p.campos.map((c, i) => (
                  <tr key={c.id} className={i === sel ? 'sel' : ''} onClick={() => setSel(i)}>
                    <td><input value={c.nome} onChange={(e) => editCampo(i, { nome: e.target.value })} /></td>
                    <td><input list="tipos-sql" value={c.tipo} onChange={(e) => editCampo(i, { tipo: e.target.value })} /></td>
                    <td><input type="checkbox" checked={c.pk} onChange={(e) => setT(alternarPk(t, c.id, e.target.checked))} /></td>
                    <td><input type="checkbox" checked={c.unique} onChange={(e) => setT(alternarUnique(t, c.id, e.target.checked))} /></td>
                    <td><input type="checkbox" checked={c.fk} onChange={(e) => setT(alternarFk(t, c.id, e.target.checked))} /></td>
                    <td><input value={c.complemento} placeholder="NOT NULL..." onChange={(e) => editCampo(i, { complemento: e.target.value })} /></td>
                    <td><input value={c.padrao} onChange={(e) => editCampo(i, { padrao: e.target.value })} /></td>
                    <td><input value={c.srid} disabled={!/^(geometry|geography)/i.test(c.tipo)} onChange={(e) => editCampo(i, { srid: e.target.value })} /></td>
                    <td><input value={c.subtipoGeometria} disabled={!/^(geometry|geography)/i.test(c.tipo)} onChange={(e) => editCampo(i, { subtipoGeometria: e.target.value })} /></td>
                    <td><input value={c.dicionario} onChange={(e) => editCampo(i, { dicionario: e.target.value })} /></td>
                    <td><input value={c.observacao} onChange={(e) => editCampo(i, { observacao: e.target.value })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!p.campos.length && <p className="vazio">Nenhum campo. Use "Adicionar".</p>}
          </div>
        </>
      )}

      {aba === 'constraints' && (
        <>
          <div className="ed-campos-barra">
            {(['PK', 'UNIQUE', 'FK', 'CHECK'] as const).map((tp) => (
              <button key={tp} onClick={() => { setConstraints([...p.constraints, constraintVazia(tp)]); setSel(p.constraints.length); }}>+ {tp}</button>
            ))}
          </div>
          <div className="ed-lista">
            {p.constraints.map((c, i) => (
              <div key={c.id} className={`ed-item${i === sel ? ' sel' : ''}`} onClick={() => setSel(i)}>
                <div className="ed-item-topo">
                  <b>{c.tipo}</b>
                  <label><input type="checkbox" checked={c.nomeada} onChange={(e) => editCons(i, { nomeada: e.target.checked })} /> nomeada</label>
                  <input placeholder="nome da constraint" disabled={!c.nomeada} value={c.nome} onChange={(e) => editCons(i, { nome: e.target.value })} />
                  <button onClick={() => setConstraints(p.constraints.filter((_, k) => k !== i))}>Remover</button>
                </div>
                <input className="largo" placeholder="Dicionário" value={c.dicionario ?? ''} onChange={(e) => editCons(i, { dicionario: e.target.value })} />
                <input className="largo" placeholder="Observação" value={c.observacao ?? ''} onChange={(e) => editCons(i, { observacao: e.target.value })} />
                {c.tipo === 'CHECK' && <input className="largo" placeholder="expressão (ex.: valor > 0)" value={c.expressao} onChange={(e) => editCons(i, { expressao: e.target.value })} />}
                {(c.tipo === 'PK' || c.tipo === 'UNIQUE') && (
                  <Marcadores campos={p.campos} valor={c.camposOrigem} onChange={(v) => editCons(i, { camposOrigem: v, camposDestino: v.map(() => null) })} />
                )}
                {c.tipo === 'FK' && (
                  <div className="ed-fk">
                    <label>Referencia
                      <select value={c.constraintOrigem ? `${c.constraintOrigem.tabelaId}|${c.constraintOrigem.indice}` : ''} onChange={(e) => {
                        const [tabelaId, ix] = e.target.value.split('|');
                        editCons(i, { constraintOrigem: e.target.value ? { tabelaId, indice: Number(ix) } : null, camposOrigem: c.camposDestino.map(() => null) });
                      }}>
                        <option value="">— escolha a chave de origem —</option>
                        {origens.filter((o) => o.tb.id !== t.id || true).map((o) => <option key={`${o.tb.id}|${o.indice}`} value={`${o.tb.id}|${o.indice}`}>{rotuloOrigem(o)}</option>)}
                      </select>
                    </label>
                    {c.camposDestino.map((dst, k) => {
                      const ori = c.constraintOrigem ? [t, ...outras].find((x) => x.id === c.constraintOrigem!.tabelaId) : undefined;
                      const oriCons = ori ? propsTabela(ori).constraints[c.constraintOrigem!.indice] : undefined;
                      return (
                        <div key={k} className="ed-fk-par">
                          <select value={dst ?? ''} onChange={(e) => editCons(i, { camposDestino: c.camposDestino.map((x, m) => (m === k ? e.target.value || null : x)) })}>
                            <option value="">?</option>{p.campos.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                          </select>
                          →
                          <select value={c.camposOrigem[k] ?? ''} onChange={(e) => editCons(i, { camposOrigem: c.camposOrigem.map((x, m) => (m === k ? e.target.value || null : x)) })}>
                            <option value="">?</option>
                            {(oriCons?.camposOrigem ?? []).map((cid) => <option key={cid} value={cid ?? ''}>{ori ? nomeCampos(ori, [cid]) : ''}</option>)}
                          </select>
                          <button onClick={() => editCons(i, { camposDestino: c.camposDestino.filter((_, m) => m !== k), camposOrigem: c.camposOrigem.filter((_, m) => m !== k) })}>×</button>
                        </div>
                      );
                    })}
                    <button onClick={() => editCons(i, { camposDestino: [...c.camposDestino, null], camposOrigem: [...c.camposOrigem, null] })}>+ coluna</button>
                    <datalist id="acoes-fk">{ACOES.filter(Boolean).map((a) => <option key={a} value={a} />)}</datalist>
                    <label>On Update <input list="acoes-fk" value={c.onUpdate} onChange={(e) => editCons(i, { onUpdate: e.target.value })} /></label>
                    <label>On Delete <input list="acoes-fk" value={c.onDelete} onChange={(e) => editCons(i, { onDelete: e.target.value })} /></label>
                  </div>
                )}
              </div>
            ))}
            {!p.constraints.length && <p className="vazio">Nenhuma constraint.</p>}
          </div>
        </>
      )}

      {aba === 'indices' && (
        <>
          <div className="ed-campos-barra"><button onClick={() => { const n: IndiceTabela = { id: novoId(), nome: '', unico: false, metodo: '', condicao: '', campos: [] }; set({ indices: [...p.indices, n] }); }}>+ Índice</button></div>
          <div className="ed-lista">
            {p.indices.map((ix, i) => {
              const ed = (patch: Partial<IndiceTabela>) => set({ indices: p.indices.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
              return (
                <div key={ix.id} className="ed-item">
                  <div className="ed-item-topo">
                    <input placeholder="nome (vazio = idx_<tabela>_<n>)" value={ix.nome} onChange={(e) => ed({ nome: e.target.value })} />
                    <label><input type="checkbox" checked={ix.unico} onChange={(e) => ed({ unico: e.target.checked })} /> UNIQUE</label>
                    <span className="situacao">{ix.campos.some((x) => !!x) ? 'Validado' : '* sem coluna'}</span>
                    <label>método <select value={ix.metodo} onChange={(e) => ed({ metodo: e.target.value })}>{METODOS.map((m) => <option key={m}>{m}</option>)}</select></label>
                    <button onClick={() => set({ indices: p.indices.filter((_, k) => k !== i) })}>Remover</button>
                  </div>
                  <Marcadores campos={p.campos} valor={ix.campos} onChange={(v) => ed({ campos: v })} />
                  <input className="largo" placeholder="condição parcial (WHERE ...)" value={ix.condicao} onChange={(e) => ed({ condicao: e.target.value })} />
                </div>
              );
            })}
            {!p.indices.length && <p className="vazio">Nenhum índice.</p>}
          </div>
        </>
      )}

      {aba === 'gatilhos' && (
        <>
          <div className="ed-campos-barra"><button onClick={() => { const n: GatilhoTabela = { id: novoId(), nome: '', momento: 'BEFORE', eventos: 'INSERT', porLinha: true, condicao: '', funcao: '' }; set({ gatilhos: [...p.gatilhos, n] }); }}>+ Gatilho</button></div>
          <div className="ed-lista">
            {p.gatilhos.map((g, i) => {
              const ed = (patch: Partial<GatilhoTabela>) => set({ gatilhos: p.gatilhos.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
              const evs = g.eventos.split(/\s+OR\s+/i).filter(Boolean);
              return (
                <div key={g.id} className="ed-item">
                  <div className="ed-item-topo">
                    <input placeholder="nome" value={g.nome} onChange={(e) => ed({ nome: e.target.value })} />
                    <select value={g.momento} onChange={(e) => ed({ momento: e.target.value })}>{MOMENTOS.map((m) => <option key={m}>{m}</option>)}</select>
                    {EVENTOS.map((ev) => (
                      <label key={ev}><input type="checkbox" checked={evs.includes(ev)} onChange={(e) => ed({ eventos: EVENTOS.filter((x) => (x === ev ? e.target.checked : evs.includes(x))).join(' OR ') })} /> {ev}</label>
                    ))}
                    <label><input type="checkbox" checked={g.porLinha} onChange={(e) => ed({ porLinha: e.target.checked })} /> por linha</label>
                    <span className="situacao">{g.eventos.trim() && g.funcao.trim() ? 'Validado' : '* falta evento ou função'}</span>
                    <button onClick={() => set({ gatilhos: p.gatilhos.filter((_, k) => k !== i) })}>Remover</button>
                  </div>
                  <input className="largo" placeholder="condição WHEN (opcional)" value={g.condicao} onChange={(e) => ed({ condicao: e.target.value })} />
                  <input className="largo" placeholder="Executa (ex.: minha_funcao())" value={g.funcao} onChange={(e) => ed({ funcao: e.target.value })} />
                </div>
              );
            })}
            {!p.gatilhos.length && <p className="vazio">Nenhum gatilho.</p>}
          </div>
        </>
      )}
    </Modal>
  );
}
