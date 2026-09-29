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
 * Console de scripts do EAP: interpretador de comandos, sintaxe com aliases e mensagens do console.
 *
 * Linguagem (aliases entre "|"; maiúsculas/minúsculas indiferentes):
 *   SAIR|QUIT|Q|EXIT      LISTAR|LIST|LST|LI|?|AJUDA|HELP|H      CLEAR|CLE|CLS|LIMPAR
 *   SET AMBIENT|AMB|AMBIENTE|AM  SCREEN.X|SCR.X|S.X | SCREEN.Y | OBJECT.W|OBJ.W|O.W | OBJECT.H  (n)
 *   NOVO|NO|NOV|NV  EAP|E  HORIZONTAL|HOR|HZ|HORIZ|HORI|HO  CENTRO|CEN|CENT|CE | ESQUERDA|ESQ|ESQU|ES | DIREITA|DIRE|DIR|DI  { ... }
 *   NOVO EAP VERTICAL|VER|VERT|VERTI|VERTIC|VE { ... }       NOVO PROCESSO|PROC|PR (x,y) { texto | GET(id) }
 * Blocos `{ ... }` e `( ... )` viram variáveis `$$var_N` (aninhamento resolvido em camadas); um bloco aberto e não fechado
 * continua na linha seguinte (prompt ".>"). Aproximações: o layout final vem do organizador de EAP do front (não pixel a pixel
 * e `GET(n)` numera os objetos na ordem de criação (formas e depois ligações), como os IDs.
 */
import type { Diagrama, Forma, Ligacao } from './types';
import { novoId } from './types';
import { organizarEapCompleto } from './organizar';

// ------------------------------------------------------------------------------------------------ textos
export const EXP: Record<string, string> = {
  sair: 'SAIR|QUIT|Q|EXIT',
  novo: 'NOVO|NO|NOV|NV',
  listar: 'LISTAR|LIST|LST|LI|?|AJUDA|HELP|H',
  'eap.eap': 'EAP|E',
  'eap.processo': 'PROCESSO|PROC|PR',
  horizontal: 'HORIZONTAL|HOR|HZ|HORIZ|HORI|HO',
  vertical: 'VERTICAL|VER|VERT|VERTI|VERTIC|VE',
  centro: 'CENTRO|CEN|CENT|CE',
  esquerda: 'ESQUERDA|ESQ|ESQU|ES',
  direita: 'DIREITA|DIRE|DIR|DI',
  variavel: '{ ... }|$$var_',
  variavelnum: '(?)|$$var_',
  'amb.scr.x': 'SCREEN.X|SCR.X|S.X',
  'amb.scr.y': 'SCREEN.Y|SCR.Y|S.Y',
  'amb.obj.w': 'OBJECT.W|OBJ.W|O.W',
  'amb.obj.h': 'OBJECT.H|OBJ.H|O.H',
  set: 'SET',
  ambient: 'AMBIENT|AMB|AMBIENTE|AM',
  cls: 'CLEAR|CLE|CLS|LIMPAR',
};

export const MSG = {
  ok: 'Ok',
  erro: 'Erro',
  cli001: 'Falha na construção da instrução',
  cli002: (a: string, b: string) => `[${a}] Impossível executar (${b}).`,
  cli003: 'Comando inválido ou incompleto!',
  cli004: (s: string) => `Sintaxe: ${s}`,
  cli005: 'O valor deve ser um inteiro!',
  dica: {
    sair: 'Sair (Ctrl+Q)',
    listar: 'Lista os comandos possíveis',
    novo: 'NOVO [EAP] [PROCESSO]',
    novoEap: 'NOVO EAP HORIZONTAL|VERTICAL {\ntexto título\ntextos dos processos\n...\n}',
    novoProcesso: 'NOVO PROCESSO [(ID do EAP)] {texto do processo}',
  },
  construtor: 'Construtor',
} as const;

const NOTHING = '$$NOTHING$$123##123##CARLOS.H.CANDIDO';
const MSG_ERRO = 'erro';
const VAR_PREFIX = '$$var_';

// ------------------------------------------------------------------------------------------------ utilidades
/** Split que descarta as cadeias vazias do fim. */
export function splitSemVaziosFinais(s: string, sep: string): string[] {
  const p = s.split(sep);
  while (p.length > 0 && p[p.length - 1] === '') p.pop();
  return p.length === 0 && s === '' ? [''] : p;
}

/** Inteiro válido? (sinal opcional, só dígitos, cabe em int de 32 bits). */
export function ehInteiro32(s: string): boolean {
  if (!/^[+-]?\d+$/.test(s)) return false;
  const n = Number(s);
  return n >= -2147483648 && n <= 2147483647;
}

// ------------------------------------------------------------------------------------------------ Sintaxe
export class Sintaxe {
  proximos: Sintaxe[] = [];
  constructor(public comando: string) {}

  addProx(prox: string): Sintaxe {
    const t = new Sintaxe(prox);
    this.proximos.push(t);
    return t;
  }

  /** `AddProx(String[][])`: cada linha é um nó cujos filhos são os demais itens da linha. */
  addProxLinhas(linhas: string[][]): void {
    for (const l of linhas) {
      const fst = new Sintaxe(l[0]);
      this.proximos.push(fst);
      for (const s of l.slice(1)) fst.proximos.push(new Sintaxe(s));
    }
  }

  findByCMD(com: string): Sintaxe {
    return this.proximos.find((s) => s.comando === com) ?? this;
  }

  private ehVariavel(): boolean {
    return this.comando === 'variavel' || this.comando === 'variavelnum';
  }

  private aliases(): string[] {
    return (EXP[this.comando.toLowerCase()] ?? '').split('|');
  }

  isCMD(incmd: string): boolean {
    const cmds = this.aliases();
    if (this.ehVariavel()) return incmd.startsWith(cmds[1]);
    return cmds.includes(incmd.toUpperCase());
  }

  getBestCMD(incmd: string): string {
    return this.isCMD(incmd) ? this.aliases()[0] : '';
  }

  getSintaxeCMD(): string {
    return this.aliases()[0];
  }

  listar(lst: string[], tabs: string): void {
    const tab = `${tabs} - ${this.getSintaxeCMD()}`;
    if (this.proximos.length === 0) lst.push(tab + '\n');
    for (const sx of this.proximos) sx.listar(lst, tab);
  }

  isValido(cadeia: Sintaxe[], comm: string[], nv = 0): boolean {
    if (nv > comm.length - 1) return false;
    if (this.isCMD(comm[nv])) {
      nv++;
      cadeia.push(this);
      if (nv === comm.length && this.proximos.length === 0) return true;
      for (const sx of this.proximos) if (sx.isValido(cadeia, comm, nv)) return true;
    }
    return false;
  }

  getNivelDeValidade(comm: string[], nv = 0): number {
    if (nv > comm.length - 1) return nv;
    if (this.isCMD(comm[nv])) {
      const subnv = nv + 1;
      if (subnv === comm.length && this.proximos.length === 0) return subnv;
      let res = nv;
      for (const sx of this.proximos) res = Math.max(res, sx.getNivelDeValidade(comm, subnv));
      return res;
    }
    return nv;
  }

  /** A dica "Sintaxe: ..." mostrada quando o comando não fecha. */
  getSintaxe(comm: string[]): string {
    let res = this.getBestCMD(comm[0]);
    if (res === '') return 'Comando Inexistente';
    if (this.proximos.length === 0) return res;
    let prx: Sintaxe | null = null;
    let nv = 0;
    for (const sx of this.proximos) {
      const tmp = sx.getNivelDeValidade(comm, 1);
      if (tmp > nv) { nv = tmp; prx = sx; }
    }
    if (prx === null || comm.length === 1) {
      res += ' [' + this.proximos.map((s) => s.getSintaxeCMD() + ',').join('');
      return res.substring(0, res.length - 1) + ']';
    }
    return prx.getSintaxeEm(res, comm, 1);
  }

  getSintaxeEm(stx: string, comm: string[], nv: number): string {
    if (nv > comm.length - 1) return stx;
    let res = this.getBestCMD(comm[nv]);
    stx += ' ' + res;
    res = stx;
    if (this.proximos.length === 0) return stx;
    nv++;
    let tmpnv = nv;
    let prx: Sintaxe | null = null;
    for (const sx of this.proximos) {
      const tmp = sx.getNivelDeValidade(comm, nv);
      if (tmp > tmpnv) { tmpnv = tmp; prx = sx; }
    }
    if (prx === null || comm.length === nv) {
      res += ' [' + this.proximos.map((s) => s.getSintaxeCMD() + ',').join('');
      return res.substring(0, res.length - 1) + ']';
    }
    return prx.getSintaxeEm(res, comm, nv);
  }

  autoComplete(comm: string[], nv = 0): string {
    if (nv > comm.length - 1) return '';
    const tmp = comm[nv];
    let res = this.getBestCMD(tmp);
    if (res === '') return tmp;
    if (this.ehVariavel()) res = tmp;
    nv++;
    if (nv === comm.length) return this.proximos.length === 0 ? res : res + ' ';
    let tmpnv = nv;
    let prx: Sintaxe | null = null;
    for (const sx of this.proximos) {
      const idx = sx.getNivelDeValidade(comm, nv);
      if (idx > tmpnv) { tmpnv = idx; prx = sx; }
    }
    if (prx === null) return res + ' ' + comm[nv];
    return res + ' ' + prx.autoComplete(comm, nv);
  }
}

// ------------------------------------------------------------------------------------------------ Console + processador
interface Variavel { nome: string; valor: string; original: string }

/** Ponte com o diagrama aberto: lê e substitui o documento (EAP). */
export interface HostEap {
  obterDoc(): Diagrama;
  aplicarDoc(d: Diagrama): void;
  /** SAIR (fecha o console). */
  fechar?(): void;
}

/** Ordem em que LISTAR mostra as variáveis de ambiente. */
const ORDEM_AMBIENTE = ['amb.obj.w', 'amb.obj.h', 'amb.scr.y', 'amb.scr.x'];

const forma = (kind: string, texto: string, x: number, y: number, w: number, h: number, props: Record<string, unknown> = {}): Forma => ({
  id: novoId(), kind, x, y, w, h, texto, props,
});

export class ConsoleEap {
  // ---- estado de MasterCli
  prompt = '# ';
  private promptNormal = '# ';
  private promptEntradaTexto = '.>';
  /** Transcrito (`strs`): tudo o que a janela mostra acima da linha de comando. */
  transcrito = '';
  historico: string[] = [];
  saiu = false;
  /** Texto digitado na linha atual (depois do prompt). */
  digitando = '';
  // ---- estado de CliDiagramaProcessador
  ambiente: Record<string, string> = { 'amb.scr.x': '200', 'amb.scr.y': '200', 'amb.obj.w': '120', 'amb.obj.h': '58' };
  private vars = new Map<string, Variavel>();
  private comandos: Sintaxe[] = [];
  private entradaTexto = false;
  private buffer = '';
  private erroMsg = '';
  private lastCmdErro = false;
  private writeNothing = false;
  private posHist = -1;
  /** Ordem de criação dos objetos (para GET(n)): ids de formas e depois de ligações. */
  private ordemIds: string[] = [];
  private doc: Diagrama;

  constructor(private host: HostEap) {
    this.doc = host.obterDoc();
    //# O primeiro objeto criado recebe o ID 2.
    this.ordemIds = ['', ...this.doc.formas.map((f) => f.id), ...this.doc.ligacoes.map((l) => l.id)];
    this.comandos.push(new Sintaxe('sair'), new Sintaxe('listar'), new Sintaxe('cls'));
    const set = new Sintaxe('set');
    set.addProx('ambient').addProxLinhas([
      ['amb.scr.x', 'variavelnum'], ['amb.scr.y', 'variavelnum'], ['amb.obj.w', 'variavelnum'], ['amb.obj.h', 'variavelnum'],
    ]);
    this.comandos.push(set);
    const novo = new Sintaxe('novo');
    this.comandos.push(novo);
    novo.addProxLinhas([['eap.eap', 'horizontal', 'vertical'], ['eap.processo', 'variavelnum']]);
    novo.findByCMD('eap.processo').findByCMD('variavelnum').addProx('variavel');
    novo.findByCMD('eap.eap').findByCMD('horizontal').addProxLinhas([['centro', 'variavel'], ['esquerda', 'variavel'], ['direita', 'variavel']]);
    novo.findByCMD('eap.eap').findByCMD('vertical').addProx('variavel');
  }

  // ---------------------------------------------------------------------------------------- MasterCli
  doShowMsg(msg: string): void {
    this.transcrito += msg + '\n';
    this.digitando = '';
  }

  limpar(): void {
    this.transcrito = this.prompt;
  }

  cancelar(): void {
    this.doShowMsg(this.doCancel());
  }

  sair(): void {
    this.cancelar();
    this.saiu = true;
    this.host.fechar?.();
  }

  private appendHistorico(txt: string): void {
    if (txt === '') return;
    this.posHist = -1;
    if (this.historico.length && this.historico[0] === txt) return;
    this.historico.unshift(txt.substring(this.prompt.length));
  }

  /** Seta para cima (+1) / baixo (-1): devolve o texto do histórico a colocar na linha. */
  navegarHistorico(i: number): string {
    if (this.historico.length === 0) return this.digitando;
    const tmp = this.posHist + i;
    if (tmp < 0 || tmp >= this.historico.length) {
      this.posHist = tmp < 0 ? -1 : this.historico.length;
      this.digitando = '';
      return '';
    }
    this.posHist += i;
    this.digitando = this.historico[this.posHist];
    return this.digitando;
  }

  /** Tab: completa o comando (`AutoComplete`). */
  autoCompletar(): string {
    const ac = this.doAutoComplete(this.digitando.trim());
    if (ac !== '') this.digitando = ac;
    return this.digitando;
  }

  /** Enter numa linha digitada (`doEnter(prompt + linha)`); devolve se houve erro. */
  entrar(linha: string): boolean {
    return this.doEnter(this.prompt + linha);
  }

  doEnter(apalavra: string): boolean {
    this.appendHistorico(apalavra);
    this.transcrito += apalavra + '\n';
    let ret: string;
    try {
      ret = this.processeComando(apalavra.substring(this.prompt.length));
    } catch {
      //# Erro inesperado (ex.: `$$var_9` digitado à mão): a linha fica como está.
      return true;
    }
    //# SAIR fechou a janela: nada mais é escrito depois do "^D".
    if (this.saiu) return this.lastCmdErro;
    if (ret !== '' && ret !== NOTHING) this.transcrito += ret + '\n';
    this.digitando = '';
    return this.lastCmdErro;
  }

  /** Colar (Ctrl+V / menu Colar): cada linha vira um Enter; sem erro, mostra a última mensagem de erro. */
  colar(txt: string): void {
    if (txt === '') return;
    if (this.digitando !== '') txt = this.digitando + txt;
    const comms = splitSemVaziosFinais(txt.replace(/\r\n/g, '\n'), '\n');
    for (const s of comms) {
      const erro = this.doEnter(this.prompt + s);
      if (this.saiu) break;
      if (!erro) this.doShowMsg(this.erroMsg);
    }
  }

  // ---------------------------------------------------------------------------------------- CliDiagramaProcessador
  private setEntradaTexto(v: boolean): void {
    this.entradaTexto = v;
    if (v) {
      this.prompt = this.promptEntradaTexto;
      this.buffer = '';
    } else {
      this.prompt = this.promptNormal;
    }
  }

  get emEntradaTexto(): boolean {
    return this.entradaTexto;
  }

  get ultimoErro(): boolean {
    return this.lastCmdErro;
  }

  private processaChavesParenteses(comm: string): string {
    const pilha: string[] = [];
    let last = '!';
    for (const a of comm) {
      if (a === '{' || a === '(') {
        last = a;
        pilha.push(a);
      } else if (a === '}' || a === ')') {
        if ((a === '}' && last === '{') || (a === ')' && last === '(')) {
          if (pilha.length === 0) return MSG_ERRO;
          pilha.pop();
          if (pilha.length) last = pilha[pilha.length - 1][0];
        } else {
          return MSG_ERRO;
        }
      }
    }
    return pilha.length ? 'TXT' : NOTHING;
  }

  processeComando(comm: string): string {
    if (comm === '') return NOTHING;
    this.writeNothing = false;
    this.lastCmdErro = false;
    this.vars.clear();
    if (this.entradaTexto) {
      this.buffer += comm;
      comm = this.buffer;
      const res = this.processaChavesParenteses(comm);
      if (res === MSG_ERRO) {
        this.setEntradaTexto(false);
        this.lastCmdErro = true;
        return MSG.cli001;
      }
      if (res === 'TXT') {
        this.buffer += '\n';
        return NOTHING;
      }
      comm = this.buffer;
      this.setEntradaTexto(false);
    } else {
      const res = this.processaChavesParenteses(comm);
      if (res === 'TXT') {
        this.setEntradaTexto(true);
        this.buffer += comm + '\n';
        return NOTHING;
      }
      if (res === MSG_ERRO) {
        this.lastCmdErro = true;
        return MSG.cli001;
      }
    }
    const cmds = this.processadorMor(comm);
    if (this.lastCmdErro) return MSG.erro + ' ' + MSG.cli001;
    if (cmds.length) {
      if (this.runCMD(cmds)) return this.writeNothing ? NOTHING : MSG.ok;
    }
    if (this.lastCmdErro) return MSG.cli002(MSG.erro, this.erroMsg);
    return MSG.cli003;
  }

  private doCancel(): string {
    this.vars.clear();
    this.setEntradaTexto(false);
    return '^D';
  }

  private processadorMor(comm: string): string[] {
    if (comm === '') return [];
    this.lastCmdErro = false;
    if (this.processaChavesParenteses(comm) === MSG_ERRO) {
      this.lastCmdErro = true;
      return [];
    }
    comm = this.removaConteiner(comm);
    return splitSemVaziosFinais(comm.replace(/ +/g, ' '), ' ');
  }

  /** Troca o primeiro bloco `{...}`/`(...)` por `$$var_N` e repete até não haver mais blocos. */
  removaConteiner(comm: string): string {
    const bkp = comm;
    let ini = -1;
    let cp = '!';
    for (let i = 0; i < comm.length; i++) {
      if (comm[i] === '{' || comm[i] === '(') { cp = comm[i]; ini = i; break; }
    }
    if (ini > -1) {
      const achar = cp === '{' ? '}' : ')';
      let qtd = 0;
      let fim = -1;
      for (let i = 0; i < comm.length; i++) {
        if (comm[i] === cp) qtd++;
        if (comm[i] === achar) qtd--;
        if (i > ini && qtd === 0) { fim = i; break; }
      }
      if (fim < 0) throw new Error('bloco sem fim');
      const v: Variavel = { nome: VAR_PREFIX + this.vars.size, original: comm.substring(ini, fim + 1), valor: comm.substring(ini + 1, fim) };
      this.vars.set(v.nome, v);
      comm = (ini > 0 ? comm.substring(0, ini) + ' ' : '') + v.nome + ' ' + (fim < comm.length - 1 ? comm.substring(fim + 1) : '');
    }
    if (comm === bkp) return comm;
    return this.removaConteiner(comm);
  }

  private restoreVars(cmd: string): string {
    for (const [k, v] of this.vars) {
      const i = cmd.indexOf(k);
      if (i >= 0) cmd = cmd.substring(0, i) + v.original + cmd.substring(i + k.length);
    }
    return cmd;
  }

  doAutoComplete(palavra: string): string {
    if (this.entradaTexto) return '';
    palavra = palavra.trim();
    if (palavra === '') return '';
    this.lastCmdErro = false;
    this.vars.clear();
    const comm = this.processadorMor(palavra);
    if (this.lastCmdErro) return '';
    let nv = -1;
    let hlp: Sintaxe | null = null;
    for (const sx of this.comandos) {
      const tmp = sx.getNivelDeValidade(comm);
      if (tmp > nv) { hlp = sx; nv = tmp; }
    }
    return hlp ? this.restoreVars(hlp.autoComplete(comm)) : '';
  }

  private runCMD(comm: string[]): boolean {
    let hlp: Sintaxe | null = null;
    let nv = -1;
    for (const sx of this.comandos) {
      const cadeia: Sintaxe[] = [];
      if (sx.isValido(cadeia, comm)) return this.processeComandoValido(cadeia, comm);
      const tmp = sx.getNivelDeValidade(comm);
      if (tmp > nv) { hlp = sx; nv = tmp; }
    }
    if (hlp) this.doShowMsg(MSG.cli004(hlp.getSintaxe(comm)));
    return false;
  }

  private bestCMD(parte: string): string {
    return EXP[parte.toLowerCase()].split('|')[0];
  }

  private processeComandoValido(cadeia: Sintaxe[], comm: string[]): boolean {
    let sx = cadeia[0];
    // ---- CliDiagramaProcessador (base)
    if (sx.comando === 'sair') { this.sair(); return true; }
    if (sx.comando === 'cls') { this.limpar(); this.writeNothing = true; return true; }
    if (sx.comando === 'listar') {
      for (const s of this.comandos) {
        const r: string[] = [];
        s.listar(r, '');
        this.doShowMsg(r.join(''));
      }
      for (const k of ORDEM_AMBIENTE) this.doShowMsg(this.bestCMD(k) + '=' + this.ambiente[k]);
      return true;
    }
    if (sx.comando === 'set' && this.processeComandoSet(cadeia, comm)) return true;
    // ---- EapCLI
    if (sx.comando === 'set') {
      //#
    }
    this.doShowMsg('[' + comm.join(', ') + ']');
    if (sx.comando === 'novo') {
      sx = cadeia[1];
      if (sx.comando === 'eap.processo') return this.calcularCarregando(() => this.novoProcessoCmd(comm[2], comm[3]));
      if (sx.comando === 'eap.eap') return this.calcularCarregando(() => this.novoEapCmd(cadeia, comm));
    }
    return true;
  }

  private processeComandoSet(cadeia: Sintaxe[], comm: string[]): boolean {
    if (cadeia[1].comando === 'ambient') {
      const nome = this.bestCMD(cadeia[2].comando);
      const valor = this.empilhe(cadeia[2].comando, comm[3]);
      this.doShowMsg(nome + ' = ' + valor);
      if (!this.lastCmdErro) return true;
    }
    return false;
  }

  private empilhe(comando: string, variavel: string): string {
    const res = this.vars.get(variavel)!.valor.trim();
    this.ambiente[comando] = res;
    if (!ehInteiro32(res)) {
      this.lastCmdErro = true;
      this.doShowMsg(MSG.cli005);
    }
    return res;
  }

  private ambientInteger(v: string): number {
    const s = this.ambiente[v];
    if (!ehInteiro32(s)) throw new ErroNumero(`Número inválido: "${s}"`);
    return Number(s);
  }

  // ---------------------------------------------------------------------------------------- EapCLI
  /** `calcularCarregando`: trabalha numa cópia do documento; só aplica se a operação terminou bem. */
  private calcularCarregando(fn: () => boolean): boolean {
    this.doc = this.host.obterDoc();
    const antes = this.doc;
    let ok: boolean;
    try {
      ok = fn();
    } catch (e) {
      this.doc = antes;
      if (e instanceof ErroNumero) {
        this.lastCmdErro = true;
        this.erroMsg = e.message;
        return false;
      }
      throw e;
    }
    if (ok) this.host.aplicarDoc(this.doc);
    else this.doc = antes;
    return ok;
  }

  private restoreVarToPoint(variavel: string): [number, number] {
    const v = this.vars.get(variavel);
    if (!v) return [-1, -1];
    const spt = splitSemVaziosFinais(v.valor.trim().replace(/ /g, ''), ',');
    if (spt.length < 2) return [-1, -1];
    if (!ehInteiro32(spt[0]) || !ehInteiro32(spt[1])) return [-1, -1];
    const x = Number(spt[0]);
    const y = Number(spt[1]);
    return x < 0 || y < 0 ? [-1, -1] : [x, y];
  }

  private novoProcessoCmd(var1: string, var2: string): boolean {
    const p = this.restoreVarToPoint(var1);
    if (p[0] === -1) {
      this.lastCmdErro = true;
      this.erroMsg = 'Erro ao informar o valor da posição do objeto';
      return false;
    }
    this.novoProcesso(p[0], p[1], this.vars.get(var2)!.valor);
    return true;
  }

  /** `GetByID`: `GET(n)` (um dígito) devolve o processo já existente com esse número. */
  private getPorId(txt: string): Forma | null {
    if (!isComandoGet(txt.toUpperCase())) return null;
    const r = txt.substring(4, txt.length - 1).trim();
    if (!ehInteiro32(r) || r === '-1') return null;
    const id = this.ordemIds[Number(r) - 1];
    return this.doc.formas.find((f) => f.id === id) ?? null;
  }

  private registrar(id: string): void {
    this.ordemIds.push(id);
  }

  private novoProcesso(x: number, y: number, txt: string): Forma {
    const fnd = this.getPorId(txt);
    if (fnd && fnd.kind === 'eapProcesso') return fnd;
    if (isComandoGet(txt.toUpperCase())) txt = 'Não encontrado!';
    const f = forma('eapProcesso', txt, x, y, this.ambientInteger('amb.obj.w'), this.ambientInteger('amb.obj.h'));
    this.doc = { ...this.doc, formas: [...this.doc.formas, f] };
    this.registrar(f.id);
    return f;
  }

  private novaBarra(x: number, y: number, dir: 'Vertical' | 'Horizontal'): Forma {
    const larg = 10;
    const w = this.ambientInteger('amb.obj.w');
    const f = forma('eapBarraLigacao', '', x, y, dir === 'Vertical' ? larg : w, dir === 'Vertical' ? w : larg, { direcao: dir, posicao: 'Centro', distancia: larg });
    this.doc = { ...this.doc, formas: [...this.doc.formas, f] };
    this.registrar(f.id);
    return f;
  }

  private setPosicao(barra: Forma, pos: 'Centro' | 'Esquerda' | 'Direita'): void {
    this.doc = { ...this.doc, formas: this.doc.formas.map((f) => (f.id === barra.id ? { ...f, props: { ...f.props, posicao: pos } } : f)) };
  }

  private ligue(barra: Forma, p: Forma, tp: 'abaixo' | 'esquerda' | 'acima'): void {
    const l: Ligacao = { id: novoId(), kind: 'eapLigacao', de: p.id, para: barra.id, texto: '', cardDe: '', cardPara: '', props: { papel: tp === 'abaixo' ? 'pai' : 'filho' } };
    this.doc = { ...this.doc, ligacoes: [...this.doc.ligacoes, l] };
    this.registrar(l.id);
  }

  private processeStr(s: string): string[] {
    let strs = this.vars.get(s)!.valor;
    strs = this.removaConteiner(strs);
    return strs.split('\n').filter((x) => x !== '');
  }

  private novoEapCmd(cadeia: Sintaxe[], comm: string[]): boolean {
    let cmd = cadeia[2].comando;
    let strs: string;
    if (cmd === 'vertical') {
      strs = comm[3];
    } else {
      strs = comm[4];
      cmd += cadeia[3].comando;
    }
    const itens = this.processeStr(strs);
    if (itens.length < 2) {
      this.lastCmdErro = true;
      this.erroMsg = 'Erro ao informar a quantidade de processos.';
      return false;
    }
    this.X = this.ambientInteger('amb.scr.x');
    this.Y = this.ambientInteger('amb.scr.y');
    const { pp, barra } = this.criarUnidades(itens, cmd, true);
    void pp;
    if (barra) this.doc = organizarEapCompleto(this.doc, barra.id);
    return true;
  }

  private haveVars(cmd: string): boolean {
    return cmd.split(' ').some((a) => a.startsWith('$$') && this.vars.has(a));
  }

  private reempilhe(cmd: string): string[] {
    const res: string[] = [];
    for (const a of cmd.split(' ')) if (a.startsWith(VAR_PREFIX) && this.vars.has(a)) res.push(...this.processeStr(a));
    const i = cmd.indexOf(VAR_PREFIX);
    if (i > 0) res.unshift(cmd.substring(0, i));
    else res.unshift('?');
    return res;
  }

  private X = 0;
  private Y = 0;

  private topHeight(f: Forma): number {
    const atual = this.doc.formas.find((g) => g.id === f.id) ?? f;
    return atual.y + atual.h;
  }

  private criarUnidades(itens: string[], tp: string, principal: boolean): { pp: Forma | null; barra: Forma | null } {
    let br: Forma | null = null;
    let PP: Forma | null = null;
    const larg = this.ambientInteger('amb.obj.w');
    if (tp === 'vertical') {
      PP = this.novoProcesso(this.X, this.Y, itens[0]);
      this.Y = this.topHeight(PP) + 50;
      br = this.novaBarra(this.X + Math.trunc(PP.w / 2) - 5, this.Y, 'Vertical');
      this.Y += 50;
      this.ligue(br, PP, 'abaixo');
      this.X += 100;
      for (let i = 1; i < itens.length; i++) {
        const tmp = itens[i];
        let p: Forma;
        if (this.haveVars(tmp)) {
          const subs = this.reempilhe(tmp);
          p = this.criarUnidades(subs, tp, false).pp!;
          this.X -= 100;
        } else {
          p = this.novoProcesso(this.X, this.Y, tmp);
        }
        this.Y = this.topHeight(p) + 50;
        this.ligue(br, p, 'esquerda');
      }
    }
    let x = this.X;
    let y = this.Y;
    const horizontal = (pos: 'Centro' | 'Esquerda' | 'Direita') => {
      const n = itens.length;
      if (pos === 'Centro') {
        const bkp = x;
        x = x + Math.trunc(((n - 1) * (larg + 10) - 10) / 2) - Math.trunc(larg / 2);
        PP = this.novoProcesso(x, y, itens[0]);
        y = this.topHeight(PP) + 50;
        x = (this.doc.formas.find((g) => g.id === PP!.id) ?? PP).x;
        br = this.novaBarra(x, y, 'Horizontal');
        this.setPosicao(br, 'Centro');
        y += 50;
        this.ligue(br, PP, 'abaixo');
        x = bkp;
      } else if (pos === 'Esquerda') {
        const tmp2 = (n - 1) * (larg + 10);
        x += tmp2;
        PP = this.novoProcesso(x, y, itens[0]);
        x -= tmp2;
        y = this.topHeight(PP) + 50;
        br = this.novaBarra(x, y, 'Horizontal');
        this.setPosicao(br, 'Esquerda');
        y += 50;
        this.ligue(br, PP, 'abaixo');
      } else {
        PP = this.novoProcesso(x, y, itens[0]);
        x = (this.doc.formas.find((g) => g.id === PP!.id) ?? PP).x;
        x = x + (larg + 10) + 10;
        y = this.topHeight(PP) + 50;
        br = this.novaBarra(x, y, 'Horizontal');
        this.setPosicao(br, 'Direita');
        y += 50;
        this.ligue(br, PP, 'abaixo');
      }
      for (let i = 1; i < n; i++) {
        const tmp = itens[i];
        let p: Forma;
        if (this.haveVars(tmp)) {
          this.X = x;
          this.Y = y;
          p = this.criarUnidades(this.reempilhe(tmp), tp, false).pp!;
        } else {
          p = this.novoProcesso(x, y, tmp);
        }
        x += pos === 'Direita' ? larg + 10 : 130;
        this.ligue(br!, p, 'acima');
      }
    };
    if (tp === 'horizontalcentro') horizontal('Centro');
    if (tp === 'horizontalesquerda') horizontal('Esquerda');
    if (tp === 'horizontaldireita') horizontal('Direita');
    return { pp: PP, barra: br };
  }
}

class ErroNumero extends Error {}

/** Comando GET(n)? (o texto já em maiúsculas). */
export function isComandoGet(txtMaiusculo: string): boolean {
  return /^GET\(*[0-9]\)$/.test(txtMaiusculo);
}

/** Texto do script gerado pelo Construtor; ajusta a posição no console. */
export function scriptDoConstrutor(
  c: ConsoleEap,
  o: { principal: string; processos: string; organizacao: 'vertical' | 'horizontal-centro' | 'horizontal-esquerda' | 'horizontal-direita'; x: string; y: string },
): string {
  c.ambiente['amb.scr.x'] = ehInteiro32(o.x) ? o.x : '200';
  c.ambiente['amb.scr.y'] = ehInteiro32(o.y) ? o.y : '200';
  let nv = 'NOVO EAP';
  if (o.organizacao === 'vertical') nv += ' VERTICAL';
  else nv += ' HORIZONTAL' + (o.organizacao === 'horizontal-centro' ? ' CENTRO' : o.organizacao === 'horizontal-direita' ? ' DIREITA' : ' ESQUERDA');
  return nv + ' {\n' + o.principal + '\n' + o.processos + '\n}';
}
