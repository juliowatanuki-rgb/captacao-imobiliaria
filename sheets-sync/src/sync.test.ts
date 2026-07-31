import { describe, expect, it, beforeEach } from "vitest";
import { sincronizarPlanilha, type ListingRow, type PoolLike } from "./sync.js";

/**
 * Fake do Neon: guarda so o que o sync.ts realmente le/escreve
 * (listing_first_snapshot + listings.sheets_exportado_em), o suficiente para
 * provar as garantias das regras 1, 4, 6, 7 e 8 sem depender de um Postgres real.
 */
class FakePool implements PoolLike {
  rows: (ListingRow & { sheets_exportado_em: string | null })[] = [];
  updateCalls = 0;

  async query<T = any>(text: string, params: any[] = []): Promise<{ rows: T[] }> {
    if (text.includes("FROM listing_first_snapshot")) {
      const [limite] = params;
      const pendentes = this.rows
        .filter((r) => r.sheets_exportado_em === null)
        .sort((a, b) => a.primeira_captura_em.localeCompare(b.primeira_captura_em))
        .slice(0, limite);
      return { rows: pendentes as any };
    }

    if (text.includes("UPDATE listings SET sheets_exportado_em")) {
      this.updateCalls += 1;
      const [ids] = params;
      for (const id of ids as string[]) {
        const row = this.rows.find((r) => r.id === id);
        if (row) row.sheets_exportado_em = new Date().toISOString();
      }
      return { rows: [] };
    }

    throw new Error(`FakePool: query nao reconhecida: ${text.slice(0, 80)}`);
  }
}

/** Fake da planilha: guarda as linhas de verdade em memoria, na mesma ordem de colunas de paraLinha() (ver sync.ts). */
class FakeSheet {
  linhas: (string | number)[][] = [];
  falharNoProximoAppend = false;

  private static INDICE_LISTING_ID = -3; // [..., reconstruido, listing_id, site_id, identity_key]

  garantirCabecalho = async () => {};

  listarListingIdsExistentes = async (): Promise<Set<string>> => {
    const indice = this.linhas[0] ? this.linhas[0].length + FakeSheet.INDICE_LISTING_ID : 0;
    return new Set(this.linhas.map((linha) => String(linha[indice])));
  };

  acrescentarLinhas = async (linhas: (string | number)[][]): Promise<void> => {
    if (this.falharNoProximoAppend) {
      this.falharNoProximoAppend = false;
      throw new Error("falha simulada de rede no Google Sheets");
    }
    this.linhas.push(...linhas);
  };
}

function row(overrides: Partial<ListingRow & { sheets_exportado_em: string | null }>): ListingRow & {
  sheets_exportado_em: string | null;
} {
  return {
    id: "id-1",
    site_id: "site_a",
    identity_key: "chave-1",
    external_id: "1",
    site_nome: "Imobiliaria A",
    titulo: "Titulo original",
    tipo_imovel: "Apartamento",
    bairro: "Boqueirao",
    preco: "300000",
    area_util: "60",
    dormitorios: 2,
    suites: 1,
    vagas: 1,
    condominio_nome: "Condominio X",
    endereco: "Rua A, 123",
    url_original: "https://exemplo.com.br/imovel/1",
    primeira_captura_em: "2026-01-01T00:00:00.000Z",
    status_primeira_captura: "ativo",
    reconstruido: false,
    status_atual: "ativo",
    analysis_status: "pendente",
    ia_condominio: null,
    ia_endereco: null,
    ia_bairro: null,
    ia_cidade: null,
    ia_confianca: null,
    ia_status: null,
    ia_evidencias: null,
    ia_divergencias: null,
    ia_criterio_confirmacao: null,
    sheets_exportado_em: null,
    ...overrides,
  };
}

describe("sincronizarPlanilha", () => {
  let pool: FakePool;
  let sheet: FakeSheet;

  beforeEach(() => {
    pool = new FakePool();
    sheet = new FakeSheet();
  });

  it("1a exportacao: exporta todo o historico ja existente no Neon (regra 6), inclusive paginando alem de um lote", async () => {
    for (let i = 0; i < 3; i++) {
      pool.rows.push(row({ id: `id-${i}`, external_id: `${i}`, primeira_captura_em: `2026-01-0${i + 1}T00:00:00.000Z` }));
    }

    const resultado = await sincronizarPlanilha({
      pool,
      garantirCabecalho: sheet.garantirCabecalho,
      listarListingIdsExistentes: sheet.listarListingIdsExistentes,
      acrescentarLinhas: sheet.acrescentarLinhas,
      tamanhoLote: 2, // forca paginacao (2 + 1) mesmo com poucas linhas no teste
    });

    expect(resultado.totalExportado).toBe(3);
    expect(sheet.linhas).toHaveLength(3);
    expect(pool.rows.every((r) => r.sheets_exportado_em !== null)).toBe(true);
  });

  it("regra 7: 2a execucao so acrescenta anuncios ainda nao exportados, sem duplicar os ja enviados", async () => {
    pool.rows.push(row({ id: "id-1", external_id: "1" }));
    await sincronizarPlanilha({
      pool,
      garantirCabecalho: sheet.garantirCabecalho,
      listarListingIdsExistentes: sheet.listarListingIdsExistentes,
      acrescentarLinhas: sheet.acrescentarLinhas,
    });
    expect(sheet.linhas).toHaveLength(1);

    // novo anuncio aparece depois, o antigo continua marcado como exportado
    pool.rows.push(row({ id: "id-2", external_id: "2" }));
    const segunda = await sincronizarPlanilha({
      pool,
      garantirCabecalho: sheet.garantirCabecalho,
      listarListingIdsExistentes: sheet.listarListingIdsExistentes,
      acrescentarLinhas: sheet.acrescentarLinhas,
    });

    expect(segunda.totalExportado).toBe(1);
    expect(sheet.linhas).toHaveLength(2); // nao duplicou a linha do id-1
    const idsNaPlanilha = sheet.linhas.map((l) => l[l.length - 3]);
    expect(idsNaPlanilha).toEqual(["id-1", "id-2"]);
  });

  it("regra 8: falha depois do append e antes do UPDATE no Neon nao duplica a linha na proxima execucao", async () => {
    pool.rows.push(row({ id: "id-1", external_id: "1" }));

    // Simula o crash: o append() no Sheets teve sucesso (linha ja fica
    // gravada no fake), mas o UPDATE que marcaria sheets_exportado_em nunca
    // roda porque o processo "morre" logo depois - simulado chamando
    // acrescentarLinhas diretamente e nunca chamando o UPDATE.
    await sheet.acrescentarLinhas([
      ["", "1", "Imobiliaria A", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "nao", "id-1", "site_a", "chave-1"],
    ]);
    expect(pool.rows[0].sheets_exportado_em).toBeNull(); // Neon ainda nao foi marcado - exatamente o cenario da falha parcial

    const resultado = await sincronizarPlanilha({
      pool,
      garantirCabecalho: sheet.garantirCabecalho,
      listarListingIdsExistentes: sheet.listarListingIdsExistentes,
      acrescentarLinhas: sheet.acrescentarLinhas,
    });

    expect(resultado.totalExportado).toBe(0); // reconhecido como ja presente, nao reenviado
    expect(resultado.totalReconciliado).toBe(1);
    expect(sheet.linhas).toHaveLength(1); // continua com uma unica linha, sem duplicata
    expect(pool.rows[0].sheets_exportado_em).not.toBeNull(); // Neon foi reconciliado nesta execucao
  });

  it("regra 4/8: anuncio ja presente na planilha com sheets_exportado_em nulo no Neon nao gera 2a linha", async () => {
    pool.rows.push(row({ id: "id-1", external_id: "1", sheets_exportado_em: null }));
    sheet.linhas.push([
      "", "1", "Imobiliaria A", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "nao", "id-1", "site_a", "chave-1",
    ]);

    await sincronizarPlanilha({
      pool,
      garantirCabecalho: sheet.garantirCabecalho,
      listarListingIdsExistentes: sheet.listarListingIdsExistentes,
      acrescentarLinhas: sheet.acrescentarLinhas,
    });

    expect(sheet.linhas).toHaveLength(1);
    expect(pool.rows[0].sheets_exportado_em).not.toBeNull();
  });

  it("regras 2/3: a linha exportada usa os valores do snapshot (1a captura), nao os valores atuais/mutaveis", async () => {
    pool.rows.push(
      row({
        id: "id-1",
        external_id: "1",
        preco: "100000", // valor da 1a captura (snapshot)
        titulo: "Titulo da 1a captura",
        status_primeira_captura: "ativo",
        status_atual: "ausente", // ja mudou desde a 1a captura - so aparece na coluna "status atual"
      })
    );

    await sincronizarPlanilha({
      pool,
      garantirCabecalho: sheet.garantirCabecalho,
      listarListingIdsExistentes: sheet.listarListingIdsExistentes,
      acrescentarLinhas: sheet.acrescentarLinhas,
    });

    const linha = sheet.linhas[0];
    expect(linha[0]).toBe("2026-01-01"); // primeira captura em (snapshot, agora a 1a coluna)
    expect(linha[3]).toBe("Titulo da 1a captura"); // titulo (snapshot)
    expect(linha[6]).toBe(100000); // preco (snapshot)
    expect(linha[14]).toBe("ativo"); // status na 1a captura (snapshot)
    expect(linha[15]).toBe("ausente"); // status atual (momento da exportacao, coluna separada)
  });

  it("regra 5: colunas de auditoria (listing_id, site_id, identity_key) vao ao final da linha", async () => {
    pool.rows.push(row({ id: "id-1", site_id: "site_a", identity_key: "chave-xyz", external_id: "1" }));

    await sincronizarPlanilha({
      pool,
      garantirCabecalho: sheet.garantirCabecalho,
      listarListingIdsExistentes: sheet.listarListingIdsExistentes,
      acrescentarLinhas: sheet.acrescentarLinhas,
    });

    const linha = sheet.linhas[0];
    expect(linha.slice(-3)).toEqual(["id-1", "site_a", "chave-xyz"]);
  });

  it("regra 9: falha no Google Sheets nao marca nada como exportado no Neon (nenhum UPDATE espurio)", async () => {
    pool.rows.push(row({ id: "id-1", external_id: "1" }));
    sheet.falharNoProximoAppend = true;

    await expect(
      sincronizarPlanilha({
        pool,
        garantirCabecalho: sheet.garantirCabecalho,
        listarListingIdsExistentes: sheet.listarListingIdsExistentes,
        acrescentarLinhas: sheet.acrescentarLinhas,
      })
    ).rejects.toThrow("falha simulada");

    expect(pool.updateCalls).toBe(0);
    expect(pool.rows[0].sheets_exportado_em).toBeNull(); // Neon intacto, anuncio continua pendente para a proxima tentativa
    expect(sheet.linhas).toHaveLength(0);
  });
});
