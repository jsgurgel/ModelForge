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

import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual, createHash } from 'crypto';

/** Marca uma rota como pública (sem token), como o health check. */
export const PUBLICO = 'modelforge:publico';
export const Publico = () => SetMetadata(PUBLICO, true);

/** Token configurado em API_TOKEN (vazio = autenticação desligada). Lido a cada chamada para poder mudar em testes. */
export const tokenConfigurado = (): string => (process.env.API_TOKEN ?? '').trim();

/** Comparação em tempo constante (o hash SHA-256 iguala os tamanhos, então o comprimento do token não vaza). */
export function tokenConfere(informado: string, esperado: string): boolean {
  const a = createHash('sha256').update(informado).digest();
  const b = createHash('sha256').update(esperado).digest();
  return timingSafeEqual(a, b);
}

/** Extrai o token do cabeçalho `Authorization: Bearer <token>`; devolve '' se ausente/malformado. */
export function extrairBearer(cabecalho: string | string[] | undefined): string {
  const v = Array.isArray(cabecalho) ? cabecalho[0] : cabecalho;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(v ?? '');
  return m ? m[1] : '';
}

/**
 * Autenticação opcional por token de API. Com API_TOKEN definido, toda rota `/api` exige `Authorization: Bearer <token>`,
 * exceto as marcadas com @Publico() (health check). Sem API_TOKEN nada é exigido (uso local, monousuário).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const esperado = tokenConfigurado();
    if (!esperado) return true;
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<{ method?: string; headers: Record<string, string | string[] | undefined> }>();
    //# Pré-voo de CORS não leva credenciais; o próprio middleware do CORS responde antes daqui.
    if (req.method === 'OPTIONS') return true;
    const informado = extrairBearer(req.headers['authorization']);
    if (!informado || !tokenConfere(informado, esperado)) {
      throw new UnauthorizedException('Token de acesso ausente ou inválido.');
    }
    return true;
  }
}
