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

import { api } from '../api';
import { conduzirConversao } from './conversaoInterativa';
import { perguntarConversao } from '../dialogs/PerguntasConversao';
import { abrirDialogo, aviso } from '../ui/dialogos';
import { Comando, registrar } from './comandos';
import { FORMAS } from '../shapes/registry';
import { larguraTexto, reenquadrar } from './geometry';
import { Diagrama, diagramaVazio } from './types';
import { abaAtiva, abrirDiagrama } from './store';
import { temCampoSemTipo } from './logico';

/** Comandos que chamam o backend (geradores/conversores). O corpo é sempre o diagrama ativo inteiro. */
const logico = (): NonNullable<ReturnType<typeof abaAtiva>>['doc'] | null => {
  const a = abaAtiva();
  if (!a || a.doc.tipo !== 'logico') {
    aviso('Diagrama Lógico', 'Este comando só existe para o diagrama Lógico.');
    return null;
  }
  return a.doc;
};

const nomeArquivo = (nome: string, ext: string) => `${nome.replace(/[^\w.-]+/g, '_') || 'diagrama'}.${ext}`;

const cmd = (id: string, rotulo: string, executar: Comando['executar'], extra: Partial<Comando> = {}): Comando => ({
  id, rotulo, precisaAba: true, executar, ...extra,
});

const LINGUAGENS: Record<string, string> = { 'JPA (Java)': 'jpa', 'SQLAlchemy (Python)': 'sqlalchemy', 'Prisma (TypeScript)': 'prisma' };
const EXT: Record<string, string> = { jpa: 'java', sqlalchemy: 'py', prisma: 'prisma' };

registrar(
  cmd('logico.ddl', 'Converter para físico (DDL)', async () => {
    let d = logico();
    if (!d) return;
    //# Enquanto houver campo sem tipo, o Editor de Tipos reabre; cancelar aborta.
    while (temCampoSemTipo(d.formas)) {
      const ok = await new Promise<boolean>((resolve) => abrirDialogo({ tipo: 'd', nome: 'tipos', aoResolver: resolve }));
      if (!ok) return;
      d = logico();
      if (!d) return;
    }
    const { texto } = await api.gerar('ddl', d);
    abrirDialogo({ tipo: 'texto', titulo: 'Converter para físico', texto, nomeArquivo: nomeArquivo(d.nome, 'sql') });
  }, { icone: 'sql.png' }),

  cmd('logico.orm', 'Gerar código de ORM...', () => {
    const d = logico();
    if (!d) return;
    abrirDialogo({
      tipo: 'escolha', titulo: 'Gerar código de ORM', rotulo: 'Linguagem', opcoes: Object.keys(LINGUAGENS),
      aoEscolher: async (nome) => {
        const l = LINGUAGENS[nome];
        try {
          const { texto } = await api.gerar(`orm/${l}`, d);
          abrirDialogo({ tipo: 'texto', titulo: `Código de ORM - ${nome}`, texto, nomeArquivo: nomeArquivo(d.nome, EXT[l]) });
        } catch (e) { aviso('Gerar código de ORM', (e as Error).message); }
      },
    });
  }, { icone: 'sql.png' }),

  cmd('logico.doc', 'Gerar documentação HTML...', async () => {
    const d = logico();
    if (!d) return;
    const { texto } = await api.gerar('doc', d);
    abrirDialogo({ tipo: 'html', titulo: 'Documentação HTML', html: texto, nomeArquivo: nomeArquivo(d.nome, 'html') });
  }, { icone: 'sql.png' }),

  cmd('validar', 'Validar modelo', async () => {
    const a = abaAtiva();
    if (!a) return;
    if (a.doc.tipo === 'logico' || a.doc.tipo === 'conceitual') {
      const r = await api.gerar<{ texto: string }>('validar', a.doc);
      abrirDialogo({ tipo: 'texto', titulo: 'Validar modelo', texto: r.texto });
    } else {
      aviso('Validar modelo', 'A validação existe para os diagramas Conceitual e Lógico.');
    }
  }, { atalho: 'Ctrl+Shift+V', icone: 'check.png' }),

  cmd('exportar.dsl', 'Exportar como DSL de texto...', async () => {
    const d = logico();
    if (!d) return;
    const { texto } = await api.gerar('dsl/exportar', d);
    abrirDialogo({ tipo: 'texto', titulo: 'DSL de texto', texto, nomeArquivo: nomeArquivo(d.nome, 'dsl.txt') });
  }, { icone: 'sql.png' }),

  cmd('importar.ddl', 'Importar DDL...', () => {
    abrirDialogo({
      tipo: 'importarTexto', titulo: 'Importar DDL', linguagem: 'sql', dica: 'Cole o script SQL (CREATE TABLE, VIEW, SEQUENCE...) ou abra um arquivo .sql.',
      aoConfirmar: (ddl) => importarDdl(ddl),
    });
  }, { precisaAba: false, icone: 'sql.png' }),

  cmd('importar.dsl', 'Modelagem via DSL de texto...', () => {
    abrirDialogo({
      tipo: 'importarTexto', titulo: 'Modelagem via DSL de texto', dica: 'Descreva as tabelas na DSL; o modelo Lógico é gerado a partir dela.',
      aoConfirmar: async (dsl) => {
        try {
          const r = await api.gerar<{ ddl: string; erros: string[] }>('dsl/importar', { dsl });
          if (r.erros?.length) { aviso('Modelagem via DSL', r.erros.join('\n')); return; }
          await importarDdl(r.ddl);
        } catch (e) { aviso('Modelagem via DSL', (e as Error).message); }
      },
    });
  }, { precisaAba: false, icone: 'sql.png' }),

  cmd('conceitual.converter', 'Converter para lógico', () => converter('conceitual', 'logico'), { icone: 'sql.png' }),
  cmd('logico.converterConceitual', 'Converter para conceitual', () => converter('logico', 'conceitual'), { icone: 'sql.png' }),

  cmd('logico.dicionario', 'Gerar dicionário de dados', () => {
    if (!logico()) return;
    abrirDialogo({ tipo: 'dicionario' });
  }, { icone: 'editar.png' }),
);

//# O backend devolve só o essencial do modelo; o resto (fonte, zoom, página...) vem dos padrões do front.
const NOME_PADRAO: Record<string, string> = { conceitual: 'Conceitual', logico: 'Lógico' };
const completar = (d: Diagrama): Diagrama => {
  const nome = d.nome || NOME_PADRAO[d.tipo] || 'Importado';
  return { ...diagramaVazio(d.tipo, nome), ...d, nome };
};

async function converter(de: 'conceitual' | 'logico', para: 'conceitual' | 'logico') {
  const a = abaAtiva();
  if (!a || a.doc.tipo !== de) {
    aviso('Converter', `Este comando só existe para o diagrama ${de === 'logico' ? 'Lógico' : 'Conceitual'}.`);
    return;
  }
  try {
    //# Conceitual -> Lógico pergunta; "Cancelar" aborta a conversão.
    let r: { diagrama: Diagrama; avisos: string[]; erros: string[] } | null;
    if (para === 'logico') {
      r = await conduzirConversao((respostas) => api.converterInterativo(a.doc, respostas), perguntarConversao);
      if (!r) { aviso('Converter', 'Processo de conversão cancelado'); return; }
    } else {
      r = await api.gerar<{ diagrama: Diagrama; avisos: string[]; erros: string[] }>(`converter/${para}`, a.doc);
    }
    const msgs = [...r.erros.map((m) => `Erro: ${m}`), ...r.avisos];
    if (!r.diagrama?.formas?.length) { aviso('Converter', msgs.join('\n') || 'Nada para converter.'); return; }
    //# O nome vem do modelo de origem; se for um dos nomes padrão, a aba nova recebe o nome do tipo de destino.
    const padrao = Object.values(NOME_PADRAO).includes(r.diagrama.nome) || !r.diagrama.nome;
    const alvo = { ...r.diagrama, nome: padrao ? NOME_PADRAO[para] : r.diagrama.nome };
    abrirDiagrama(para === 'logico' ? ajustarTabelas(completar(alvo)) : completar(alvo));
    if (msgs.length) aviso('Converter', msgs.join('\n'));
  } catch (e) { aviso('Converter', (e as Error).message); }
}

type Importado = { diagrama: Diagrama; avisos: string[]; erros: string[] };

/** As tabelas vêm do backend com tamanho fixo; ajusta largura/altura ao conteúdo e reorganiza se passarem a se sobrepor. */
function ajustarTabelas(d: Diagrama): Diagrama {
  const formas = d.formas.map((f) => {
    if (FORMAS[f.kind]?.geo !== 'table') return f;
    const campos = ((f.props.campos as { nome: string; tipo: string }[]) ?? []);
    const w = Math.max(f.w, ...[f.texto, ...campos.map((c) => `${c.nome}: ${c.tipo}`)].map((t) => larguraTexto(t, d.fonte.tamanho) + 34));
    return reenquadrar({ ...f, w });
  });
  const tabelas = formas.filter((f) => FORMAS[f.kind]?.geo === 'table');
  const sobrepoe = tabelas.some((a, i) => tabelas.slice(i + 1).some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
  if (!sobrepoe) return { ...d, formas };
  const cols = Math.max(2, Math.ceil(Math.sqrt(formas.length)));
  const larg = Math.max(...formas.map((f) => f.w)) + d.espacoH;
  const ys: number[] = [];
  const pos = new Map<string, { x: number; y: number }>();
  formas.forEach((f, i) => {
    const c = i % cols;
    const y = ys[c] ?? 40;
    pos.set(f.id, { x: 40 + c * larg, y });
    ys[c] = y + f.h + d.espacoV;
  });
  return { ...d, formas: formas.map((f) => ({ ...f, ...pos.get(f.id)! })) };
}

async function importarDdl(ddl: string) {
  try {
    const [l, c] = await Promise.all([
      api.gerar<Importado>('importar/ddl', { ddl, nome: 'Lógico' }),
      api.gerar<Importado>('importar/ddl-conceitual', { ddl, nome: 'Conceitual' }),
    ]);
    const msgs = [...l.erros.map((m) => `Erro: ${m}`), ...l.avisos];
    if (!l.diagrama?.formas?.length) { aviso('Importar DDL', msgs.join('\n') || 'Nenhum objeto encontrado no script.'); return; }
    //# Abre o Conceitual primeiro para o Lógico ficar na aba ativa.
    if (c.diagrama?.formas?.length) abrirDiagrama(completar(c.diagrama));
    abrirDiagrama(ajustarTabelas(completar(l.diagrama)));
    if (msgs.length) aviso('Importar DDL', msgs.join('\n'));
  } catch (e) { aviso('Importar DDL', (e as Error).message); }
}
