import type pg from "pg";
import type { ScrapedListing } from "@captacao/shared";
import type { NormalizeUrlOptions } from "./urlNormalize.js";
import { markAbsentListings, upsertListing } from "./upsertListing.js";

export interface CrawlSiteParams {
  pool: pg.Pool;
  crawlRunId: string;
  siteId: string;
  urlBase: string;
  urlOptions?: NormalizeUrlOptions;
  /**
   * Funcao que efetivamente navega e extrai os anuncios (Playwright etc).
   * Pode retornar `urlOptions` proprios do site (ex: carregados junto do
   * modulo do crawler) - eles tem prioridade sobre o `urlOptions` do parametro acima.
   */
  scrape: () => Promise<{
    listings: ScrapedListing[];
    paginasVisitadas: number;
    urlOptions?: NormalizeUrlOptions;
  }>;
}

export interface CrawlSiteResult {
  status: "sucesso" | "alerta" | "erro";
  anunciosEncontrados: number;
  anunciosNovos: number;
  anunciosExistentes: number;
  anunciosAtualizados: number;
  anunciosAusentes: number;
  paginasVisitadas: number;
  mensagemErro: string | null;
  detalheTecnico: string | null;
}

/**
 * Executa a coleta de um site dentro de um crawl_run existente, gravando o
 * resultado em site_crawl_runs (log obrigatorio desde o primeiro crawler - secao 13).
 * Erros de um site nunca devem interromper os demais (secao 18) - por isso
 * esta funcao captura qualquer excecao e a converte em um registro de log com status 'erro'.
 */
export async function crawlSite(params: CrawlSiteParams): Promise<CrawlSiteResult> {
  const { pool, crawlRunId, siteId, urlBase, urlOptions, scrape } = params;
  const inicioEm = new Date();

  const siteCrawlRunInsert = await pool.query<{ id: string }>(
    `INSERT INTO site_crawl_runs (crawl_run_id, site_id, inicio_em, status)
     VALUES ($1, $2, $3, 'erro')
     RETURNING id`,
    [crawlRunId, siteId, inicioEm]
  );
  const siteCrawlRunId = siteCrawlRunInsert.rows[0].id;

  try {
    const { rows: countRows } = await pool.query<{ count: string }>(
      `SELECT count(*)::text FROM listings WHERE site_id = $1`,
      [siteId]
    );
    const isInitialSeed = Number(countRows[0].count) === 0;

    const scrapeResult = await scrape();
    const { listings, paginasVisitadas } = scrapeResult;
    const effectiveUrlOptions = scrapeResult.urlOptions ?? urlOptions;

    let anunciosNovos = 0;
    let anunciosAtualizados = 0;
    let anunciosExistentes = 0;
    const seenListingIds: string[] = [];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const scraped of listings) {
        const result = await upsertListing(client, siteId, scraped, urlBase, isInitialSeed, effectiveUrlOptions);
        seenListingIds.push(result.listingId);
        if (result.outcome === "novo") {
          anunciosNovos += 1;
        } else {
          anunciosAtualizados += 1;
          anunciosExistentes += 1;
        }
      }

      const { marcadosAusentes } = isInitialSeed
        ? { marcadosAusentes: 0 }
        : await markAbsentListings(client, siteId, seenListingIds);

      await client.query("COMMIT");

      const fimEm = new Date();
      await pool.query(
        `UPDATE site_crawl_runs SET
          fim_em = $2,
          status = 'sucesso',
          paginas_visitadas = $3,
          anuncios_encontrados = $4,
          anuncios_novos = $5,
          anuncios_existentes = $6,
          anuncios_atualizados = $7,
          anuncios_ausentes = $8
         WHERE id = $1`,
        [
          siteCrawlRunId,
          fimEm,
          paginasVisitadas,
          listings.length,
          anunciosNovos,
          anunciosExistentes,
          anunciosAtualizados,
          marcadosAusentes,
        ]
      );

      return {
        status: "sucesso",
        anunciosEncontrados: listings.length,
        anunciosNovos,
        anunciosExistentes,
        anunciosAtualizados,
        anunciosAusentes: marcadosAusentes,
        paginasVisitadas,
        mensagemErro: null,
        detalheTecnico: null,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    const fimEm = new Date();
    const mensagemErro = err instanceof Error ? err.message : String(err);
    const detalheTecnico = err instanceof Error ? (err.stack ?? null) : null;

    await pool.query(
      `UPDATE site_crawl_runs SET
        fim_em = $2,
        status = 'erro',
        mensagem_erro = $3,
        detalhe_tecnico = $4
       WHERE id = $1`,
      [siteCrawlRunId, fimEm, mensagemErro, detalheTecnico]
    );

    return {
      status: "erro",
      anunciosEncontrados: 0,
      anunciosNovos: 0,
      anunciosExistentes: 0,
      anunciosAtualizados: 0,
      anunciosAusentes: 0,
      paginasVisitadas: 0,
      mensagemErro,
      detalheTecnico,
    };
  }
}

export interface StartCrawlRunResult {
  crawlRunId: string;
}

export async function startCrawlRun(pool: pg.Pool, sitesPrevistos: number): Promise<StartCrawlRunResult> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO crawl_runs (sites_previstos) VALUES ($1) RETURNING id`,
    [sitesPrevistos]
  );
  return { crawlRunId: rows[0].id };
}

export async function finishCrawlRun(
  pool: pg.Pool,
  crawlRunId: string,
  results: CrawlSiteResult[]
): Promise<void> {
  const sitesSucesso = results.filter((r) => r.status === "sucesso").length;
  const sitesAlerta = results.filter((r) => r.status === "alerta").length;
  const sitesErro = results.filter((r) => r.status === "erro").length;
  const totalAnunciosEncontrados = results.reduce((sum, r) => sum + r.anunciosEncontrados, 0);
  const totalAnunciosNovos = results.reduce((sum, r) => sum + r.anunciosNovos, 0);
  const totalAnunciosAtualizados = results.reduce((sum, r) => sum + r.anunciosAtualizados, 0);

  const status = sitesErro === 0 ? "sucesso" : sitesSucesso > 0 ? "sucesso_parcial" : "erro";

  await pool.query(
    `UPDATE crawl_runs SET
      fim_em = now(),
      status = $2,
      sites_sucesso = $3,
      sites_alerta = $4,
      sites_erro = $5,
      total_anuncios_encontrados = $6,
      total_anuncios_novos = $7,
      total_anuncios_atualizados = $8
     WHERE id = $1`,
    [
      crawlRunId,
      status,
      sitesSucesso,
      sitesAlerta,
      sitesErro,
      totalAnunciosEncontrados,
      totalAnunciosNovos,
      totalAnunciosAtualizados,
    ]
  );
}
