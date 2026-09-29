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
import { ativar, selecionar, useEditor } from '../editor/store';
import { camposDaTabela } from '../editor/geometry';
import { ICONE_TIPO } from '../editor/types';
import { FORMAS } from '../shapes/registry';

/** Árvore de navegação: todos os diagramas abertos e, dentro de cada um, as formas (e os campos das tabelas). */
export function Navegacao() {
  const e = useEditor();
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  if (!e.abas.length) return <div className="arvore-vazia">Nenhum diagrama aberto</div>;
  const alternar = (id: string) => setAbertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="arvore" role="tree">
      {e.abas.map((aba, i) => {
        const chaveD = `d${i}`;
        const ativa = i === e.ativa;
        const aberto = ativa ? !abertos.has(`-${chaveD}`) : abertos.has(chaveD);
        const { doc, selecao } = aba;
        return (
          <div key={i}>
            <div className={`arvore-raiz${ativa ? ' sel' : ''}`} role="treeitem" aria-expanded={aberto} onClick={() => ativar(i)}>
              <span
                className="arvore-sinal"
                onClick={(ev) => { ev.stopPropagation(); alternar(ativa ? `-${chaveD}` : chaveD); }}
              >{aberto ? '▾' : '▸'}</span>
              <img src={`/icons/${ICONE_TIPO[doc.tipo]}`} alt="" width={14} height={14} />
              {doc.nome}{aba.alterado ? ' *' : ''}
            </div>
            {aberto && doc.formas.map((f) => {
              const campos = FORMAS[f.kind]?.geo === 'table' ? camposDaTabela(f) : [];
              const chave = `${i}:${f.id}`;
              return (
                <div key={f.id}>
                  <div
                    className={`arvore-item${ativa && selecao.includes(f.id) ? ' sel' : ''}`}
                    onClick={() => { if (!ativa) ativar(i); selecionar([f.id]); }}
                  >
                    <span className="arvore-sinal" onClick={(ev) => { ev.stopPropagation(); alternar(chave); }}>{campos.length ? (abertos.has(chave) ? '▾' : '▸') : ''}</span>
                    <img src={`/icons/${FORMAS[f.kind]?.icone ?? 'ModelForge.png'}`} alt="" width={14} height={14} />
                    {f.texto.split('\n')[0] || FORMAS[f.kind]?.rotulo || f.kind}
                  </div>
                  {abertos.has(chave) && campos.map((c) => (
                    <div key={c.id} className="arvore-item filho" onClick={() => { if (!ativa) ativar(i); selecionar([f.id]); }}>
                      <img src={`/icons/${c.pk ? 'CampoK.png' : c.fk ? 'CampoFK.png' : 'Campo.png'}`} alt="" width={14} height={14} />{c.nome}: {c.tipo}
                    </div>
                  ))}
                </div>
              );
            })}
            {aberto && !doc.formas.length && <div className="arvore-vazia">Diagrama vazio</div>}
          </div>
        );
      })}
    </div>
  );
}
