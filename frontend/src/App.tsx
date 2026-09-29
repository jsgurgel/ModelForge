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

import { useEffect } from 'react';
import { Dialogos } from './dialogs/Dialogos';
import { COMANDOS, executarComando } from './editor/comandos';
import './editor/pendentes';
import './editor/comandosDiagrama';
import './editor/comandosD';
import './editor/comandosBackend';
import './editor/comandosH';
import './editor/arrastar';
import './editor/comandosBanco';
import './editor/comandosG2';
import { haAlteracoes } from './editor/fechar';
import { instalarAtalhos } from './editor/atalhos';
import { abrirDiagrama, abaAtiva, descartarAutosave, lerAutosave, novoDiagrama, useEditor } from './editor/store';
import { abrirDialogo } from './ui/dialogos';
import { AcoesInspector } from './ui/Inspector';
import { Abas } from './ui/Abas';
import { AreaDiagrama } from './ui/AreaDiagrama';
import { MenuBar } from './ui/MenuBar';
import { Paleta } from './ui/Paleta';
import { Sidebar } from './ui/Sidebar';
import { StatusBar } from './ui/StatusBar';
import { Splash } from './ui/Splash';
import { obterConfig } from './editor/config';
import { Toolbars } from './ui/Toolbars';
import { escolherArquivo } from './editor/arquivo';
import { mutar } from './editor/store';
import { atualizarProps } from './editor/ops';

const acoes: AcoesInspector = {
  editarCampos: (id, aba) => abrirDialogo({ tipo: 'campos', id, aba }),
  editarDsl: (id) => abrirDialogo({ tipo: 'dsl', id }),
  comando: (nome) => executarComando(nome),
  escolherImagem: async (id) => {
    const f = await escolherArquivo('image/*');
    if (!f) return;
    const src = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(f); });
    mutar((d) => atualizarProps(d, id, { src }));
  },
};

export default function App() {
  const e = useEditor();

  useEffect(() => {
    void COMANDOS;
    const remover = instalarAtalhos();
    const anteriores = lerAutosave();
    if (anteriores.length) {
      abrirDialogo({
        tipo: 'confirmar', titulo: 'Recuperar', mensagem: `Há ${anteriores.length} diagrama(s) com alterações não salvas da sessão anterior. Recuperar?`,
        aoConfirmar: () => { anteriores.forEach(abrirDiagrama); descartarAutosave(); },
      });
    }
    if (!abaAtiva()) novoDiagrama(obterConfig().tipoPadrao);
    const aviso = (ev: BeforeUnloadEvent) => { if (haAlteracoes()) { ev.preventDefault(); ev.returnValue = ''; } };
    window.addEventListener('beforeunload', aviso);
    return () => { remover(); window.removeEventListener('beforeunload', aviso); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app" data-tema={e.tema}>
      <MenuBar />
      <Toolbars />
      <div className="corpo">
        <Sidebar acoes={acoes} />
        <div className="conteudo">
          <Abas />
          <AreaDiagrama />
        </div>
        <Paleta />
      </div>
      <StatusBar />
      <Dialogos />
      <Splash />
    </div>
  );
}
