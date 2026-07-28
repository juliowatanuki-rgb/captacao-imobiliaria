import type pg from "pg";
import type { ScrapedListing } from "@captacao/shared";
import { resolveIdentity } from "./identity.js";
import type { NormalizeUrlOptions } from "./urlNormalize.js";

export type UpsertOutcome = "novo" | "atualizado";

export interface UpsertResult {
  listingId: string;
  outcome: UpsertOutcome;
}

/**
 * Insere ou atualiza um anuncio dentro de uma imobiliaria, respeitando a
 * constraint unique(site_id, identity_key) (secao 12). Nunca cria duplicata:
 * se a chave ja existir, atualiza os dados mutaveis e reseta o rastreamento de ausencia.
 */
export async function upsertListing(
  client: pg.PoolClient,
  siteId: string,
  scraped: ScrapedListing,
  urlBase: string,
  isInitialSeed: boolean,
  urlOptions: NormalizeUrlOptions = {}
): Promise<UpsertResult> {
  const identity = resolveIdentity(scraped, urlBase, urlOptions);
  const analysisStatus = isInitialSeed ? "analisado" : "pendente";

  const insertResult = await client.query<{ id: string }>(
    `INSERT INTO listings (
      site_id, identity_type, identity_key, identity_confidence,
      external_id, url_original, url_final, url_normalizada, url_hash, fingerprint,
      titulo, tipo_imovel, cidade, bairro, preco, area_util,
      dormitorios, suites, banheiros, vagas, condominio_nome, endereco, descricao,
      analysis_status
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16,
      $17, $18, $19, $20, $21, $22, $23,
      $24
    )
    ON CONFLICT (site_id, identity_key) DO NOTHING
    RETURNING id`,
    [
      siteId,
      identity.identityType,
      identity.identityKey,
      identity.identityConfidence,
      scraped.externalId ?? null,
      scraped.urlOriginal,
      scraped.urlFinal ?? null,
      identity.urlNormalizada,
      identity.urlHash,
      identity.fingerprint,
      scraped.titulo ?? null,
      scraped.tipoImovel ?? null,
      scraped.cidade ?? null,
      scraped.bairro ?? null,
      scraped.preco ?? null,
      scraped.areaUtil ?? null,
      scraped.dormitorios ?? null,
      scraped.suites ?? null,
      scraped.banheiros ?? null,
      scraped.vagas ?? null,
      scraped.condominioNome ?? null,
      scraped.endereco ?? null,
      scraped.descricao ?? null,
      analysisStatus,
    ]
  );

  if (insertResult.rowCount === 1) {
    const listingId = insertResult.rows[0].id;
    await client.query(
      `INSERT INTO listing_events (listing_id, tipo, detalhe)
       VALUES ($1, $2, $3)`,
      [
        listingId,
        isInitialSeed ? "created_from_initial_seed" : "created_as_new",
        null,
      ]
    );
    return { listingId, outcome: "novo" };
  }

  const existing = await client.query<{ id: string }>(
    `SELECT id FROM listings WHERE site_id = $1 AND identity_key = $2`,
    [siteId, identity.identityKey]
  );
  const listingId = existing.rows[0].id;

  await client.query(
    `UPDATE listings SET
      url_original = $2,
      url_final = $3,
      titulo = $4,
      tipo_imovel = $5,
      cidade = $6,
      bairro = $7,
      preco = $8,
      area_util = $9,
      dormitorios = $10,
      suites = $11,
      banheiros = $12,
      vagas = $13,
      condominio_nome = $14,
      endereco = $15,
      descricao = $16,
      ultima_captura_em = now(),
      status = 'ativo',
      ausente_desde = null,
      coletas_ausente_consecutivas = 0
     WHERE id = $1`,
    [
      listingId,
      scraped.urlOriginal,
      scraped.urlFinal ?? null,
      scraped.titulo ?? null,
      scraped.tipoImovel ?? null,
      scraped.cidade ?? null,
      scraped.bairro ?? null,
      scraped.preco ?? null,
      scraped.areaUtil ?? null,
      scraped.dormitorios ?? null,
      scraped.suites ?? null,
      scraped.banheiros ?? null,
      scraped.vagas ?? null,
      scraped.condominioNome ?? null,
      scraped.endereco ?? null,
      scraped.descricao ?? null,
    ]
  );

  await client.query(
    `INSERT INTO listing_events (listing_id, tipo) VALUES ($1, 'updated')`,
    [listingId]
  );

  return { listingId, outcome: "atualizado" };
}

/**
 * Marca como ausentes os anuncios ativos de um site que nao apareceram na coleta atual.
 * So passa a status 'removido' depois de mais de uma coleta consecutiva sem encontrar (secao 6).
 */
export async function markAbsentListings(
  client: pg.PoolClient,
  siteId: string,
  seenListingIds: string[]
): Promise<{ marcadosAusentes: number }> {
  const stillActive = await client.query<{ id: string; coletas_ausente_consecutivas: number }>(
    `SELECT id, coletas_ausente_consecutivas FROM listings
     WHERE site_id = $1 AND status = 'ativo' AND NOT (id = ANY($2::uuid[]))`,
    [siteId, seenListingIds]
  );

  for (const row of stillActive.rows) {
    const novasColetasAusente = row.coletas_ausente_consecutivas + 1;
    const removido = novasColetasAusente > 1;

    await client.query(
      `UPDATE listings SET
        status = $2,
        ausente_desde = COALESCE(ausente_desde, now()),
        coletas_ausente_consecutivas = $3
       WHERE id = $1`,
      [row.id, removido ? "removido" : "ausente", novasColetasAusente]
    );

    await client.query(
      `INSERT INTO listing_events (listing_id, tipo) VALUES ($1, $2)`,
      [row.id, removido ? "marked_removed" : "marked_absent"]
    );
  }

  return { marcadosAusentes: stillActive.rowCount ?? 0 };
}
