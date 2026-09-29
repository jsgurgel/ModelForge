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

import { useEffect, useState } from 'react';
import './motor.css';
import { VERSAO_APP } from '../editor/ajudaBusca';

const CHAVE = 'modelforge:splash-visto';

/** Tela de abertura: aparece uma vez por sessão do navegador e some sozinha ou ao clicar. */
export function Splash() {
  const [visivel, setVisivel] = useState(() => {
    try {
      return sessionStorage.getItem(CHAVE) !== '1';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!visivel) return;
    try { sessionStorage.setItem(CHAVE, '1'); } catch { /* sem armazenamento: aparece de novo na próxima carga */ }
    const t = setTimeout(() => setVisivel(false), 1600);
    return () => clearTimeout(t);
  }, [visivel]);

  if (!visivel) return null;
  return (
    <div className="splash" role="dialog" aria-label="ModelForge" onClick={() => setVisivel(false)}>
      <div className="splash-cartao">
        <img className="splash-banner" src="/icons/modelforge-banner.png" alt="ModelForge" width={480} height={320} />
        <p>Versão {VERSAO_APP} · ferramenta de modelagem de banco de dados</p>
        <p>Carregando...</p>
      </div>
    </div>
  );
}
