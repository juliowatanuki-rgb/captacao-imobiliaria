import { describe, expect, it, beforeEach } from "vitest";
import type { ScrapedListing } from "@captacao/shared";
import { markAbsentListings, upsertListing, upsertListingsBatch } from "./upsertListing.js";

/**
 * Fake in-memory de um pg.PoolClient, suficiente para exercitar exatamente
 * as queries emitidas por upsertListing(s)Batch/markAbsentListings (nao um
 * banco de verdade, mas cobre a mesma semantica: unique(site_id, identity_key),
 * ON CONFLICT DO NOTHING, updates em lote via unnest e o log de eventos).
 * Isso permite provar as garantias pedidas (sem perda, sem duplicidade, sem
 * falso "novo") sem depender do Neon nos testes.
 */
class FakeListingsClient {
  rows: any[] = [];
  events: { listing_id: string; tipo: string }[] = [];
  queryLog: string[] = [];
  private nextId = 1;

  async query(text: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
    this.queryLog.push(text);

    if (text.includes("BEGIN") || text.includes("COMMIT") || text.includes("ROLLBACK")) {
      return { rows: [], rowCount: 0 };
    }

    // upsertListingsBatch: SELECT existente por site_id + identity_key (lote)
    if (text.includes("FROM listings") && text.includes("identity_key = ANY($2::text[])")) {
      const [siteId, identityKeys] = params;
      const matched = this.rows.filter((r) => r.site_id === siteId && identityKeys.includes(r.identity_key));
      return { rows: matched.map((r) => ({ ...r })), rowCount: matched.length };
    }

    // upsertListingsBatch: INSERT em lote com ON CONFLICT DO NOTHING
    if (text.includes("INSERT INTO listings (") && text.includes("ON CONFLICT (site_id, identity_key) DO NOTHING")) {
      const [
        siteId,
        identityType,
        identityKey,
        identityConfidence,
        externalId,
        urlOriginal,
        urlFinal,
        urlNormalizada,
        urlHash,
        fingerprint,
        titulo,
        tipoImovel,
        cidade,
        bairro,
        preco,
        areaUtil,
        dormitorios,
        suites,
        banheiros,
        vagas,
        condominioNome,
        endereco,
        descricao,
        analysisStatus,
      ] = params;

      const inserted: any[] = [];
      for (let i = 0; i < identityKey.length; i++) {
        const conflict = this.rows.some((r) => r.site_id === siteId && r.identity_key === identityKey[i]);
        if (conflict) continue;
        const row = {
          id: `id-${this.nextId++}`,
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
        this.rows.push(row);
        inserted.push({ id: row.id, identity_key: row.identity_key });
      }
      return { rows: inserted, rowCount: inserted.length };
    }

    // upsertListingsBatch: UPDATE em lote dos que mudaram
    if (text.includes("UPDATE listings AS l SET") && text.includes("ultima_captura_em = now()")) {
      const [
        ids,
        urlOriginal,
        urlFinal,
        titulo,
        tipoImovel,
        cidade,
        bairro,
        preco,
        areaUtil,
        dormitorios,
        suites,
        banheiros,
        vagas,
        condominioNome,
        endereco,
        descricao,
      ] = params;
      for (let i = 0; i < ids.length; i++) {
        const row = this.rows.find((r) => r.id === ids[i]);
        if (!row) continue;
        Object.assign(row, {
          url_original: urlOriginal[i],
          url_final: urlFinal[i],
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
          status: "ativo",
          ausente_desde: null,
          coletas_ausente_consecutivas: 0,
        });
      }
      return { rows: [], rowCount: ids.length };
    }

    // upsertListingsBatch: eventos de insercao (created_from_initial_seed / created_as_new)
    if (text.includes("INSERT INTO listing_events") && text.includes("SELECT unnest($1::uuid[]), $2")) {
      const [ids, tipo] = params;
      for (const id of ids) this.events.push({ listing_id: id, tipo });
      return { rows: [], rowCount: ids.length };
    }

    // upsertListingsBatch: eventos de update
    if (text.includes("INSERT INTO listing_events") && text.includes("'updated'")) {
      const [ids] = params;
      for (const id of ids) this.events.push({ listing_id: id, tipo: "updated" });
      return { rows: [], rowCount: ids.length };
    }

    // markAbsentListings: quem ainda esta ativo e nao foi visto
    if (text.includes("status = 'ativo' AND NOT")) {
      const [siteId, seenIds] = params;
      const matched = this.rows.filter(
        (r) => r.site_id === siteId && r.status === "ativo" && !seenIds.includes(r.id)
      );
      return {
        rows: matched.map((r) => ({ id: r.id, coletas_ausente_consecutivas: r.coletas_ausente_consecutivas })),
        rowCount: matched.length,
      };
    }

    // markAbsentListings: UPDATE em lote de ausencia
    if (text.includes("coletas_ausente_consecutivas = t.coletas")) {
      const [ids, statuses, coletas] = params;
      for (let i = 0; i < ids.length; i++) {
        const row = this.rows.find((r) => r.id === ids[i]);
        if (!row) continue;
        row.status = statuses[i];
        row.ausente_desde = row.ausente_desde ?? new Date();
        row.coletas_ausente_consecutivas = coletas[i];
      }
      return { rows: [], rowCount: ids.length };
    }

    // markAbsentListings: eventos de ausencia/remocao
    if (text.includes("INSERT INTO listing_events") && text.includes("unnest($2::text[])")) {
      const [ids, tipos] = params;
      for (let i = 0; i < ids.length; i++) this.events.push({ listing_id: ids[i], tipo: tipos[i] });
      return { rows: [], rowCount: ids.length };
    }

    throw new Error(`FakeListingsClient: query nao reconhecida: ${text.slice(0, 120)}`);
  }
}

const urlBase = "https://www.exemplo.com.br";

function scraped(overrides: Partial<ScrapedListing> = {}): ScrapedListing {
  return {
    urlOriginal: "https://www.exemplo.com.br/imovel/1",
    externalId: "1",
    titulo: "Apartamento a Venda com 2 quartos",
    tipoImovel: "Apartamento",
    cidade: "Praia Grande",
    bairro: "Boqueirao",
    preco: 300000,
    areaUtil: 60,
    dormitorios: 2,
    vagas: 1,
    banheiros: 1,
    ...overrides,
  };
}

describe("upsertListingsBatch", () => {
  let client: FakeListingsClient;

  beforeEach(() => {
    client = new FakeListingsClient();
  });

  it("insere anuncios novos como base inicial sem fila de novos (analysis_status=analisado)", async () => {
    const listings = [scraped({ externalId: "1" }), scraped({ externalId: "2", urlOriginal: "https://www.exemplo.com.br/imovel/2" })];
    const summary = await upsertListingsBatch(client as any, "site_a", listings, urlBase, true);

    expect(summary.anunciosNovos).toBe(2);
    expect(summary.anunciosAtualizados).toBe(0);
    expect(summary.anunciosSemAlteracao).toBe(0);
    expect(client.rows.every((r) => r.analysis_status === "analisado")).toBe(true);
    expect(client.events.filter((e) => e.tipo === "created_from_initial_seed")).toHaveLength(2);
  });

  it("marca como pendente (fila de novos) quando NAO e a coleta inicial", async () => {
    const summary = await upsertListingsBatch(client as any, "site_a", [scraped({ externalId: "9" })], urlBase, false);
    expect(summary.anunciosNovos).toBe(1);
    expect(client.rows[0].analysis_status).toBe("pendente");
    expect(client.events[0].tipo).toBe("created_as_new");
  });

  it("descarta duplicatas de site_id+identity_key na MESMA coleta sem criar linhas duplicadas", async () => {
    const listings = [
      scraped({ externalId: "5", preco: 100000 }),
      scraped({ externalId: "5", preco: 105000 }), // mesma identidade, apareceu 2x na mesma varredura
    ];
    const summary = await upsertListingsBatch(client as any, "site_a", listings, urlBase, true);

    expect(summary.duplicadosNaColeta).toBe(1);
    expect(summary.anunciosNovos).toBe(1);
    expect(client.rows).toHaveLength(1);
    expect(Number(client.rows[0].preco)).toBe(105000); // fica com a ultima ocorrencia
    expect(summary.results).toHaveLength(1);
  });

  it("nao toca no banco quando nada relevante mudou (2a execucao identica a 1a)", async () => {
    const listing = scraped({ externalId: "7" });
    await upsertListingsBatch(client as any, "site_a", [listing], urlBase, true);
    client.queryLog = [];
    client.events = [];

    const summary = await upsertListingsBatch(client as any, "site_a", [listing], urlBase, false);

    expect(summary.anunciosNovos).toBe(0);
    expect(summary.anunciosAtualizados).toBe(0);
    expect(summary.anunciosSemAlteracao).toBe(1);
    // nenhuma query de INSERT/UPDATE em listings ou listing_events deveria ter sido emitida
    const wroteToDb = client.queryLog.some(
      (q) => q.includes("INSERT INTO listings") || q.includes("UPDATE listings AS l SET") || q.includes("INSERT INTO listing_events")
    );
    expect(wroteToDb).toBe(false);
    expect(client.events).toHaveLength(0);
  });

  it("atualiza (e gera evento 'updated') apenas quando um campo relevante realmente mudou", async () => {
    const listing = scraped({ externalId: "8", preco: 100000 });
    await upsertListingsBatch(client as any, "site_a", [listing], urlBase, true);

    const summary = await upsertListingsBatch(client as any, "site_a", [scraped({ externalId: "8", preco: 250000 })], urlBase, false);

    expect(summary.anunciosNovos).toBe(0);
    expect(summary.anunciosAtualizados).toBe(1);
    expect(summary.anunciosSemAlteracao).toBe(0);
    expect(Number(client.rows[0].preco)).toBe(250000);
    expect(client.events.filter((e) => e.tipo === "updated")).toHaveLength(1);
  });

  it("ao reaparecer, reativa um anuncio marcado ausente mesmo com dados identicos (conta como mudanca)", async () => {
    const listing = scraped({ externalId: "10" });
    await upsertListingsBatch(client as any, "site_a", [listing], urlBase, true);
    client.rows[0].status = "ausente";
    client.rows[0].ausente_desde = new Date();
    client.rows[0].coletas_ausente_consecutivas = 1;

    const summary = await upsertListingsBatch(client as any, "site_a", [listing], urlBase, false);

    expect(summary.anunciosAtualizados).toBe(1);
    expect(summary.anunciosSemAlteracao).toBe(0);
    expect(client.rows[0].status).toBe("ativo");
    expect(client.rows[0].ausente_desde).toBeNull();
    expect(client.rows[0].coletas_ausente_consecutivas).toBe(0);
  });

  it("nunca mistura identity_key entre sites diferentes", async () => {
    const listingSiteA = scraped({ externalId: "1" });
    const listingSiteB = scraped({ externalId: "1" }); // mesmo codigo, imobiliaria diferente
    await upsertListingsBatch(client as any, "site_a", [listingSiteA], urlBase, true);
    const summaryB = await upsertListingsBatch(client as any, "site_b", [listingSiteB], urlBase, true);

    expect(summaryB.anunciosNovos).toBe(1);
    expect(client.rows).toHaveLength(2);
    expect(new Set(client.rows.map((r) => r.id)).size).toBe(2);
  });

  it("upsertListing (uso pontual, um item) delega para upsertListingsBatch com o mesmo resultado", async () => {
    const result = await upsertListing(client as any, "site_a", scraped({ externalId: "20" }), urlBase, true);
    expect(result.outcome).toBe("novo");
    const again = await upsertListing(client as any, "site_a", scraped({ externalId: "20" }), urlBase, false);
    expect(again.outcome).toBe("atualizado"); // sem_alteracao e reportado como "atualizado" nessa API pontual
  });
});

describe("markAbsentListings (em lote)", () => {
  let client: FakeListingsClient;

  beforeEach(() => {
    client = new FakeListingsClient();
  });

  it("marca ausente (nao removido) no 1o sumico de um anuncio que estava ativo", async () => {
    const listing = scraped({ externalId: "30" });
    await upsertListingsBatch(client as any, "site_a", [listing], urlBase, true);
    const listingId = client.rows[0].id;

    const result = await markAbsentListings(client as any, "site_a", []);
    expect(result.marcadosAusentes).toBe(1);
    expect(client.rows[0].status).toBe("ausente");
    expect(client.rows[0].coletas_ausente_consecutivas).toBe(1);
    expect(client.events.filter((e) => e.listing_id === listingId && e.tipo === "marked_absent")).toHaveLength(1);
  });

  it("passa para removido quando ja vinha de uma falta consecutiva (coletas_ausente_consecutivas=1)", async () => {
    // Idem ao comportamento anterior a otimizacao (nao alterado aqui): esta
    // funcao so reavalia quem esta com status='ativo', entao este cenario
    // simula o estado que markAbsentListings encontraria numa 2a falta
    // consecutiva antes de virar 'ausente' na rodada anterior.
    const listing = scraped({ externalId: "32" });
    await upsertListingsBatch(client as any, "site_a", [listing], urlBase, true);
    client.rows[0].coletas_ausente_consecutivas = 1;

    const result = await markAbsentListings(client as any, "site_a", []);
    expect(result.marcadosAusentes).toBe(1);
    expect(client.rows[0].status).toBe("removido");
    expect(client.rows[0].coletas_ausente_consecutivas).toBe(2);
    expect(client.events.some((e) => e.tipo === "marked_removed")).toBe(true);
  });

  it("nao marca ausente quem foi visto nesta coleta", async () => {
    const listing = scraped({ externalId: "31" });
    await upsertListingsBatch(client as any, "site_a", [listing], urlBase, true);
    const listingId = client.rows[0].id;

    const result = await markAbsentListings(client as any, "site_a", [listingId]);
    expect(result.marcadosAusentes).toBe(0);
    expect(client.rows[0].status).toBe("ativo");
  });
});
