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

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard, PUBLICO, extrairBearer, tokenConfere } from './auth.guard';

function ctx(headers: Record<string, string>, publico = false, method = 'GET'): ExecutionContext {
  const handler = () => undefined;
  if (publico) Reflect.defineMetadata(PUBLICO, true, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ headers, method }) }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  const guard = new AuthGuard(new Reflector());
  const original = process.env.API_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.API_TOKEN;
    else process.env.API_TOKEN = original;
  });

  it('sem API_TOKEN deixa tudo passar', () => {
    delete process.env.API_TOKEN;
    expect(guard.canActivate(ctx({}))).toBe(true);
  });

  it('com API_TOKEN exige Bearer correto', () => {
    process.env.API_TOKEN = 'segredo-123';
    expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx({ authorization: 'Bearer errado' }))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx({ authorization: 'Basic segredo-123' }))).toThrow(UnauthorizedException);
    expect(guard.canActivate(ctx({ authorization: 'Bearer segredo-123' }))).toBe(true);
    expect(guard.canActivate(ctx({ authorization: 'bearer segredo-123' }))).toBe(true);
  });

  it('rotas públicas (saúde) e pré-voo OPTIONS não pedem token', () => {
    process.env.API_TOKEN = 'x';
    expect(guard.canActivate(ctx({}, true))).toBe(true);
    expect(guard.canActivate(ctx({}, false, 'OPTIONS'))).toBe(true);
  });

  it('token só com espaços conta como desligado', () => {
    process.env.API_TOKEN = '   ';
    expect(guard.canActivate(ctx({}))).toBe(true);
  });

  it('comparação em tempo constante e extração do cabeçalho', () => {
    expect(tokenConfere('abc', 'abc')).toBe(true);
    expect(tokenConfere('abc', 'abcd')).toBe(false);
    expect(extrairBearer('Bearer   t0k  ')).toBe('t0k');
    expect(extrairBearer(undefined)).toBe('');
    expect(extrairBearer(['Bearer a'])).toBe('a');
  });
});
