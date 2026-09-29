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

import { bancoApi } from '../api';
import { abrirDialogo, aviso } from '../ui/dialogos';
import { FORMAS } from '../shapes/registry';
import { registrar } from './comandos';
import { larguraTexto, reenquadrar } from './geometry';
import { abaAtiva, abrirDiagrama } from './store';
import { Diagrama, diagramaVazio, Forma } from './types';

//# Importar do banco (SQL), do banco NoSQL, migração, script mongosh e executar SQL. As telas ficam em dialogs/Banco*.tsx.

const NOME_PADRAO: Record<string, string> = { conceitual: 'Conceitual', logico: 'Lógico' };
const completar = (d: Diagrama): Diagrama => {
  const nome = d.nome || NOME_PADRAO[d.tipo] || 'Importado';
  return { ...diagramaVazio(d.tipo, nome), ...d, nome };
};

/** As tabelas vêm do backend com tamanho fixo: ajusta a largura ao conteúdo. */
function ajustarTabelas(d: Diagrama): Diagrama {
  return {
    ...d,
    formas: d.formas.map((f) => {
      if (FORMAS[f.kind]?.geo !== 'table') return f;
      const campos = (f.props.campos as { nome: string; tipo: string }[]) ?? [];
      const w = Math.max(f.w, ...[f.texto, ...campos.map((c) => `${c.nome}: ${c.tipo}`)].map((t) => larguraTexto(t, d.fonte.tamanho) + 34));
      return reenquadrar({ ...f, w });
    }),
  };
}

type Importado = { diagrama: Diagrama; avisos: string[]; erros: string[] };

/** Abre o(s) diagrama(s) devolvido(s) por POST /bancos/importar (Conceitual primeiro, para o Lógico ficar ativo). */
export function abrirImportadoBanco(r: { logico?: Importado; conceitual?: Importado; avisosCatalogo?: string[] }, titulo: string) {
  const msgs = [
    ...(r.logico?.erros ?? []).map((m) => `Erro: ${m}`), ...(r.logico?.avisos ?? []),
    ...(r.conceitual && !r.logico ? [...r.conceitual.erros.map((m) => `Erro: ${m}`), ...r.conceitual.avisos] : []),
    ...(r.avisosCatalogo ?? []).map((m) => `Aviso do banco: ${m}`),
  ];
  const vazio = (i?: Importado) => !i?.diagrama?.formas?.length;
  if (vazio(r.logico) && vazio(r.conceitual)) { aviso(titulo, msgs.join('\n') || 'Nenhum objeto encontrado no banco.'); return; }
  if (!vazio(r.conceitual)) abrirDiagrama(completar(r.conceitual!.diagrama));
  if (!vazio(r.logico)) abrirDiagrama(ajustarTabelas(completar(r.logico!.diagrama)));
  if (msgs.length) aviso(titulo, msgs.join('\n'));
}

/** Sempre um diagrama NoSQL novo, com uma coleção por coleção do banco. */
export function abrirNoSqlImportado(formas: Forma[], database: string) {
  abrirDiagrama({ ...diagramaVazio('nosql', database || 'NoSQL'), formas });
}

registrar(
  { id: 'importar.banco', rotulo: 'Importar do banco conectado', executar: () => abrirDialogo({ tipo: 'bancoImportar' }) },
  { id: 'importar.bancoNosql', rotulo: 'Importar do banco NoSQL conectado', executar: () => abrirDialogo({ tipo: 'bancoNosql' }) },
  {
    id: 'logico.migracao', rotulo: 'Gerar script de migração...', precisaAba: true,
    executar: () => {
      const a = abaAtiva();
      if (!a || a.doc.tipo !== 'logico') { aviso('Script de migração', 'Este comando só existe para o diagrama Lógico.'); return; }
      abrirDialogo({ tipo: 'bancoMigracao' });
    },
  },
  {
    id: 'nosql.script', rotulo: 'Gerar script de criação...', precisaAba: true,
    executar: async () => {
      const a = abaAtiva();
      if (!a || a.doc.tipo !== 'nosql') { aviso('Script de criação', 'Este comando só existe para o diagrama NoSQL.'); return; }
      try {
        const { texto } = await bancoApi.nosqlScript(a.doc);
        abrirDialogo({ tipo: 'texto', titulo: 'Script de criação (MongoDB)', texto, nomeArquivo: `${a.doc.nome.replace(/[^\w.-]+/g, '_') || 'nosql'}.mongosh.js` });
      } catch (e) { aviso('Script de criação', (e as Error).message); }
    },
  },
  { id: 'banco.executarSql', rotulo: 'Executar SQL no banco...', executar: () => abrirDialogo({ tipo: 'bancoExecutar' }) },
  { id: 'banco.sqlStudio', rotulo: 'SQL Studio...', executar: () => abrirDialogo({ tipo: 'sqlStudio' }) },
);

