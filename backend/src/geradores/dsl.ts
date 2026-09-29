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

import { CampoTabela, Diagrama, Forma, PropsTabela } from '../modelo/tipos';
import { nomeFormatadoDiagrama } from './orm';

/**
 * DSL de texto: exportador e importador para DDL.
 */

// ---------------------------------------------------------------- Diagrama -> DSL
type CampoR = CampoTabela & { tabela: Forma };

export function diagramaParaDsl(d: Diagrama): string {
  const tabelas = d.formas.filter((f) => f.kind === 'tabela');
  const campo = new Map<string, CampoR>();
  for (const t of tabelas) for (const c of (t.props as PropsTabela).campos ?? []) campo.set(c.id, { ...c, tabela: t });
  const res = (ids: (string | null)[] | undefined) => (ids ?? []).map((i) => (i == null ? null : campo.get(i) ?? null));

  let sb = `// DSL gerada a partir de "${nomeFormatadoDiagrama(d)}" - reimportável via Modelagem via DSL de Texto.\n\n`;
  for (const t of tabelas) {
    const p = t.props as PropsTabela;
    sb += `tabela ${t.texto} {\n`;
    const pkC = (p.constraints ?? []).find((c) => c.tipo === 'PK');
    const pk = pkC ? res(pkC.camposOrigem) : [];
    const pkSimples = pk.length === 1;
    const uniques = (p.constraints ?? []).filter((c) => c.tipo === 'UNIQUE').map((c) => res(c.camposOrigem)).filter((cols) => cols.length > 1);
    for (const c of p.campos ?? []) {
      sb += `    ${c.nome}`;
      if (c.tipo !== '') sb += ` ${c.tipo}`;
      if (pkSimples && pk[0]?.id === c.id) sb += ' pk';
      if ((c.complemento ?? '').toUpperCase().includes('NOT NULL')) sb += ' not null';
      if (c.unique && !uniques.some((cols) => cols.some((x) => x?.id === c.id))) sb += ' unique';
      let destino: CampoR | null = null;
      if (c.fk) {
        for (const fk of p.constraints ?? []) {
          if (fk.tipo !== 'FK') continue;
          const idx = (fk.camposDestino ?? []).indexOf(c.id);
          const origem = fk.camposOrigem ?? [];
          if (idx > -1 && idx < origem.length) {
            const id = origem[idx];
            destino = id == null ? null : campo.get(id) ?? null;
            break;
          }
        }
      }
      if (destino) sb += ` -> ${destino.tabela.texto}.${destino.nome}`;
      sb += '\n';
    }
    if (!pkSimples && pk.length > 0) sb += `    chave (${pk.map((c) => c!.nome).join(', ')})\n`;
    for (const un of uniques) sb += `    unico (${un.map((c) => c!.nome).join(', ')})\n`;
    sb += '}\n\n';
  }
  return sb;
}

// ---------------------------------------------------------------- DSL -> DDL
export interface ResultadoDsl {
  ddl: string;
  erros: string[];
}

const W = '[ \\t\\n\\x0B\\f\\r]';
const P_ABRE_TABELA = new RegExp('^tabela'+W+'+([a-zA-Z_][a-zA-Z0-9_]*)'+W+'*\\{'+W+'*$','i');
const P_CHAVE = new RegExp('^chave'+W+'*\\((.*)\\)'+W+'*$','i');
const P_UNICO = new RegExp('^unico'+W+'*\\((.*)\\)'+W+'*$','i');

/** Trim ASCII: remove tudo <= U+0020 (o trim do JS remove também espaços Unicode). */
function trimAscii(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && s.charCodeAt(a) <= 0x20) a++;
  while (b > a && s.charCodeAt(b - 1) <= 0x20) b--;
  return s.substring(a, b);
}

/** Espaço em branco ASCII = [ \t\n\x0B\f\r]. */
const WS = /[ \t\n\x0B\f\r]+/;

function removerComentario(linha: string): string {
  const p = linha.indexOf('//');
  return p > -1 ? linha.substring(0, p) : linha;
}

/** Split por regex: descarta vazios finais; um separador no início gera "" inicial (só se largura > 0). */
function splitWs(s: string): string[] {
  const r = s.split(WS);
  while (r.length > 1 && r[r.length - 1] === '') r.pop();
  if (r.length === 1 && r[0] === '' && s !== '') return [];
  return r;
}

function traduzirColuna(linha: string, linhaBruta: string, numeroLinha: number, erros: string[]): string {
  let semSeta = linha;
  let referencia = '';
  const idxSeta = linha.indexOf('->');
  if (idxSeta > -1) {
    semSeta = trimAscii(linha.substring(0, idxSeta));
    const alvo = trimAscii(linha.substring(idxSeta + 2));
    const ponto = alvo.indexOf('.');
    if (ponto === -1) {
      erros.push(`Linha ${numeroLinha}: referência inválida (esperado tabela.coluna): ${trimAscii(linhaBruta)}`);
    } else {
      referencia = ` REFERENCES ${trimAscii(alvo.substring(0, ponto))} (${trimAscii(alvo.substring(ponto + 1))})`;
    }
  }
  const tokens = splitWs(trimAscii(semSeta));
  if (tokens.length < 2) {
    erros.push(`Linha ${numeroLinha}: coluna inválida (esperado "nome tipo"): ${trimAscii(linhaBruta)}`);
    return semSeta;
  }
  let resto = '';
  for (let i = 1; i < tokens.length; i++) {
    resto += tokens[i].toLowerCase() === 'pk' ? ' PRIMARY KEY' : ` ${tokens[i]}`;
  }
  return tokens[0] + resto + referencia;
}

export function dslParaDdl(dsl: string): ResultadoDsl {
  const erros: string[] = [];
  let ddl = '';
  let tabelaAtual: string | null = null;
  let itens: string[] = [];
  let numeroLinha = 0;

  for (const linhaBruta of dsl.split('\n')) {
    numeroLinha++;
    const linha = trimAscii(removerComentario(linhaBruta));
    if (linha === '') continue;

    const mAbre = P_ABRE_TABELA.exec(linha);
    if (mAbre) {
      if (tabelaAtual != null) {
        erros.push(`Linha ${numeroLinha}: tabela "${tabelaAtual}" não foi fechada com '}' antes de iniciar uma nova tabela.`);
      }
      tabelaAtual = mAbre[1];
      itens = [];
      continue;
    }

    if (linha === '}') {
      if (tabelaAtual == null) {
        erros.push(`Linha ${numeroLinha}: '}' sem 'tabela ... {' correspondente.`);
        continue;
      }
      if (itens.length === 0) {
        erros.push(`Linha ${numeroLinha}: tabela "${tabelaAtual}" não tem nenhuma coluna.`);
      } else {
        ddl += `CREATE TABLE ${tabelaAtual} (\n    ` + itens.join(',\n    ') + '\n);\n\n';
      }
      tabelaAtual = null;
      continue;
    }

    if (linha.startsWith('tabela ') || linha.toLowerCase() === 'tabela') {
      erros.push(`Linha ${numeroLinha}: declaração de tabela inválida (esperado 'tabela nome {'): ${trimAscii(linhaBruta)}`);
      continue;
    }

    if (tabelaAtual == null) {
      erros.push(`Linha ${numeroLinha}: conteúdo fora de um bloco 'tabela ... { }': ${trimAscii(linhaBruta)}`);
      continue;
    }

    const mChave = P_CHAVE.exec(linha);
    if (mChave) {
      itens.push(`PRIMARY KEY (${trimAscii(mChave[1])})`);
      continue;
    }
    const mUnico = P_UNICO.exec(linha);
    if (mUnico) {
      itens.push(`UNIQUE (${trimAscii(mUnico[1])})`);
      continue;
    }
    itens.push(traduzirColuna(linha, linhaBruta, numeroLinha, erros));
  }

  if (tabelaAtual != null) erros.push(`Tabela "${tabelaAtual}" não foi fechada com '}'.`);
  return { ddl, erros };
}
