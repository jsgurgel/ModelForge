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

/** Ajuda: busca com destaque, lista de links do tópico e o texto "Sobre". */

export interface Topico { id: number; titulo: string; html: string; filhos: Topico[]; imagem?: string; links?: number[] }

export const VERSAO_APP = '1.0.0';
export const DATA_APP = 'Data da última atualização: 28/09/2026';
export const DESENVOLVEDOR = 'Jairo dos Santos Gurgel';
export const EMAIL_DESENVOLVEDOR = 'jsgurgel@hotmail.com';
/** TODO: trocar pela URL do repositório no GitHub quando for publicado (único ponto de definição). */
export const URL_REPOSITORIO = 'https://github.com/jairogurgel/ModelForge';
export const AVISO_AUTORIA = 'ModelForge - Criado por Jairo dos Santos Gurgel - AGPL-3.0';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Texto do "Sobre": produto, versão, desenvolvedor e data. */
export function htmlSobre(): string {
  return `<center><h1>ModelForge ${esc(VERSAO_APP)}</h1>Modelagem de dados. Do conceito ao banco.<br/><br/>`
    + `Desenvolvedor: ${esc(DESENVOLVEDOR)}<br>E-mail: <a href="mailto:${EMAIL_DESENVOLVEDOR}">${EMAIL_DESENVOLVEDOR}</a><br>${esc(DATA_APP)}</center>`;
}

export function achatar(raiz: Topico): Topico[] {
  const out: Topico[] = [];
  const v = (t: Topico) => { out.push(t); t.filhos.forEach(v); };
  v(raiz);
  return out;
}

export const achar = (raiz: Topico, id: number): Topico | undefined => achatar(raiz).find((t) => t.id === id);

/** O tópico raiz "Ajuda" mostra o Sobre. */
export const htmlDoTopico = (t: Topico, raiz: Topico): string => (t.id === raiz.id ? htmlSobre() : t.html);

/** Links do tópico numerados ("1. Título"), ignorando ids que não existem. */
export function linksDoTopico(t: Topico, raiz: Topico): { n: number; id: number; titulo: string }[] {
  const out: { n: number; id: number; titulo: string }[] = [];
  for (const id of t.links ?? []) {
    const alvo = achar(raiz, id);
    if (alvo) out.push({ n: out.length + 1, id, titulo: alvo.titulo });
  }
  return out;
}

const semTags = (html: string) => html.replace(/<[^>]*>/g, ' ');
const normaliza = (s: string) => s.toLowerCase();

/** Tópicos cujo título ou texto (sem as tags) contém o termo. */
export function buscarTopicos(raiz: Topico, termo: string): Topico[] {
  const q = normaliza(termo.trim());
  if (!q) return [];
  return achatar(raiz).filter((t) => normaliza(t.titulo).includes(q) || normaliza(semTags(htmlDoTopico(t, raiz))).includes(q));
}

/** Envolve as ocorrências do termo em <mark>, só no texto (nunca dentro de tags/atributos). */
export function destacarHtml(html: string, termo: string): string {
  const q = termo.trim();
  if (!q) return html;
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return html.split(/(<[^>]*>)/g).map((p) => (p.startsWith('<') ? p : p.replace(re, (m) => `<mark>${m}</mark>`))).join('');
}
