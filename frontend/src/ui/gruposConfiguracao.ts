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

import { Config, definirConfig } from '../editor/config';
import { NOME_TIPO, TIPOS, TipoDiagrama } from '../editor/types';
import { Grupo, Prop } from './PropertyGrid';
import { aplicarCondicoes, seVerdadeiro } from './condicoes';
import { bool, comDica, comId, num, sel } from './propHelpers';

/**
 * Painel de Configuração: grupos "Configurações", "Desenho", "Exibição" e "Edição",
 * com os mesmos rótulos, dicas e condição (a largura da grade só vale com a grade ligada).
 */
export function gruposConfiguracao(c: Config, extra: { tema: boolean; alternarTema: () => void; miniMapa: boolean; alternarMiniMapa: () => void }): Grupo[] {
  const tipos = TIPOS.map((t) => NOME_TIPO[t]);
  const geral: Prop[] = [
    comDica(bool('Mostrar dimensões', c.dimensoesAoMover, (v) => definirConfig({ dimensoesAoMover: v })), 'cfg.mostrardimensoesaomover'),
    comDica(sel('Diagrama default', NOME_TIPO[c.tipoPadrao], tipos, (v) => definirConfig({ tipoPadrao: TIPOS[Math.max(0, tipos.indexOf(v))] as TipoDiagrama })), 'cfg.tipodefault'),
  ];
  const desenho = aplicarCondicoes([
    comDica(bool('Propague apagar', c.propagarExclusao, (v) => definirConfig({ propagarExclusao: v })), 'cfg.propaguedeletetolines'),
    comDica(comId(bool('Mostrar grade', c.mostrarGrade, (v) => definirConfig({ mostrarGrade: v })), 'grade'), 'cfg.mostrargrade'),
    comDica(comId(num('Largura da grade', c.larguraGrade, (v) => definirConfig({ larguraGrade: v }), 5, 200), 'larguraGrade'), 'cfg.gradelargura'),
    comDica(bool('Encaixar na grade ao mover', c.encaixarNaGrade, (v) => definirConfig({ encaixarNaGrade: v })), 'cfg.mostrargrade'),
    { ...num('Intervalo', c.intervaloAutosave, (v) => definirConfig({ intervaloAutosave: v }), 0, 29), dica: 'Salvar automaticamente os diagramas alterados no navegador. Tempo em minutos (0 a 29); zero desativa.' },
  ], [seVerdadeiro('grade', ['larguraGrade'])]);
  const exibicao: Prop[] = [
    comDica(bool('Mostrar ancorador', c.ancorador, (v) => definirConfig({ ancorador: v })), 'cfg.ancorador'),
    comDica(bool("Mostrar ID's", c.mostrarIds, (v) => definirConfig({ mostrarIds: v })), 'cfg.mostrarids'),
    comDica(bool('Mostrar dicas', c.dicas, (v) => definirConfig({ dicas: v })), 'cfg.mostrartooltips'),
    bool('Tema escuro', extra.tema, extra.alternarTema),
    bool('Mostrar MiniMapa', extra.miniMapa, extra.alternarMiniMapa),
  ];
  const edicao: Prop[] = [
    comDica(bool('Reescrever ao digitar', c.reescreverAoDigitar, (v) => definirConfig({ reescreverAoDigitar: v })), 'cfg.apagartextoaoeditar'),
  ];
  return [
    { titulo: 'Configurações', props: geral },
    { titulo: 'Desenho', props: desenho },
    { titulo: 'Exibição', props: exibicao },
    { titulo: 'Edição', props: edicao },
  ];
}
