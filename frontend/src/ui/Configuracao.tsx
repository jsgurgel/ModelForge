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

import { COMANDOS, executarComando } from '../editor/comandos';
import { CONFIG_PADRAO, definirConfig, useConfig } from '../editor/config';
import { abrirDiagrama, setMensagem, useEditor } from '../editor/store';
import { limparRecentes, useRecentes } from '../editor/recentes';
import { PropertyGrid } from './PropertyGrid';
import { gruposConfiguracao } from './gruposConfiguracao';
import { api } from '../api';
import './motor.css';

/** Painel de configuração do ambiente, persistido no navegador. */
export function Configuracao() {
  const e = useEditor();
  const c = useConfig();
  const recentes = useRecentes();

  const reabrir = (id?: string, nome?: string) => {
    if (!id) {
      setMensagem(`"${nome}" foi aberto de um arquivo local: use Arquivo → Abrir para escolhê-lo novamente`);
      return;
    }
    api.obter(id).then((d) => abrirDiagrama(d)).catch((err) => setMensagem(`Não foi possível abrir "${nome}": ${err instanceof Error ? err.message : err}`));
  };

  const cfgGrupos = gruposConfiguracao(c, {
    tema: e.tema === 'escuro', alternarTema: () => executarComando('editar.tema'),
    miniMapa: e.miniMapa, alternarMiniMapa: () => executarComando('ferramentas.miniMapa'),
  });

  return (
    <div className="config-painel">
      <PropertyGrid grupos={cfgGrupos} />
      <fieldset>
        <legend>Arquivos recentes</legend>
        {!recentes.length && <span className="arvore-vazia">Nenhum arquivo recente</span>}
        {recentes.map((r) => (
          <button key={`${r.id ?? ''}${r.nome}`} className="recente" title={r.id ? 'Reabrir do servidor' : 'Arquivo local'} onClick={() => reabrir(r.id, r.nome)}>
            {r.nome}
          </button>
        ))}
        <button disabled={!recentes.length} onClick={() => limparRecentes()}>{COMANDOS['arquivo.limparRecentes']?.rotulo ?? 'Limpar recentes'}</button>
      </fieldset>
      <button onClick={() => definirConfig({ ...CONFIG_PADRAO, larguraSidebar: c.larguraSidebar })}>Restaurar padrões</button>
    </div>
  );
}
