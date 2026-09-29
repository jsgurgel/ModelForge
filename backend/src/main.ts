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

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { hostsPermitidos } from './bancos/seguranca';
import { tokenConfigurado } from './auth/auth.guard';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  //# Um diagrama grande passa de 100kb (limite padrão); 20mb cobre bem além do máximo de formas aceito.
  app.useBodyParser('json', { limit: '20mb' });
  //# Só o front de desenvolvimento (Vite) - não abre CORS pra qualquer origem.
  app.enableCors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173', allowedHeaders: ['Content-Type', 'Authorization'] });
  //# Sem token, quem alcançar a porta pode abrir conexões de banco e rodar SQL (BANCO_HOSTS_PERMITIDOS vazio = qualquer host).
  if (!tokenConfigurado()) {
    console.warn('[AVISO] API_TOKEN não definido: a API não exige autenticação. Use apenas em máquina local/rede confiável; para expor a porta defina API_TOKEN e BANCO_HOSTS_PERMITIDOS (veja o README).');
  }
  if (hostsPermitidos().length === 0) {
    console.warn('[AVISO] BANCO_HOSTS_PERMITIDOS vazio: o backend conecta a qualquer host de banco informado pelo usuário.');
  }
  //# Local: só loopback. No container o compose seta HOST=0.0.0.0 (a porta é publicada só em 127.0.0.1 no host).
  await app.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '127.0.0.1');
}
bootstrap();
