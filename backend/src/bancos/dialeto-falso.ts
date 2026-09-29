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

/** Dialeto em memória para testes: lê o "catálogo" gravado nas fixtures de backend/test/fixtures-banco. */
import { ConexaoBase } from './dialetos/base';
import { ColunaInfo, FkLinha, IndiceLinha, ItemBanco, ResultadoSql, TipoBanco } from './tipos';

export interface CatalogoJson {
  objetos: ItemBanco[];
  colunas: Record<string, ColunaInfo[]>;
  pk: Record<string, string[]>;
  fks: Record<string, FkLinha[]>;
  indices: Record<string, IndiceLinha[]>;
  views?: Record<string, string>;
}

export class DialetoFalso extends ConexaoBase {
  constructor(private cat: CatalogoJson, readonly tipo: TipoBanco = 'sqlite', readonly usaSchema = false, private extras: Partial<ConexaoBase> = {}) {
    super();
    Object.assign(this, extras);
  }
  async schemas() { return ['']; }
  async objetos() { return this.cat.objetos; }
  async colunas(_s: string | null, t: string) { return this.cat.colunas[t] ?? []; }
  async chavePrimaria(_s: string | null, t: string) { return this.cat.pk[t] ?? []; }
  async fksImportadas(_s: string | null, t: string) { return this.cat.fks[t] ?? []; }
  async fksExportadas(_s: string | null, t: string) {
    return Object.values(this.cat.fks).flat().filter((f) => f.tabelaRef.toLowerCase() === t.toLowerCase());
  }
  async indices(_s: string | null, t: string) { return this.cat.indices[t] ?? []; }
  async definicaoView(_s: string | null, n: string) { return this.cat.views?.[n] ?? null; }
  async executar(): Promise<ResultadoSql> { throw new Error('não usado'); }
  async fechar() { /* nada */ }
}
