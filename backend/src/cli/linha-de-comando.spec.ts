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

import { readFileSync } from 'fs';
import { join } from 'path';
import { AJUDA, Io, SAIDA_ERRO, SAIDA_MODELO_INVALIDO, SAIDA_OK, executar, pedeModoTexto } from './linha-de-comando';
import { gerarDdlLista } from '../geradores/ddl';

const FIX = join(__dirname, '..', '..', 'test');
const fx = (nome: string) => JSON.parse(readFileSync(join(FIX, 'fixtures', nome), 'utf8'));

function io(arquivos: Record<string, Buffer | string>) {
  const saida = { out: '', err: [] as string[], gravados: {} as Record<string, string> };
  const i: Io = {
    out: (t) => { saida.out += t; },
    err: (l) => saida.err.push(l),
    lerArquivo: (c) => (c in arquivos ? Buffer.from(arquivos[c]) : null),
    gravarArquivo: (c, t) => { saida.gravados[c] = t; },
  };
  return { i, saida };
}

describe('linha de comando', () => {
  const ok = JSON.stringify(fx('ddl.json').modelo);
  const ruim = JSON.stringify(fx('val_problemas.json').modelo);

  it('--ajuda, --versao, comando desconhecido e detecção do modo texto', () => {
    let r = io({});
    expect(executar(['--ajuda'], r.i)).toBe(SAIDA_OK);
    expect(r.saida.out).toBe(AJUDA);
    r = io({});
    expect(executar(['--versao'], r.i)).toBe(SAIDA_OK);
    expect(r.saida.out).toBe('ModelForge\n');
    r = io({});
    expect(executar(['--xyz'], r.i)).toBe(SAIDA_ERRO);
    expect(r.saida.err).toEqual(['Comando desconhecido: --xyz']);
    expect(r.saida.out).toBe(AJUDA);
    expect(pedeModoTexto(['-h'])).toBe(true);
    expect(pedeModoTexto(['a.mfd.json'])).toBe(false);
    expect(pedeModoTexto([])).toBe(false);
  });

  it('erros de uso e arquivo inexistente saem com 1', () => {
    for (const [args, msg] of [
      [['--validar'], 'Uso: --validar <modelo>'],
      [['--ddl'], 'Uso: --ddl <modelo> [-o arquivo]'],
      [['--doc'], 'Uso: --doc <modelo> [-o arquivo.html]'],
      [['--ddl', 'x.json'], 'Erro: arquivo não encontrado: x.json'],
    ] as [string[], string][]) {
      const r = io({});
      expect(executar(args, r.i)).toBe(SAIDA_ERRO);
      expect(r.saida.err[0]).toBe(msg);
    }
  });

  it('--ddl imprime o script (cabeçalho /* nome */) e sai com 0 quando o modelo é válido', () => {
    const r = io({ 'm.mfd.json': ok });
    const codigo = executar(['--ddl', 'm.mfd.json'], r.i);
    const modelo = fx('ddl.json').modelo;
    expect(r.saida.out).toBe(`/* ${modelo.nome} */\n${gerarDdlLista(modelo).join('\n')}\n`);
    expect([SAIDA_OK, SAIDA_MODELO_INVALIDO]).toContain(codigo);
    expect(codigo === SAIDA_OK).toBe(r.saida.err.length === 0);
  });

  it('--ddl -o grava o arquivo; modelo com problemas devolve 2 e avisa no stderr', () => {
    const r = io({ 'p.json': ruim });
    expect(executar(['--ddl', 'p.json', '-o', 'saida.sql'], r.i)).toBe(SAIDA_MODELO_INVALIDO);
    expect(r.saida.out).toBe('DDL gravado em saida.sql\n');
    expect(r.saida.gravados['saida.sql']).toMatch(/^\/\* /);
    expect(r.saida.err[0]).toMatch(/^Atenção: o modelo tem \d+ problema\(s\) e o script pode não ser aceito pelo banco:$/);
    expect(r.saida.err[1]).toMatch(/^ {2}- /);
  });

  it('--validar lista os problemas (2) ou diz OK (0)', () => {
    let r = io({ 'p.json': ruim });
    expect(executar(['--validar', 'p.json'], r.i)).toBe(SAIDA_MODELO_INVALIDO);
    expect(r.saida.out).toMatch(/^\d+ problema\(s\) em p\.json:\n {2}- /);
    const vazio = { ...fx('ddl.json').modelo, formas: [], ligacoes: [] };
    r = io({ 'v.json': JSON.stringify(vazio) });
    expect(executar(['--validar', 'v.json'], r.i)).toBe(SAIDA_OK);
    expect(r.saida.out).toBe('OK: nenhum problema encontrado em v.json\n');
  });

  it('--doc gera HTML na saída padrão ou em arquivo', () => {
    let r = io({ 'm.json': ok });
    expect(executar(['--doc', 'm.json'], r.i)).toBe(SAIDA_OK);
    expect(r.saida.out).toContain('<html');
    r = io({ 'm.json': ok });
    expect(executar(['--doc', 'm.json', '-o', 'd.html'], r.i)).toBe(SAIDA_OK);
    expect(r.saida.out).toBe('Documentação gravada em d.html\n');
    expect(r.saida.gravados['d.html']).toContain('<html');
  });

  it('rejeita --ddl/--doc/--validar em diagrama de outro tipo com o nome do tipo', () => {
    const eap = { tipo: 'eap', nome: 'E', formas: [], ligacoes: [] };
    for (const [op, msg] of [['--ddl', '--ddl só se aplica a modelo Lógico'], ['--doc', '--doc só se aplica a modelo Lógico'], ['--validar', '--validar só se aplica a modelo Lógico ou Conceitual']]) {
      const r = io({ 'e.json': JSON.stringify(eap) });
      expect(executar([op, 'e.json'], r.i)).toBe(SAIDA_ERRO);
      expect(r.saida.err[0]).toBe(`Erro: ${msg}; e.json é Eap.`);
    }
  });

  it('abre pacotes .mfp.json; formato não suportado ou arquivo inválido = 1', () => {
    let r = io({ 'pac.mfp.json': JSON.stringify({ pacote: true, diagramas: [fx('ddl.json').modelo] }) });
    expect([SAIDA_OK, SAIDA_MODELO_INVALIDO]).toContain(executar(['--ddl', 'pac.mfp.json'], r.i));
    r = io({ 'm.xml': 'nada' });
    expect(executar(['--validar', 'm.xml'], r.i)).toBe(SAIDA_ERRO);
    expect(r.saida.err[0]).toBe('Erro: formato não suportado: m.xml (esperado .mfd.json, .mfp.json ou .json).');
    r = io({ 'x.json': '{"tipo":"logico"}' });
    expect(executar(['--validar', 'x.json'], r.i)).toBe(SAIDA_ERRO);
    expect(r.saida.err[0]).toBe('Erro: não foi possível ler o modelo x.json (arquivo corrompido ou de outro formato).');
  });
});
