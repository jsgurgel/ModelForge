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

import { registrar } from './comandos';
import { abaAtiva } from './store';
import { abrirDialogo } from '../ui/dialogos';


registrar(
  {
    id: 'conceitual.editarAtributos', rotulo: 'Editar atributos', precisaAba: true,
    executar: () => {
      const a = abaAtiva();
      if (a) abrirDialogo({ tipo: 'atributos', id: a.selecao[0] });
    },
  },
  {
    id: 'logico.editarCampos', rotulo: 'Editar campos', precisaSelecao: true,
    executar: () => {
      const a = abaAtiva();
      const t = a?.doc.formas.find((f) => a.selecao.includes(f.id) && f.kind === 'tabela');
      if (t) abrirDialogo({ tipo: 'campos', id: t.id });
    },
  },
);
