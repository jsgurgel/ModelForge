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

import { useEffect, useRef, useState } from 'react';
import { COMANDOS, executarComando, habilitado } from '../editor/comandos';
import { atalhoDe } from '../editor/atalhos';
import { useRecentes } from '../editor/recentes';
import { reabrirRecente } from '../editor/abrirLocal';
import { abrirDiagrama, setMensagem } from '../editor/store';
import { api } from '../api';
import { abaAtiva, obterEstado, useEditor } from '../editor/store';
import { TIPOS } from '../editor/types';

type Item = string | '---' | { rotulo: string; itens: Item[] };

const COMANDOS_DIAGRAMA: Record<string, Item[]> = {
  conceitual: ['conceitual.converter', 'conceitual.editarAtributos', 'conceitual.organizarAtributos', '---', 'importar.ddl', 'importar.banco', 'importar.dsl', '---', 'validar', 'diagrama.organizar'],
  logico: [
    'diagrama.organizar', 'logico.editarCampos', 'logico.editarTipos', 'logico.add.campo', 'logico.add.key', 'logico.add.fkey', 'logico.add.keyfkey', 'logico.dicionario', 'logico.ddl', 'logico.converterConceitual', '---',
    'importar.ddl', 'importar.banco', 'validar', 'logico.migracao', 'banco.executarSql', '---', 'importar.dsl', 'exportar.dsl', 'logico.orm', 'logico.doc',
  ],
  nosql: ['importar.bancoNosql', 'nosql.script'],
  fluxo: ['diagrama.organizar'],
  atividade: ['diagrama.organizar', 'raia.capturar', 'raia.soltar'],
  eap: ['diagrama.organizar', 'eap.cli', 'eap.console'],
  livre: ['diagrama.organizar'],
};

/** Exportar: o diálogo com as opções e um item por formato (PNG, JPG, BMP, SVG, PDF). */
const EXPORTAR: Item = { rotulo: 'Exportar', itens: ['exportar.png', '---', 'exportar.pngDireto', 'exportar.jpg', 'exportar.bmp', 'exportar.svg', 'exportar.pdf'] };

const MENUS: { rotulo: string; itens: (tipo: string | null) => Item[] }[] = [
  {
    rotulo: 'Arquivo',
    itens: () => [
      { rotulo: 'Novo', itens: TIPOS.map((t) => `novo.${t}`) },
      'arquivo.abrir', 'arquivo.abrirPacote', 'arquivo.abrirServidor', '@recentes', 'arquivo.fechar', 'arquivo.fecharTodos', '---',
      'arquivo.salvar', 'arquivo.salvarComo', 'arquivo.salvarServidor', 'arquivo.salvarTodos', 'arquivo.salvarPacote', '---',
      'arquivo.imprimir', 'arquivo.previaImpressao', EXPORTAR,
    ],
  },
  {
    rotulo: 'Editar',
    itens: () => [
      'editar.desfazer', 'editar.refazer', '---', 'editar.copiar', 'editar.colar', 'editar.recortar', 'editar.apagar',
      'editar.copiarImagem', '---', 'editar.copiarFormato', 'editar.colarFormato', 'editar.realcar', 'editar.apagarParaSelecao', '---', 'editar.selecionarTudo', 'editar.selecionarTipo', 'editar.proximo', 'editar.anterior', '---',
      'editar.frente', 'editar.tras', 'editar.ajustarTexto', '---',
      { rotulo: 'Alinhamento e dimensões', itens: ['alinhar.esquerda', 'alinhar.topo', 'alinhar.direita', 'alinhar.base', 'alinhar.largura', 'alinhar.altura', 'alinhar.horizontal', 'alinhar.vertical'] },
      { rotulo: 'Micro-ajuste (setas)', itens: ['editar.microEsq', 'editar.microCima', 'editar.microBaixo', 'editar.microDir'] },
      '---', 'editar.tema',
    ],
  },
  { rotulo: 'Diagrama', itens: (t) => [{ rotulo: 'Comandos', itens: t ? COMANDOS_DIAGRAMA[t] : [] }, '---', 'arquivo.previaImpressao', EXPORTAR, '---', 'zoom.mais', 'zoom.menos', 'zoom.reset'] },
  { rotulo: 'Repositório', itens: () => ['repositorio.exibir', 'repositorio.adicionar', 'repositorio.salvar'] },
  { rotulo: 'Ferramentas', itens: () => ['ferramentas.miniMapa', 'ferramentas.busca', 'ferramentas.logs'] },
  { rotulo: 'Ajuda', itens: () => ['ajuda.ajuda', 'ajuda.sobre'] },
];

/** Submenu "Recentes": arquivos abertos/salvos recentemente (localStorage). */
function itensRecentes(recentes: ReturnType<typeof useRecentes>): Item {
  return { rotulo: 'Recentes', itens: recentes.length ? ['@recente-lista', '---', 'arquivo.limparRecentes'] : ['@recente-vazio'] };
}

function Lista({ itens, fechar, tipo }: { itens: Item[]; fechar: () => void; tipo: string | null }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const recentes = useRecentes();
  return (
    <div className="menu-lista" role="menu">
      {itens.map((it, i) => {
        if (it === '---') return <div key={i} className="menu-sep" />;
        if (it === '@recentes') it = itensRecentes(recentes);
        if (it === '@recente-vazio') return <div key={i} className="menu-item desabilitado"><span className="menu-icone" /><span className="menu-rotulo">(nenhum)</span></div>;
        if (it === '@recente-lista') {
          return (
            <div key={i}>
              {recentes.map((r) => (
                <div
                  key={`${r.id ?? ''}${r.nome}`} role="menuitem" className="menu-item"
                  title={r.id ? 'Reabrir do servidor' : 'Arquivo local: use Abrir para escolhê-lo de novo'}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    fechar();
                    void reabrirRecente(r);
                  }}
                >
                  <span className="menu-icone" /><span className="menu-rotulo">{r.nome}</span>
                </div>
              ))}
            </div>
          );
        }
        if (typeof it !== 'string') {
          return (
            <div key={it.rotulo} className="menu-item sub" onMouseEnter={() => setAberto(it.rotulo)} onMouseLeave={() => setAberto(null)}>
              <span className="menu-icone" />
              <span className="menu-rotulo">{it.rotulo}</span>
              <span className="menu-seta">▸</span>
              {aberto === it.rotulo && <Lista itens={it.itens} fechar={fechar} tipo={tipo} />}
            </div>
          );
        }
        const cmd = COMANDOS[it];
        if (!cmd) return null;
        const ok = habilitado(cmd);
        return (
          <div
            key={it} role="menuitem" aria-disabled={!ok}
            className={`menu-item${ok ? '' : ' desabilitado'}`}
            title={cmd.emBreve ? 'Recurso em desenvolvimento' : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { if (ok) { fechar(); executarComando(it); } }}
          >
            <span className="menu-icone">{cmd.icone && <img src={`/icons/${cmd.icone}`} alt="" width={16} height={16} />}</span>
            <span className="menu-rotulo">{cmd.rotulo}</span>
            {atalhoDe(it, tipo as never) && <span className="menu-atalho">{atalhoDe(it, tipo as never)}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function MenuBar() {
  useEditor();
  const [aberto, setAberto] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const tipo = abaAtiva(obterEstado())?.doc.tipo ?? null;

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(null); };
    window.addEventListener('mousedown', fora);
    return () => window.removeEventListener('mousedown', fora);
  }, []);

  return (
    <div className="menubar" ref={ref}>
      <img src="/icons/ModelForge.png" alt="" className="menubar-logo" width={18} height={18} />
      {MENUS.map((m, i) => (
        <div key={m.rotulo} className="menu">
          <button
            className={`menu-botao${aberto === i ? ' ativo' : ''}`}
            onClick={() => setAberto(aberto === i ? null : i)}
            onMouseEnter={() => aberto !== null && setAberto(i)}
          >
            {m.rotulo}
          </button>
          {aberto === i && <Lista itens={m.itens(tipo)} fechar={() => setAberto(null)} tipo={tipo} />}
        </div>
      ))}
      <div className="menubar-titulo">ModelForge</div>
    </div>
  );
}
