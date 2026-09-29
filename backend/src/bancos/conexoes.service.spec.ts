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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cifrar, ConexoesService, decifrar, derivarChave } from './conexoes.service';

describe('conexões salvas', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conex-'));
    process.env.DIAGRAMAS_FILE = path.join(dir, 'diagramas.json');
    delete process.env.CONEXOES_KEY;
    delete process.env.CONEXOES_FILE;
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); delete process.env.DIAGRAMAS_FILE; });

  it('AES-GCM: ida e volta, adulteração falha, chaves derivadas', () => {
    const k = derivarChave('frase');
    const c = cifrar(k, 'senha');
    expect(c).not.toContain('senha');
    expect(decifrar(k, c)).toBe('senha');
    expect(() => decifrar(derivarChave('outra'), c)).toThrow();
    expect(derivarChave('a'.repeat(64)).length).toBe(32);
  });

  const conn = { nome: 'Prod', tipo: 'postgresql', host: 'h', porta: 5432, database: 'd', usuario: 'u', senha: 'SEGREDO', salvarSenha: true, schema: 'public' };

  it('senha nunca volta ao cliente, fica cifrada no disco e é resolvida no servidor', async () => {
    const s = new ConexoesService();
    const salvo: any = await s.salvarSql(conn);
    expect(JSON.stringify(salvo)).not.toContain('SEGREDO');
    expect(salvo.temSenha).toBe(true);
    expect(JSON.stringify(await s.listar())).not.toContain('SEGREDO');
    expect(fs.readFileSync(path.join(dir, 'conexoes.json'), 'utf8')).not.toContain('SEGREDO');
    expect(fs.statSync(path.join(dir, 'conexoes.key')).mode & 0o777).toBe(0o600);
    const r = await new ConexoesService().resolverSql({ id: salvo.id });
    expect(r.params.senha).toBe('SEGREDO');
    expect(r.schema).toBe('public');
  });

  it('com id, host vem do salvo (senha não vai para outro servidor)', async () => {
    const s = new ConexoesService();
    const salvo: any = await s.salvarSql(conn);
    const r = await s.resolverSql({ id: salvo.id, host: 'atacante.com', database: 'x' });
    expect(r.params.host).toBe('h');
    expect(r.params.database).toBe('d');
  });

  it('sem salvarSenha não guarda; editar sem senha mantém a antiga; remover', async () => {
    const s = new ConexoesService();
    const a: any = await s.salvarSql({ ...conn, salvarSenha: false });
    expect(a.temSenha).toBe(false);
    const b: any = await s.salvarSql(conn);
    const c: any = await s.salvarSql({ ...conn, senha: '', host: 'h2' });
    expect(c.id).toBe(b.id);
    expect((await s.resolverSql({ id: c.id })).params.senha).toBe('SEGREDO');
    await s.remover(c.id);
    expect(await s.listar()).toEqual([]);
    await expect(s.remover('x')).rejects.toThrow();
  });

  it('NoSQL: credenciais só se o usuário pedir', async () => {
    const s = new ConexoesService();
    const sem: any = await s.salvarNoSql({ nome: 'm', uri: 'mongodb://u:pw@h/x', database: 'x' });
    expect(sem.uri).toBe('mongodb://h/x');
    expect(sem.temCredenciais).toBe(false);
    const com: any = await s.salvarNoSql({ nome: 'm2', uri: 'mongodb://u:pw@h/x', database: 'x', salvarCredenciais: true });
    expect(JSON.stringify(com)).not.toContain('pw');
    expect((await s.resolverNoSql({ id: com.id })).uri).toBe('mongodb://u:pw@h/x');
    expect(fs.readFileSync(path.join(dir, 'conexoes.json'), 'utf8')).not.toContain(':pw@');
  });
});
