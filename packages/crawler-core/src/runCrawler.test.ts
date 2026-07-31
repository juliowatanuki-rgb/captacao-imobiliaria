import { describe, expect, it, beforeEach } from "vitest";
import type { ScrapedListing } from "@captacao/shared";
import { crawlSite } from "./runCrawler.js";

/**
 * Fake in-memory de um pg.Pool (com .connect() retornando um client) para
 * testar crawlSite de ponta a ponta, incluindo a protecao contra coleta
 * anomala (secao "coleta com erro/timeout/bloqueio/0 resultados/quantidade
 * anormalmente baixa nao pode incrementar o contador de ausencia").
 * Nao e um banco de verdade, mas cobre a mesma semantica das queries reais
 * emitidas por crawlSite/upsertListingsBatch/markAbsentListings.
 */
class FakePool {
  listings: any[] = [];
  events: { listing_id: string; tipo: string }[] = [];
  siteCrawlRuns: any[] = [];
  private nextListingId = 1;
  private nextRunId = 1;

  async query(text: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
    if (text.includes("INSERT INTO site_crawl_runs") && text.includes("RETURNING id")) {
      const [crawlRunId, siteId, inicioEm] = params;
      const id = `run-${this.nextRunId++}`;
      this.siteCrawlRuns.push({ id, crawl_run_id: crawlRunId, site_id: siteId, inicio_em: inicioEm, status: "erro" });
      return { rows: [{ id }], rowCount: 1 };
    }

    if (text.includes("count(*)::text AS total") && text.includes("FROM listings")) {
      const [siteId] = params;
      const doSite = this.listings.filter((r) => r.site_id === siteId);
      const rastreados = doSite.filter((r) => r.status === "ativo" || r.status === "ausente").length;
      return { rows: [{ total: String(doSite.length), rastreados: String(rastreados) }], rowCount: 1 };
    }

    if (text.includes("UPDATE site_crawl_runs SET") && text.includes("status = 'sucesso'")) {
      const [id, fimEm, paginasVisitadas, encontrados, novos, existentes, atualizados, ausentes, semAlteracao, duplicados] = params;
      const run = this.siteCrawlRuns.find((r) => r.id === id);
      Object.assign(run, {
        fim_em: fimEm,
        status: "sucesso",
        paginas_visitadas: paginasVisitadas,
        anuncios_encontrados: encontrados,
        anuncios_novos: novos,
        anuncios_existentes: existentes,
        anuncios_atualizados: atualizados,
        anuncios_ausentes: ausentes,
        anuncios_sem_alteracao: semAlteracao,
        anuncios_duplicados_coleta: duplicados,
      });
      return { rows: [], rowCount: 1 };
    }

    if (text.includes("UPDATE site_crawl_runs SET") && text.includes("status = 'erro'")) {
      const [id, fimEm, mensagemErro, detalheTecnico] = params;
      const run = this.siteCrawlRuns.find((r) => r.id === id);
      Object.assign(run, { fim_em: fimEm, status: "erro", mensagem_erro: mensagemErro, detalhe_tecnico: detalheTecnico });
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`FakePool.query: query nao reconhecida: ${text.slice(0, 120)}`);
  }

  async connect() {
    const pool = this;
    return {
      async query(text: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
        return fakeClientQuery(pool, text, params);
      },
      release() {},
    };
  }
}

// Reaproveita a mesma logica de query do FakeListingsClient usado em
// upsertListing.test.ts, mas operando direto sobre os arrays do FakePool
// (para que a SELECT de contagem em crawlSite enxergue o que o client grava
// na mesma "transacao").
function fakeClientQuery(pool: FakePool, text: string, params: any[]): { rows: any[]; rowCount: number } {
  if (text.includes("BEGIN") || text.includes("COMMIT") || text.includes("ROLLBACK")) {
    return { rows: [], rowCount: 0 };
  }

  if (text.includes("FROM listings") && text.includes("identity_key = ANY($2::text[])")) {
    const [siteId, identityKeys] = params;
    const matched = pool.listings.filter((r) => r.site_id === siteId && identityKeys.includes(r.identity_key));
    return { rows: matched.map((r) => ({ ...r })), rowCount: matched.length };
  }

  if (text.includes("INSERT INTO listings (") && text.includes("ON CONFLICT (site_id, identity_key) DO NOTHING")) {
    const [
      siteId, identityType, identityKey, identityConfidence, externalId, urlOriginal, urlFinal,
      urlNormalizada, urlHash, fingerprint, titulo, tipoImovel, cidade, bairro, preco, areaUtil,
      dormitorios, suites, banheiros, vagas, condominioNome, endereco, descricao, analysisStatus,
    ] = params;
    const inserted: any[] = [];
    let nextId = pool.listings.length + 1;
    for (let i = 0; i < identityKey.length; i++) {
      if (pool.listings.some((r) => r.site_id === siteId && r.identity_key === identityKey[i])) continue;
      const row = {
        id: `listing-${nextId++}`,
        site_id: siteId,
        identity_type: identityType[i],
        identity_key: identityKey[i],
        identity_confidence: identityConfidence[i],
        external_id: externalId[i],
        url_original: urlOriginal[i],
        url_final: urlFinal[i],
        url_normalizada: urlNormalizada[i],
        url_hash: urlHash[i],
        fingerprint: fingerprint[i],
        titulo: titulo[i],
        tipo_imovel: tipoImovel[i],
        cidade: cidade[i],
        bairro: bairro[i],
        preco: preco[i],
        area_util: areaUtil[i],
        dormitorios: dormitorios[i],
        suites: suites[i],
        banheiros: banheiros[i],
        vagas: vagas[i],
        condominio_nome: condominioNome[i],
        endereco: endereco[i],
        descricao: descricao[i],
        analysis_status: analysisStatus[i],
        status: "ativo",
        ausente_desde: null,
        coletas_ausente_consecutivas: 0,
      };
      pool.listings.push(row);
      inserted.push({ id: row.id, identity_key: row.identity_key });
    }
    return { rows: inserted, rowCount: inserted.length };
  }

  if (text.includes("UPDATE listings AS l SET") && text.includes("ultima_captura_em = now()")) {
    const [ids, urlOriginal, urlFinal, titulo, tipoImovel, cidade, bairro, preco, areaUtil, dormitorios, suites, banheiros, vagas, condominioNome, endereco, descricao] = params;
    for (let i = 0; i < ids.length; i++) {
      const row = pool.listings.find((r) => r.id === ids[i]);
      if (!row) continue;
      Object.assign(row, {
        url_original: urlOriginal[i], url_final: urlFinal[i], titulo: titulo[i], tipo_imovel: tipoImovel[i],
        cidade: cidade[i], bairro: bairro[i], preco: preco[i], area_util: areaUtil[i], dormitorios: dormitorios[i],
        suites: suites[i], banheiros: banheiros[i], vagas: vagas[i], condominio_nome: condominioNome[i],
        endereco: endereco[i], descricao: descricao[i], status: "ativo", ausente_desde: null, coletas_ausente_consecutivas: 0,
      });
    }
    return { rows: [], rowCount: ids.length };
  }

  if (text.includes("INSERT INTO listing_events") && text.includes("SELECT unnest($1::uuid[]), $2")) {
    const [ids, tipo] = params;
    for (const id of ids) pool.events.push({ listing_id: id, tipo });
    return { rows: [], rowCount: ids.length };
  }

  if (text.includes("INSERT INTO listing_first_snapshot")) {
    const [ids] = params;
    return { rows: [], rowCount: ids.length };
  }

  if (text.includes("INSERT INTO listing_events") && text.includes("'updated'")) {
    const [ids] = params;
    for (const id of ids) pool.events.push({ listing_id: id, tipo: "updated" });
    return { rows: [], rowCount: ids.length };
  }

  if (text.includes("status IN ('ativo', 'ausente') AND NOT")) {
    const [siteId, seenIds] = params;
    const matched = pool.listings.filter(
      (r) => r.site_id === siteId && (r.status === "ativo" || r.status === "ausente") && !seenIds.includes(r.id)
    );
    return {
      rows: matched.map((r) => ({ id: r.id, coletas_ausente_consecutivas: r.coletas_ausente_consecutivas })),
      rowCount: matched.length,
    };
  }

  if (text.includes("coletas_ausente_consecutivas = t.coletas")) {
    const [ids, statuses, coletas] = params;
    for (let i = 0; i < ids.length; i++) {
      const row = pool.listings.find((r) => r.id === ids[i]);
      if (!row) continue;
      row.status = statuses[i];
      row.ausente_desde = row.ausente_desde ?? new Date();
      row.coletas_ausente_consecutivas = coletas[i];
    }
    return { rows: [], rowCount: ids.length };
  }

  if (text.includes("INSERT INTO listing_events") && text.includes("unnest($2::text[])")) {
    const [ids, tipos] = params;
    for (let i = 0; i < ids.length; i++) pool.events.push({ listing_id: ids[i], tipo: tipos[i] });
    return { rows: [], rowCount: ids.length };
  }

  throw new Error(`fakeClientQuery: query nao reconhecida: ${text.slice(0, 120)}`);
}

const urlBase = "https://www.exemplo.com.br";

function scraped(externalId: string): ScrapedListing {
  return {
    urlOriginal: `https://www.exemplo.com.br/imovel/${externalId}`,
    externalId,
    titulo: "Apartamento a Venda",
    preco: 300000,
  };
}

describe("crawlSite - protecao contra coleta anomala", () => {
  let pool: FakePool;

  beforeEach(() => {
    pool = new FakePool();
  });

  async function seed(siteId: string, quantidade: number) {
    const listings = Array.from({ length: quantidade }, (_, i) => scraped(`seed-${i}`));
    await crawlSite({
      pool: pool as any,
      crawlRunId: "crawl-1",
      siteId,
      urlBase,
      scrape: async () => ({ listings, paginasVisitadas: 1 }),
    });
  }

  it("1a coleta (base inicial) grava normalmente mesmo com poucos anuncios", async () => {
    const result = await crawlSite({
      pool: pool as any,
      crawlRunId: "crawl-1",
      siteId: "site_a",
      urlBase,
      scrape: async () => ({ listings: [scraped("1")], paginasVisitadas: 1 }),
    });
    expect(result.status).toBe("sucesso");
    expect(result.anunciosNovos).toBe(1);
  });

  it("aborta sem gravar e sem incrementar ausencia quando a coleta encontra 0 anuncios", async () => {
    await seed("site_a", 10);
    const before = pool.listings.map((r) => ({ ...r }));

    const result = await crawlSite({
      pool: pool as any,
      crawlRunId: "crawl-2",
      siteId: "site_a",
      urlBase,
      scrape: async () => ({ listings: [], paginasVisitadas: 1 }),
    });

    expect(result.status).toBe("erro");
    expect(pool.listings).toEqual(before);
    expect(pool.listings.every((r) => r.coletas_ausente_consecutivas === 0)).toBe(true);
  });

  it("aborta sem gravar quando a coleta encontra quantidade anormalmente baixa (< 50% do rastreado)", async () => {
    await seed("site_a", 10);
    const before = pool.listings.map((r) => ({ ...r }));

    // so 3 de 10 - bem abaixo do limiar de 50%, cheira a bloqueio/timeout parcial
    const result = await crawlSite({
      pool: pool as any,
      crawlRunId: "crawl-2",
      siteId: "site_a",
      urlBase,
      scrape: async () => ({ listings: [scraped("seed-0"), scraped("seed-1"), scraped("seed-2")], paginasVisitadas: 1 }),
    });

    expect(result.status).toBe("erro");
    expect(pool.listings).toEqual(before);
  });

  it("uma coleta que lanca excecao (erro/timeout) nao incrementa nenhum contador de ausencia", async () => {
    await seed("site_a", 5);
    const before = pool.listings.map((r) => ({ ...r }));

    const result = await crawlSite({
      pool: pool as any,
      crawlRunId: "crawl-2",
      siteId: "site_a",
      urlBase,
      scrape: async () => {
        throw new Error("timeout de navegacao");
      },
    });

    expect(result.status).toBe("erro");
    expect(result.mensagemErro).toContain("timeout");
    expect(pool.listings).toEqual(before);
  });

  it("uma coleta valida com queda real (>=50%) ainda marca ausencia normalmente", async () => {
    await seed("site_a", 10);

    // 6 de 10 (60%) - acima do limiar, considerada uma queda real do inventario
    const encontrados = Array.from({ length: 6 }, (_, i) => scraped(`seed-${i}`));
    const result = await crawlSite({
      pool: pool as any,
      crawlRunId: "crawl-2",
      siteId: "site_a",
      urlBase,
      scrape: async () => ({ listings: encontrados, paginasVisitadas: 1 }),
    });

    expect(result.status).toBe("sucesso");
    expect(result.anunciosAusentes).toBe(4);
    const ausentes = pool.listings.filter((r) => r.status === "ausente");
    expect(ausentes).toHaveLength(4);
    expect(ausentes.every((r) => r.coletas_ausente_consecutivas === 1)).toBe(true);
  });

  it("2 coletas validas consecutivas sem um anuncio levam ausente -> removido de ponta a ponta", async () => {
    await seed("site_a", 4);
    const rodar = (ids: string[]) =>
      crawlSite({
        pool: pool as any,
        crawlRunId: "crawl-x",
        siteId: "site_a",
        urlBase,
        scrape: async () => ({ listings: ids.map(scraped), paginasVisitadas: 1 }),
      });

    // 1a falta do seed-3 (3 de 4 = 75%, acima do limiar)
    await rodar(["seed-0", "seed-1", "seed-2"]);
    const apos1 = pool.listings.find((r) => r.external_id === "seed-3");
    expect(apos1.status).toBe("ausente");
    expect(apos1.coletas_ausente_consecutivas).toBe(1);

    // 2a falta consecutiva do seed-3
    await rodar(["seed-0", "seed-1", "seed-2"]);
    const apos2 = pool.listings.find((r) => r.external_id === "seed-3");
    expect(apos2.status).toBe("removido");
    expect(apos2.coletas_ausente_consecutivas).toBe(2);
  });
});
