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

import { BadRequestException, Body, Controller, Param, Post } from '@nestjs/common';
import { Diagrama } from '../modelo/tipos';
import { validarDiagrama } from '../modelo/validacao';
import { conceitualParaLogico, logicoParaConceitual } from './conversor';
import { conversaoInterativa, lerRespostas, RespostaInvalidaErro } from './conversao-interativa';
import { gerarDdl } from './ddl';
import { gerarDocumentacaoHtml } from './doc';
import { diagramaParaDsl, dslParaDdl } from './dsl';
import { importarDdlConceitual } from './importador-conceitual';
import { importarDdlLogico } from './importador';
import { gerarOrm } from './orm';
import { formatarRelatorio, validarLogico } from './validador';
import { validarConceitual } from './validador-conceitual';

const LINGUAGENS = ['jpa', 'sqlalchemy', 'prisma'] as const;

/** Só o Lógico tem geradores; o corpo é o diagrama inteiro (nada é gravado no servidor por aqui). */
function diagrama(corpo: unknown): Diagrama {
  const erros = validarDiagrama(corpo);
  if (erros.length) throw new BadRequestException(erros);
  return corpo as Diagrama;
}

function conceitual(corpo: unknown): Diagrama {
  const d = diagrama(corpo);
  if (d.tipo !== 'conceitual') throw new BadRequestException('esta operação só existe para o diagrama Conceitual');
  return d;
}

function logico(corpo: unknown): Diagrama {
  const d = diagrama(corpo);
  if (d.tipo !== 'logico') throw new BadRequestException('esta operação só existe para o diagrama Lógico');
  return d;
}

/** Erro inesperado num gerador (modelo com props fora do contrato) vira 400 com mensagem curta, sem stack. */
function executar<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw new BadRequestException(`não foi possível gerar: ${e instanceof Error ? e.message : String(e)}`);
  }
}

@Controller('geradores')
export class GeradoresController {
  @Post('ddl')
  ddl(@Body() corpo: unknown) {
    const d = logico(corpo);
    return { texto: executar(() => gerarDdl(d)) };
  }

  @Post('orm/:linguagem')
  orm(@Param('linguagem') linguagem: string, @Body() corpo: unknown) {
    if (!(LINGUAGENS as readonly string[]).includes(linguagem)) throw new BadRequestException(`linguagem inválida (use ${LINGUAGENS.join(', ')})`);
    const d = logico(corpo);
    return { texto: executar(() => gerarOrm(d, linguagem as (typeof LINGUAGENS)[number])) };
  }

  @Post('doc')
  doc(@Body() corpo: unknown) {
    const d = logico(corpo);
    return { texto: executar(() => gerarDocumentacaoHtml(d)) };
  }

  @Post('validar')
  validar(@Body() corpo: unknown) {
    const d = diagrama(corpo);
    if (d.tipo === 'conceitual') {
      return executar(() => {
        const problemas = validarConceitual(d);
        return { problemas, texto: formatarRelatorio(problemas, `"${d.nome}" (conceitual)`) };
      });
    }
    if (d.tipo !== 'logico') throw new BadRequestException('a validação existe para os diagramas Conceitual e Lógico');
    return executar(() => {
      const problemas = validarLogico(d);
      return { problemas, texto: formatarRelatorio(problemas, `"${d.nome}" (lógico)`) };
    });
  }

  @Post('dsl/exportar')
  dslExportar(@Body() corpo: unknown) {
    const d = logico(corpo);
    return { texto: executar(() => diagramaParaDsl(d)) };
  }

  @Post('dsl/importar')
  dslImportar(@Body() corpo: { dsl?: unknown }) {
    if (typeof corpo?.dsl !== 'string') throw new BadRequestException('dsl deve ser um texto');
    return executar(() => dslParaDdl(corpo.dsl as string));
  }

  @Post('importar/ddl')
  importarDdl(@Body() corpo: { ddl?: unknown; nome?: unknown }) {
    if (typeof corpo?.ddl !== 'string') throw new BadRequestException('ddl deve ser um texto');
    const nome = typeof corpo.nome === 'string' ? corpo.nome : undefined;
    return executar(() => importarDdlLogico(corpo.ddl as string, nome));
  }

  @Post('importar/ddl-conceitual')
  importarDdlConc(@Body() corpo: { ddl?: unknown; nome?: unknown }) {
    if (typeof corpo?.ddl !== 'string') throw new BadRequestException('ddl deve ser um texto');
    const nome = typeof corpo.nome === 'string' ? corpo.nome : undefined;
    return executar(() => importarDdlConceitual(corpo.ddl as string, nome));
  }

  @Post('converter/logico')
  paraLogico(@Body() corpo: unknown) {
    const d = conceitual(corpo);
    return executar(() => conceitualParaLogico(d));
  }

  /**
   * Conversão com perguntas ao usuário, em duas fases (ver conversao-interativa.ts): corpo
   * `{ diagrama, respostas }`; devolve `{ pendente }` (pergunta ainda sem resposta) ou `{ concluido }` (resultado final).
   */
  @Post('converter/logico/interativo')
  paraLogicoInterativo(@Body() corpo: { diagrama?: unknown; respostas?: unknown }) {
    const d = conceitual(corpo?.diagrama);
    try {
      return conversaoInterativa(d, lerRespostas(corpo?.respostas));
    } catch (e) {
      if (e instanceof RespostaInvalidaErro) throw new BadRequestException(e.message);
      throw new BadRequestException(`não foi possível gerar: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  @Post('converter/conceitual')
  paraConceitual(@Body() corpo: unknown) {
    const d = logico(corpo);
    return executar(() => logicoParaConceitual(d));
  }
}
