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

/**
 * Modo linha de comando do ModelForge.
 *
 *   --validar <modelo>            valida o modelo e lista os problemas
 *   --ddl <modelo> [-o arquivo]   gera o DDL do modelo lógico
 *   --doc <modelo> [-o arquivo]   gera a documentação HTML do modelo lógico
 *   --ajuda | -h | --help         ajuda        --versao | --version   versão
 *
 * <modelo>: .mfd.json / .json (diagrama do ModelForge) ou pacote .mfp.json (usa o primeiro diagrama).
 * Saída: 0 sucesso; 1 erro de uso ou de leitura; 2 problemas de validação. Funciona offline, sem servidor.
 * O executável é tools/cli/modelforge-cli.mjs (usa o código compilado em backend/dist).
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import type { Diagrama } from '../modelo/tipos';
import { validarDiagrama } from '../modelo/validacao';
import { gerarDdlLista } from '../geradores/ddl';
import { gerarDocumentacaoHtml } from '../geradores/doc';
import { validarLogico } from '../geradores/validador';
import { validarConceitual } from '../geradores/validador-conceitual';

export const SAIDA_OK = 0;
export const SAIDA_ERRO = 1;
export const SAIDA_MODELO_INVALIDO = 2;

/** Entrada e saída injetáveis (o executável usa o console e o sistema de arquivos; os testes usam memória). */
export interface Io {
  out: (texto: string) => void;
  err: (linha: string) => void;
  lerArquivo: (caminho: string) => Buffer | null;
  gravarArquivo: (caminho: string, texto: string) => void;
}

export const ioPadrao = (): Io => ({
  out: (t) => process.stdout.write(t),
  err: (l) => process.stderr.write(l + '\n'),
  lerArquivo: (c) => (existsSync(c) && statSync(c).isFile() ? readFileSync(c) : null),
  gravarArquivo: (c, t) => writeFileSync(c, t, 'utf8'),
});

/** Nome do tipo de diagrama nas mensagens. */
const NOME_TIPO: Record<string, string> = {
  conceitual: 'Conceitual', logico: 'Logico', fluxo: 'Fluxo', atividade: 'Atividade', eap: 'Eap', livre: 'Livre', nosql: 'NoSql',
};

/** Nome do diagrama; sem nome, "<<Tipo>>". */
const nomeFormatado = (d: Diagrama): string => (d.nome ? d.nome : `<<${{ conceitual: 'Conceitual', logico: 'Lógico', fluxo: 'Fluxo', atividade: 'Atividade', eap: 'EAP', livre: 'Livre', nosql: 'NoSQL' }[d.tipo] ?? d.tipo}>>`);

export const AJUDA = `ModelForge - modo linha de comando

Uso:
  modelforge --validar <modelo>           valida o modelo e lista os problemas
  modelforge --ddl <modelo> [-o arquivo]  gera o DDL do modelo lógico
  modelforge --doc <modelo> [-o arquivo]  gera a documentação HTML do modelo
  modelforge --ajuda                      mostra esta ajuda

<modelo> é um arquivo .mfd.json (ou pacote .mfp.json) salvo pelo ModelForge.
Sem -o, o DDL sai na saída padrão.

Códigos de saída:
  0  sucesso
  1  erro de uso ou de leitura do arquivo
  2  o modelo tem problemas de validação (em --validar e em --ddl,
     onde o script é gerado mesmo assim e os problemas saem no stderr)
`;

/** Como `pedeModoTexto`: o primeiro argumento começa com "-". */
export const pedeModoTexto = (args: string[]): boolean => args.length > 0 && args[0].startsWith('-');

export const VERSAO = 'ModelForge';

function valorDe(args: string[], opcao: string): string | null {
  for (let i = 0; i < args.length - 1; i++) if (args[i] === opcao) return args[i + 1];
  return null;
}

/** Abre o modelo (.mfd.json/.json ou pacote .mfp.json); imprime o erro e devolve null em caso de falha. */
export function abrir(caminho: string, io: Io): Diagrama | null {
  const bytes = io.lerArquivo(caminho);
  if (bytes === null) {
    io.err('Erro: arquivo não encontrado: ' + caminho);
    return null;
  }
  try {
    let d: Diagrama | undefined;
    if (!/\.json$/i.test(caminho)) {
      io.err(`Erro: formato não suportado: ${caminho} (esperado .mfd.json, .mfp.json ou .json).`);
      return null;
    }
    {
      const bruto = JSON.parse(bytes.toString('utf8')) as { pacote?: unknown; diagramas?: unknown[] };
      const alvo = bruto && bruto.pacote === true && Array.isArray(bruto.diagramas) ? bruto.diagramas[0] : bruto;
      //# Modelos exportados por outras ferramentas podem omitir `ligacoes`: vale lista vazia.
      if (alvo && typeof alvo === 'object' && !('ligacoes' in alvo)) (alvo as Record<string, unknown>).ligacoes = [];
      if (validarDiagrama(alvo).length === 0) d = alvo as Diagrama;
    }
    if (!d) {
      io.err(`Erro: não foi possível ler o modelo ${caminho} (arquivo corrompido ou de outro formato).`);
      return null;
    }
    return d;
  } catch (e) {
    io.err(`Erro ao abrir ${caminho}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

function validar(args: string[], io: Io): number {
  if (args.length < 2) {
    io.err('Uso: --validar <modelo>');
    return SAIDA_ERRO;
  }
  const d = abrir(args[1], io);
  if (!d) return SAIDA_ERRO;
  let problemas: string[];
  if (d.tipo === 'logico') problemas = validarLogico(d);
  else if (d.tipo === 'conceitual') problemas = validarConceitual(d);
  else {
    io.err(`Erro: --validar só se aplica a modelo Lógico ou Conceitual; ${args[1]} é ${NOME_TIPO[d.tipo] ?? d.tipo}.`);
    return SAIDA_ERRO;
  }
  if (problemas.length === 0) {
    io.out(`OK: nenhum problema encontrado em ${args[1]}\n`);
    return SAIDA_OK;
  }
  io.out(`${problemas.length} problema(s) em ${args[1]}:\n`);
  for (const p of problemas) io.out(`  - ${p}\n`);
  return SAIDA_MODELO_INVALIDO;
}

function ddl(args: string[], io: Io): number {
  if (args.length < 2) {
    io.err('Uso: --ddl <modelo> [-o arquivo]');
    return SAIDA_ERRO;
  }
  const d = abrir(args[1], io);
  if (!d) return SAIDA_ERRO;
  if (d.tipo !== 'logico') {
    io.err(`Erro: --ddl só se aplica a modelo Lógico; ${args[1]} é ${NOME_TIPO[d.tipo] ?? d.tipo}.`);
    return SAIDA_ERRO;
  }
  const texto = `/* ${nomeFormatado(d)} */\n${gerarDdlLista(d).join('\n')}\n`;
  //# O script sai mesmo com problemas (é ponto de partida), mas o código de saída e o stderr avisam a automação.
  const problemas = validarLogico(d);
  const destino = valorDe(args, '-o');
  if (destino === null) io.out(texto);
  else {
    try {
      io.gravarArquivo(destino, texto);
      io.out(`DDL gravado em ${destino}\n`);
    } catch (e) {
      io.err(`Erro ao gravar ${destino}: ${e instanceof Error ? e.message : String(e)}`);
      return SAIDA_ERRO;
    }
  }
  if (problemas.length === 0) return SAIDA_OK;
  io.err(`Atenção: o modelo tem ${problemas.length} problema(s) e o script pode não ser aceito pelo banco:`);
  for (const p of problemas) io.err(`  - ${p}`);
  return SAIDA_MODELO_INVALIDO;
}

function doc(args: string[], io: Io): number {
  if (args.length < 2) {
    io.err('Uso: --doc <modelo> [-o arquivo.html]');
    return SAIDA_ERRO;
  }
  const d = abrir(args[1], io);
  if (!d) return SAIDA_ERRO;
  if (d.tipo !== 'logico') {
    io.err(`Erro: --doc só se aplica a modelo Lógico; ${args[1]} é ${NOME_TIPO[d.tipo] ?? d.tipo}.`);
    return SAIDA_ERRO;
  }
  const html = gerarDocumentacaoHtml(d);
  const destino = valorDe(args, '-o');
  if (destino === null) {
    io.out(html);
    return SAIDA_OK;
  }
  try {
    io.gravarArquivo(destino, html);
    io.out(`Documentação gravada em ${destino}\n`);
    return SAIDA_OK;
  } catch (e) {
    io.err(`Erro ao gravar ${destino}: ${e instanceof Error ? e.message : String(e)}`);
    return SAIDA_ERRO;
  }
}

export function executar(args: string[], io: Io = ioPadrao()): number {
  switch (args[0]) {
    case '-h':
    case '--ajuda':
    case '--help':
      io.out(AJUDA);
      return SAIDA_OK;
    case '--versao':
    case '--version':
      io.out(VERSAO + '\n');
      return SAIDA_OK;
    case '--validar':
      return validar(args, io);
    case '--ddl':
      return ddl(args, io);
    case '--doc':
      return doc(args, io);
    default:
      io.err('Comando desconhecido: ' + args[0]);
      io.out(AJUDA);
      return SAIDA_ERRO;
  }
}
