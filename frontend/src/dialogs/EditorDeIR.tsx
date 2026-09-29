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
import { constraintVazia, propsTabela, sincronizarFlags, validarConstraint, TEXTO_VALIDADE } from '../editor/logico';
import { atualizarProps } from '../editor/ops';
import { abaAtiva, mutar } from '../editor/store';
import { ConstraintTabela, Forma, Ligacao, TipoConstraint, novoId } from '../editor/types';
import { Modal } from './Modal';

const ACOES = ['', 'CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT', 'NO ACTION'];
const TITULO: Record<TipoConstraint, string> = {
  PK: 'IR chave primária', UNIQUE: 'IR único (UNIQUE)', FK: 'IR chave estrangeira', CHECK: 'IR verificação (CHECK)',
};

/**
 * Editores de integridade referencial (EditorDeIR / EditorDeIrUnique / EditorDeIrFK): uma IR por vez, com os campos
 * da tabela (PK e UNIQUE), o mapeamento campo a campo com a IR de origem (FK) ou a expressão (CHECK).
 * `indice` edita uma constraint existente; sem ele cria (ou, para a PK, edita a única PK da tabela).
 */
export function EditorDeIR({ id, modo, indice, onFechar }: { id: string; modo: TipoConstraint; indice?: number; onFechar: () => void }) {
  const doc = abaAtiva()!.doc;
  const tabela = doc.formas.find((f) => f.id === id);
  const [t] = useState<Forma | undefined>(tabela);
  const p = t ? propsTabela(t) : undefined;
  const idxInicial = indice ?? (modo === 'PK' ? p?.constraints.findIndex((c) => c.tipo === 'PK') ?? -1 : -1);
  const [c, setC] = useState<ConstraintTabela>(() => (p && idxInicial >= 0 ? structuredClone(p.constraints[idxInicial]) : constraintVazia(modo)));
  const [erro, setErro] = useState('');
  if (!t || !p) return null;

  const campos = p.campos.filter((k) => !k.separador);
  const tabelasFK = doc.formas.filter((f) => f.kind === 'tabela');
  const origemTab = c.constraintOrigem ? doc.formas.find((f) => f.id === c.constraintOrigem!.tabelaId) : undefined;
  const chavesOrigem = origemTab ? propsTabela(origemTab).constraints.map((k, i) => ({ k, i })).filter((x) => x.k.tipo === 'PK' || x.k.tipo === 'UNIQUE') : [];
  const cOrigem = origemTab && c.constraintOrigem ? propsTabela(origemTab).constraints[c.constraintOrigem.indice] : undefined;
  const nomeCampo = (tab: Forma | undefined, cid: string | null) => propsTabela(tab ?? t).campos.find((k) => k.id === cid)?.nome ?? '?';

  const marcar = (cid: string, on: boolean) => {
    const atuais = c.camposOrigem.filter((x): x is string => !!x);
    const novos = on ? [...atuais, cid] : atuais.filter((x) => x !== cid);
    setC({ ...c, camposOrigem: novos, camposDestino: novos.map(() => null) });
  };
  const escolherTabela = (tid: string) => {
    if (!tid) { setC({ ...c, constraintOrigem: null, camposOrigem: [], camposDestino: [] }); return; }
    const tab = doc.formas.find((f) => f.id === tid)!;
    const ks = propsTabela(tab).constraints.map((k, i) => ({ k, i })).filter((x) => x.k.tipo === 'PK' || x.k.tipo === 'UNIQUE');
    if (!ks.length) { setC({ ...c, constraintOrigem: { tabelaId: tid, indice: -1 }, camposOrigem: [], camposDestino: [] }); return; }
    escolherChave(tid, ks[0].i);
  };
  const escolherChave = (tid: string, i: number) => {
    const tab = doc.formas.find((f) => f.id === tid)!;
    const k = propsTabela(tab).constraints[i];
    const refs = k.camposOrigem.filter((x): x is string => !!x);
    setC({ ...c, constraintOrigem: { tabelaId: tid, indice: i }, camposOrigem: refs, camposDestino: refs.map((_, n) => c.camposDestino[n] ?? null) });
  };
  const setDestino = (n: number, cid: string) => setC({ ...c, camposDestino: c.camposDestino.map((x, k) => (k === n ? cid || null : x)) });

  const situacao = validarConstraint(t, c, doc);

  const salvar = () => {
    if (c.tipo === 'CHECK' && !c.expressao.trim()) { setErro('Informe a expressão do CHECK.'); return; }
    if ((c.tipo === 'PK' || c.tipo === 'UNIQUE') && !c.camposOrigem.filter(Boolean).length) { setErro('Marque ao menos um campo.'); return; }
    if (c.tipo === 'FK') {
      if (!c.constraintOrigem || c.constraintOrigem.indice < 0) { setErro('Escolha a tabela e a IR (PK ou UNIQUE) de origem.'); return; }
      if (c.camposDestino.some((x) => !x)) { setErro('Relacione todos os campos de origem a um campo desta tabela.'); return; }
    }
    if (c.tipo === 'PK' && p.constraints.some((k, i) => k.tipo === 'PK' && i !== idxInicial)) { setErro('A tabela já tem uma chave primária.'); return; }
    setErro('');
    mutar((d) => {
      const alvo = d.formas.find((f) => f.id === id)!;
      const atuais = propsTabela(alvo).constraints;
      const cs = idxInicial >= 0 ? atuais.map((k, i) => (i === idxInicial ? c : k)) : [...atuais, c];
      let novo = atualizarProps(d, id, sincronizarFlags({ ...alvo, props: { ...alvo.props, constraints: cs } }).props);
      //# FK entre tabelas distintas sem linha lógica: cria a ligação (origem -> esta tabela) ao completar a IR.
      if (c.tipo === 'FK' && c.constraintOrigem && c.constraintOrigem.tabelaId !== id
        && !novo.ligacoes.some((l) => l.kind === 'logicoLinha' && ((l.de === id && l.para === c.constraintOrigem!.tabelaId) || (l.para === id && l.de === c.constraintOrigem!.tabelaId)))) {
        const l: Ligacao = { id: novoId(), kind: 'logicoLinha', de: c.constraintOrigem.tabelaId, para: id, texto: '', cardDe: '(0,1)', cardPara: '(0,n)', props: {} };
        novo = { ...novo, ligacoes: [...novo.ligacoes, l] };
      }
      return novo;
    });
    onFechar();
  };
  const remover = () => {
    if (idxInicial < 0) { onFechar(); return; }
    mutar((d) => {
      const alvo = d.formas.find((f) => f.id === id)!;
      const cs = propsTabela(alvo).constraints.filter((_, i) => i !== idxInicial);
      return atualizarProps(d, id, sincronizarFlags({ ...alvo, props: { ...alvo.props, constraints: cs } }).props);
    });
    onFechar();
  };

  return (
    <Modal
      titulo={`${TITULO[c.tipo]} - ${t.texto}`} onFechar={onFechar} largura={720}
      rodape={<><button onClick={salvar}>OK</button>{idxInicial >= 0 && <button onClick={remover}>Excluir IR</button>}<button onClick={onFechar}>Cancelar</button></>}
    >
      <div className="dd-grade">
        <label>Nomear</label>
        <span>
          <input type="checkbox" checked={c.nomeada} onChange={(e) => setC({ ...c, nomeada: e.target.checked })} />{' '}
          <input type="text" value={c.nome} disabled={!c.nomeada} placeholder="nome da IR" style={{ width: '70%' }} onChange={(e) => setC({ ...c, nome: e.target.value })} />
        </span>

        {(c.tipo === 'PK' || c.tipo === 'UNIQUE') && (
          <>
            <label>Campos</label>
            <span className="marcadores">
              {campos.map((k) => (
                <label key={k.id} style={{ marginRight: 12 }}>
                  <input type="checkbox" checked={c.camposOrigem.includes(k.id)} onChange={(e) => marcar(k.id, e.target.checked)} /> {k.nome}
                </label>
              ))}
              {!campos.length && <em>A tabela não tem campos.</em>}
            </span>
          </>
        )}

        {c.tipo === 'FK' && (
          <>
            <label>Tabela origem</label>
            <select value={c.constraintOrigem?.tabelaId ?? ''} onChange={(e) => escolherTabela(e.target.value)}>
              <option value="">(selecione)</option>
              {tabelasFK.map((f) => <option key={f.id} value={f.id}>{f.texto}</option>)}
            </select>
            <label>IR Origem</label>
            <select value={c.constraintOrigem && c.constraintOrigem.indice >= 0 ? c.constraintOrigem.indice : ''} disabled={!origemTab} onChange={(e) => origemTab && escolherChave(origemTab.id, Number(e.target.value))}>
              <option value="" disabled>(selecione)</option>
              {chavesOrigem.map(({ k, i }) => <option key={i} value={i}>{k.tipo} ({k.camposOrigem.map((x) => nomeCampo(origemTab, x)).join(', ')})</option>)}
            </select>
            <label>Campos</label>
            <table className="dd-tabela">
              <thead><tr><th>Campo de origem</th><th>Campo desta tabela</th></tr></thead>
              <tbody>
                {c.camposOrigem.map((ref, n) => (
                  <tr key={n}>
                    <td>{nomeCampo(origemTab, ref)}</td>
                    <td>
                      <select value={c.camposDestino[n] ?? ''} onChange={(e) => setDestino(n, e.target.value)}>
                        <option value="">(selecione)</option>
                        {campos.map((k) => <option key={k.id} value={k.id}>{k.nome}: {k.tipo}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
                {!c.camposOrigem.length && <tr><td colSpan={2}><em>{cOrigem ? 'A IR de origem não tem campos.' : 'Escolha a tabela e a IR de origem.'}</em></td></tr>}
              </tbody>
            </table>
            <label>On Update</label>
            <input list="acoes-fk-ir" value={c.onUpdate} onChange={(e) => setC({ ...c, onUpdate: e.target.value })} />
            <label>On Delete</label>
            <input list="acoes-fk-ir" value={c.onDelete} onChange={(e) => setC({ ...c, onDelete: e.target.value })} />
            <datalist id="acoes-fk-ir">{ACOES.filter(Boolean).map((a) => <option key={a} value={a} />)}</datalist>
          </>
        )}

        {c.tipo === 'CHECK' && (
          <>
            <label>Expressão</label>
            <EditorCodigo rows={3} valor={c.expressao} placeholder="idade >= 0" linguagem="sql" aoMudar={(v) => setC({ ...c, expressao: v })} />
          </>
        )}

        <label>Dicionário</label>
        <textarea rows={2} value={c.dicionario ?? ''} onChange={(e) => setC({ ...c, dicionario: e.target.value })} />
        <label>Observação</label>
        <textarea rows={2} value={c.observacao ?? ''} onChange={(e) => setC({ ...c, observacao: e.target.value })} />

        <label>Situação</label>
        <span style={{ color: situacao === 'ok' ? undefined : '#d9480f' }}>{TEXTO_VALIDADE[situacao]}</span>
      </div>
      {erro && <p className="dd-erro">{erro}</p>}
    </Modal>
  );
}
