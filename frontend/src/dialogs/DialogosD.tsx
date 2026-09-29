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

import { fecharDialogo, Dialogo } from '../ui/dialogos';
import './dialogosD.css';
import { ConstrutorEap } from './ConstrutorEap';
import { DesenhadorEditor } from './DesenhadorEditor';
import { DrawerItensEditor } from './DrawerItensEditor';
import { EditorDeIR } from './EditorDeIR';
import { EditorDeTipos } from './EditorDeTipos';
import { ExportarImagem } from './ExportarImagem';
import { LegendaEditor } from './LegendaEditor';
import { PreviaImpressao } from './PreviaImpressao';

/** Despacha os diálogos do stream D (ver `Dialogo` com tipo 'd'). */
export function DialogosD({ d }: { d: Extract<Dialogo, { tipo: 'd' }> }) {
  switch (d.nome) {
    case 'legenda': return d.id ? <LegendaEditor id={d.id} onFechar={fecharDialogo} /> : null;
    case 'drawer': return d.id ? <DrawerItensEditor id={d.id} onFechar={fecharDialogo} /> : null;
    case 'desenhador': return d.id ? <DesenhadorEditor id={d.id} onFechar={fecharDialogo} /> : null;
    case 'tipos': return <EditorDeTipos onFechar={fecharDialogo} aoResolver={d.aoResolver} />;
    case 'ir': return d.id ? <EditorDeIR key={`${d.id}-${d.modo}-${d.indice}`} id={d.id} modo={d.modo ?? 'PK'} indice={d.indice} onFechar={fecharDialogo} /> : null;
    case 'eap': return <ConstrutorEap onFechar={fecharDialogo} />;
    case 'imagem': return <ExportarImagem onFechar={fecharDialogo} />;
    case 'previa': return <PreviaImpressao onFechar={fecharDialogo} />;
  }
}
