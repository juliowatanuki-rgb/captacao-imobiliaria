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
 *
 * Mantida (alem de upsertListingsBatch, usada pelo crawlSite) para uso pontual
 * fora do loop principal de coleta.
 */
export async function upsertListing(
  client: pg.PoolClient,
  siteId: string,
  scraped: ScrapedListing,
  urlBase: string,
  isInitialSeed: boolean,
  urlOptions: NormalizeUrlOptions = {}
): Promise<UpsertResult> {
  const results = await upsertListingsBatch(client, siteId, [scraped], urlBase, isInitialSeed, urlOptions);
  const [result] = results.results;
  return { listingId: result.listingId, outcome: result.outcome === "sem_alteracao" ? "atualizado" : result.outcome };
}

export type BatchUpsertOutcome = "novo" | "atualizado" | "sem_alteracao";

export interface BatchUpsertItemResult {
  listingId: string;
  outcome: BatchUpsertOutcome;
}

export interface BatchUpsertSummary {
  results: BatchUpsertItemResult[];
  seenListingIds: string[];
  anunciosNovos: number;
  anunciosAtualizados: number;
  anunciosSemAlteracao: number;
  duplicadosNaColeta: number;
}

interface PreparedItem {
  scraped: ScrapedListing;
  identityKey: string;
  identityType: string;
  identityConfidence: string;
  urlNormalizada: string | null;
  urlHash: string | null;
  fingerprint: string | null;
}

interface ExistingRow {
  id: string;
  url_original: string;
  url_final: string | null;
  titulo: string | null;
  tipo_imovel: string | null;
  cidade: string | null;
  bairro: string | null;
  preco: string | null;
  area_util: string | null;
  dormitorios: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  condominio_nome: string | null;
  endereco: string | null;
  descricao: string | null;
  status: string;
  ausente_desde: Date | null;
  coletas_ausente_consecutivas: number;
  identity_key: string;
}

function textEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null);
}

function numberEqual(a: number | null | undefined, b: string | number | null | undefined): boolean {
  const left = a ?? null;
  const right = b === null || b === undefined ? null : Number(b);
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) < 1e-9;
}

/**
 * Compara os campos mutaveis de um anuncio contra o que ja esta gravado,
 * incluindo o rastreamento de ausencia: um anuncio que reaparece precisa
 * voltar a 'ativo' mesmo que os dados descritivos nao tenham mudado, entao
 * isso conta como "mudou" para efeito de gravar no banco.
 */
function hasRelevantChange(scraped: ScrapedListing, existing: ExistingRow): boolean {
  if (existing.status !== "ativo") return true;
  if (existing.ausente_desde !== null) return true;
  if (existing.coletas_ausente_consecutivas !== 0) return true;

  return !(
    textEqual(scraped.urlOriginal, existing.url_original) &&
    textEqual(scraped.urlFinal ?? null, existing.url_final) &&
    textEqual(scraped.titulo ?? null, existing.titulo) &&
    textEqual(scraped.tipoImovel ?? null, existing.tipo_imovel) &&
    textEqual(scraped.cidade ?? null, existing.cidade) &&
    textEqual(scraped.bairro ?? null, existing.bairro) &&
    numberEqual(scraped.preco ?? null, existing.preco) &&
    numberEqual(scraped.areaUtil ?? null, existing.area_util) &&
    numberEqual(scraped.dormitorios ?? null, existing.dormitorios) &&
    numberEqual(scraped.suites ?? null, existing.suites) &&
    numberEqual(scraped.banheiros ?? null, existing.banheiros) &&
    numberEqual(scraped.vagas ?? null, existing.vagas) &&
    textEqual(scraped.condominioNome ?? null, existing.condominio_nome) &&
    textEqual(scraped.endereco ?? null, existing.endereco) &&
    textEqual(scraped.descricao ?? null, existing.descricao)
  );
}

/**
 * Versao em lote de upsertListing (otimizacao da 2a+ execucao - antes cada
 * anuncio gastava varias idas ao banco em serie, o que tornava a segunda
 * coleta do Casa Paris (~3600 imoveis) lenta). Faz 3 coisas a mais que a
 * versao original, sem mudar o resultado funcional:
 *  1. Descarta duplicatas de site_id+identity_key dentro da MESMA coleta
 *     (mesmo anuncio apareceu em duas paginas por reordenacao/paginacao
 *     sobreposta) antes de gravar - fica so a ultima ocorrencia.
 *  2. Nao grava nada no banco quando nenhum campo relevante mudou (nem
 *     UPDATE, nem listing_event) - so conta como "existente".
 *  3. Faz o INSERT em lote, o UPDATE em lote e o INSERT de eventos em lote
 *     via unnest(), em vez de uma rodada de queries por anuncio.
 */
export async function upsertListingsBatch(
  client: pg.PoolClient,
  siteId: string,
  scrapedListings: ScrapedListing[],
  urlBase: string,
  isInitialSeed: boolean,
  urlOptions: NormalizeUrlOptions = {}
): Promise<BatchUpsertSummary> {
  const analysisStatus = isInitialSeed ? "analisado" : "pendente";

  // 1. Resolve identidade e descarta duplicatas dentro da mesma coleta
  // (mantendo a ultima ocorrencia - dado mais recente na mesma pagina/varredura).
  const byIdentityKey = new Map<string, PreparedItem>();
  let duplicadosNaColeta = 0;
  for (const scraped of scrapedListings) {
    const identity = resolveIdentity(scraped, urlBase, urlOptions);
    if (byIdentityKey.has(identity.identityKey)) {
      duplicadosNaColeta += 1;
    }
    byIdentityKey.set(identity.identityKey, {
      scraped,
      identityKey: identity.identityKey,
      identityType: identity.identityType,
      identityConfidence: identity.identityConfidence,
      urlNormalizada: identity.urlNormalizada,
      urlHash: identity.urlHash,
      fingerprint: identity.fingerprint,
    });
  }
  const items = Array.from(byIdentityKey.values());

  if (items.length === 0) {
    return {
      results: [],
      seenListingIds: [],
      anunciosNovos: 0,
      anunciosAtualizados: 0,
      anunciosSemAlteracao: 0,
      duplicadosNaColeta,
    };
  }

  // 2. Busca em lote o que ja existe para essas identity_key nesse site.
  const identityKeys = items.map((i) => i.identityKey);
  const { rows: existingRows } = await client.query<ExistingRow>(
    `SELECT id, url_original, url_final, titulo, tipo_imovel, cidade, bairro,
      preco, area_util, dormitorios, suites, banheiros, vagas,
      condominio_nome, endereco, descricao, status, ausente_desde,
      coletas_ausente_consecutivas, identity_key
     FROM listings
     WHERE site_id = $1 AND identity_key = ANY($2::text[])`,
    [siteId, identityKeys]
  );
  const existingByKey = new Map(existingRows.map((r) => [r.identity_key, r]));

  const toInsert: PreparedItem[] = [];
  const toUpdate: { item: PreparedItem; listingId: string }[] = [];
  const unchanged: { item: PreparedItem; listingId: string }[] = [];

  for (const item of items) {
    const existing = existingByKey.get(item.identityKey);
    if (!existing) {
      toInsert.push(item);
    } else if (hasRelevantChange(item.scraped, existing)) {
      toUpdate.push({ item, listingId: existing.id });
    } else {
      unchanged.push({ item, listingId: existing.id });
    }
  }

  const resultsByKey = new Map<string, BatchUpsertItemResult>();

  // 3. INSERT em lote dos novos + eventos correspondentes.
  if (toInsert.length > 0) {
    const inserted = await client.query<{ id: string; identity_key: string }>(
      `INSERT INTO listings (
        site_id, identity_type, identity_key, identity_confidence,
        external_id, url_original, url_final, url_normalizada, url_hash, fingerprint,
        titulo, tipo_imovel, cidade, bairro, preco, area_util,
        dormitorios, suites, banheiros, vagas, condominio_nome, endereco, descricao,
        analysis_status
      )
      SELECT $1, t.*
      FROM unnest(
        $2::text[], $3::text[], $4::text[],
        $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[],
        $11::text[], $12::text[], $13::text[], $14::text[], $15::numeric[], $16::numeric[],
        $17::int[], $18::int[], $19::int[], $20::int[], $21::text[], $22::text[], $23::text[],
        $24::text[]
      ) AS t(
        identity_type, identity_key, identity_confidence,
        external_id, url_original, url_final, url_normalizada, url_hash, fingerprint,
        titulo, tipo_imovel, cidade, bairro, preco, area_util,
        dormitorios, suites, banheiros, vagas, condominio_nome, endereco, descricao,
        analysis_status
      )
      ON CONFLICT (site_id, identity_key) DO NOTHING
      RETURNING id, identity_key`,
      [
        siteId,
        toInsert.map((i) => i.identityType),
        toInsert.map((i) => i.identityKey),
        toInsert.map((i) => i.identityConfidence),
        toInsert.map((i) => i.scraped.externalId ?? null),
        toInsert.map((i) => i.scraped.urlOriginal),
        toInsert.map((i) => i.scraped.urlFinal ?? null),
        toInsert.map((i) => i.urlNormalizada),
        toInsert.map((i) => i.urlHash),
        toInsert.map((i) => i.fingerprint),
        toInsert.map((i) => i.scraped.titulo ?? null),
        toInsert.map((i) => i.scraped.tipoImovel ?? null),
        toInsert.map((i) => i.scraped.cidade ?? null),
        toInsert.map((i) => i.scraped.bairro ?? null),
        toInsert.map((i) => i.scraped.preco ?? null),
        toInsert.map((i) => i.scraped.areaUtil ?? null),
        toInsert.map((i) => i.scraped.dormitorios ?? null),
        toInsert.map((i) => i.scraped.suites ?? null),
        toInsert.map((i) => i.scraped.banheiros ?? null),
        toInsert.map((i) => i.scraped.vagas ?? null),
        toInsert.map((i) => i.scraped.condominioNome ?? null),
        toInsert.map((i) => i.scraped.endereco ?? null),
        toInsert.map((i) => i.scraped.descricao ?? null),
        toInsert.map(() => analysisStatus),
      ]
    );

    for (const row of inserted.rows) {
      resultsByKey.set(row.identity_key, { listingId: row.id, outcome: "novo" });
    }

    if (inserted.rows.length > 0) {
      const tipoEvento = isInitialSeed ? "created_from_initial_seed" : "created_as_new";
      await client.query(
        `INSERT INTO listing_events (listing_id, tipo)
         SELECT unnest($1::uuid[]), $2`,
        [inserted.rows.map((r) => r.id), tipoEvento]
      );
    }
  }

  // 4. UPDATE em lote dos que realmente mudaram + eventos correspondentes.
  if (toUpdate.length > 0) {
    await client.query(
      `UPDATE listings AS l SET
        url_original = t.url_original,
        url_final = t.url_final,
        titulo = t.titulo,
        tipo_imovel = t.tipo_imovel,
        cidade = t.cidade,
        bairro = t.bairro,
        preco = t.preco,
        area_util = t.area_util,
        dormitorios = t.dormitorios,
        suites = t.suites,
        banheiros = t.banheiros,
        vagas = t.vagas,
        condominio_nome = t.condominio_nome,
        endereco = t.endereco,
        descricao = t.descricao,
        ultima_captura_em = now(),
        status = 'ativo',
        ausente_desde = null,
        coletas_ausente_consecutivas = 0
      FROM unnest(
        $1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
        $7::text[], $8::numeric[], $9::numeric[], $10::int[], $11::int[], $12::int[],
        $13::int[], $14::text[], $15::text[], $16::text[]
      ) AS t(
        id, url_original, url_final, titulo, tipo_imovel, cidade,
        bairro, preco, area_util, dormitorios, suites, banheiros,
        vagas, condominio_nome, endereco, descricao
      )
      WHERE l.id = t.id`,
      [
        toUpdate.map((u) => u.listingId),
        toUpdate.map((u) => u.item.scraped.urlOriginal),
        toUpdate.map((u) => u.item.scraped.urlFinal ?? null),
        toUpdate.map((u) => u.item.scraped.titulo ?? null),
        toUpdate.map((u) => u.item.scraped.tipoImovel ?? null),
        toUpdate.map((u) => u.item.scraped.cidade ?? null),
        toUpdate.map((u) => u.item.scraped.bairro ?? null),
        toUpdate.map((u) => u.item.scraped.preco ?? null),
        toUpdate.map((u) => u.item.scraped.areaUtil ?? null),
        toUpdate.map((u) => u.item.scraped.dormitorios ?? null),
        toUpdate.map((u) => u.item.scraped.suites ?? null),
        toUpdate.map((u) => u.item.scraped.banheiros ?? null),
        toUpdate.map((u) => u.item.scraped.vagas ?? null),
        toUpdate.map((u) => u.item.scraped.condominioNome ?? null),
        toUpdate.map((u) => u.item.scraped.endereco ?? null),
        toUpdate.map((u) => u.item.scraped.descricao ?? null),
      ]
    );

    await client.query(
      `INSERT INTO listing_events (listing_id, tipo)
       SELECT unnest($1::uuid[]), 'updated'`,
      [toUpdate.map((u) => u.listingId)]
    );

    for (const u of toUpdate) {
      resultsByKey.set(u.item.identityKey, { listingId: u.listingId, outcome: "atualizado" });
    }
  }

  // 5. Sem alteracao: nao toca no banco, so registra como visto.
  for (const u of unchanged) {
    resultsByKey.set(u.item.identityKey, { listingId: u.listingId, outcome: "sem_alteracao" });
  }

  const results = items.map((item) => {
    const result = resultsByKey.get(item.identityKey);
    if (!result) {
      // So pode acontecer se um INSERT com ON CONFLICT DO NOTHING colidiu
      // com uma linha que nao estava no SELECT em lote acima (corrida entre
      // coletas concorrentes do mesmo site, o que nao deveria ocorrer no
      // fluxo normal - cada site roda uma coleta por vez). Busca pontual
      // para nunca perder o anuncio da contagem.
      throw new Error(
        `upsertListingsBatch: identity_key sem resultado apos gravacao (site_id=${siteId}, identity_key=${item.identityKey})`
      );
    }
    return result;
  });

  return {
    results,
    seenListingIds: results.map((r) => r.listingId),
    anunciosNovos: toInsert.length,
    anunciosAtualizados: toUpdate.length,
    anunciosSemAlteracao: unchanged.length,
    duplicadosNaColeta,
  };
}

/**
 * Marca como ausentes os anuncios ativos de um site que nao apareceram na
 * coleta atual. So passa a status 'removido' depois de mais de uma coleta
 * consecutiva sem encontrar (secao 6). Feito em lote (uma UPDATE e um INSERT
 * de eventos, em vez de um par de queries por anuncio ausente).
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

  if (stillActive.rows.length === 0) {
    return { marcadosAusentes: 0 };
  }

  const ids: string[] = [];
  const novosStatus: string[] = [];
  const novasColetas: number[] = [];
  const tiposEvento: string[] = [];

  for (const row of stillActive.rows) {
    const novasColetasAusente = row.coletas_ausente_consecutivas + 1;
    const removido = novasColetasAusente > 1;
    ids.push(row.id);
    novosStatus.push(removido ? "removido" : "ausente");
    novasColetas.push(novasColetasAusente);
    tiposEvento.push(removido ? "marked_removed" : "marked_absent");
  }

  await client.query(
    `UPDATE listings AS l SET
      status = t.status,
      ausente_desde = COALESCE(l.ausente_desde, now()),
      coletas_ausente_consecutivas = t.coletas
     FROM unnest($1::uuid[], $2::text[], $3::int[]) AS t(id, status, coletas)
     WHERE l.id = t.id`,
    [ids, novosStatus, novasColetas]
  );

  await client.query(
    `INSERT INTO listing_events (listing_id, tipo)
     SELECT unnest($1::uuid[]), unnest($2::text[])`,
    [ids, tiposEvento]
  );

  return { marcadosAusentes: stillActive.rows.length };
}
