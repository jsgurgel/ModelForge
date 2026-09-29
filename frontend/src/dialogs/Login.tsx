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
import { api, gravarToken, lerToken, registrarPedidoDeToken } from '../api';
import { abrirDialogo, fecharDialogo } from '../ui/dialogos';
import { Modal } from './Modal';

/** Pede o token de acesso (API_TOKEN do servidor); resolve true quando informado, false se cancelado. */
export function pedirTokenDeAcesso(): Promise<boolean> {
  return new Promise((resolver) => {
    abrirDialogo({ tipo: 'h', nome: 'login', dados: { resolver } });
  });
}

registrarPedidoDeToken(pedirTokenDeAcesso);

export function LoginDialogo({ resolver }: { resolver: (ok: boolean) => void }) {
  const [token, setToken] = useState('');
  const fim = (ok: boolean) => { fecharDialogo(); resolver(ok); };
  const entrar = () => {
    if (!token.trim()) return;
    gravarToken(token.trim());
    fim(true);
  };
  return (
    <Modal titulo="Acesso ao servidor" largura={440} onFechar={() => fim(false)} rodape={<><button onClick={entrar}>Entrar</button><button onClick={() => fim(false)}>Cancelar</button></>}>
      <p>Este servidor exige um token de acesso. O token fica guardado só nesta sessão do navegador.</p>
      <label>Token de acesso<br />
        <input type="password" autoFocus style={{ width: '100%' }} value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && entrar()} />
      </label>
    </Modal>
  );
}

//# Pede o token já na abertura quando o servidor avisa que exige autenticação e a sessão ainda não tem um.
export async function verificarAcesso(): Promise<void> {
  const s = await api.saude();
  if (s.autenticacao) {
    if (!lerToken()) await pedirTokenDeAcesso();
  }
}
