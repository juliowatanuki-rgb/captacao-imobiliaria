import type pg from "pg";
import type { ScrapedListing } from "@captacao/shared";
import type { NormalizeUrlOptions } from "./urlNormalize.js";
import { markAbsentListings, upsertListingsBatch } from "./upsertListing.js";

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

// Detecta o sintoma de "churn de identidade" (secao "auditoria de anuncios
// novos" de 2026-08-01): um anuncio que muda de codigo/identity_key entre
// coletas aparece simultaneamente como "novo" (codigo nunca visto) E como
// "ausente" (o codigo antigo sumiu) na MESMA coleta, em vez de aparecer como
// "sem alteracao". Confirmado ao vivo (navegador real, 6s de monitoramento,
// 2 recarregamentos completos) que pelo menos parte disso NAO e um problema
// de hidratacao/timing do nosso lado (o DOM ja estava estavel) - o mais
// provavel e o proprio site de origem republicando o mesmo imovel com um
// codigo levemente diferente (comportamento comum de CRMs imobiliarios).
// Como isso nao da pra "consertar" com confianca no lado do scraper sem
// risco de mesclar por engano anuncios que sao realmente diferentes, a
// garantia de confiabilidade aqui e OUTRA: nunca deixar isso passar batido
// como 'sucesso' silencioso - fica marcado 'alerta' para aparecer no painel
// (Execucoes de coleta) e ser investigado, em vez de so inflar a fila de
// "Anuncios novos" sem ninguem perceber.
const LIMIAR_ALERTA_MOVIMENTACAO_ABSOLUTA = 15; // abaixo disso e ruido normal do dia a dia
const LIMIAR_ALERTA_MOVIMENTACAO_PROPORCAO = 0.05; // 5% do inventario encontrado na mesma coleta

function indicaChurnDeIdentidade(
  anunciosEncontrados: number,
  anunciosNovos: number,
  anunciosAusentes: number,
  isInitialSeed: boolean
): boolean {
  // 1a coleta de um site sempre tem 100% "novo" - e o esperado, nao uma anomalia.
  if (isInitialSeed || anunciosEncontrados === 0) return false;
  const movimentacao = anunciosNovos + anunciosAusentes;
  if (movimentacao < LIMIAR_ALERTA_MOVIMENTACAO_ABSOLUTA) return false;
  return movimentacao / anunciosEncontrados >= LIMIAR_ALERTA_MOVIMENTACAO_PROPORCAO;
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
    const { rows: countRows } = await pool.query<{ total: string; rastreados: string }>(
      `SELECT count(*)::text AS total,
        count(*) FILTER (WHERE status IN ('ativo', 'ausente'))::text AS rastreados
       FROM listings WHERE site_id = $1`,
      [siteId]
    );
    const isInitialSeed = Number(countRows[0].total) === 0;
    const rastreadosAntesDaColeta = Number(countRows[0].rastreados);

    const scrapeResult = await scrape();
    const { listings, paginasVisitadas } = scrapeResult;
    const effectiveUrlOptions = scrapeResult.urlOptions ?? urlOptions;

    // Protecao contra falha silenciosa de scraping (ex: anti-bot, timeout de
    // renderizacao, bloqueio): uma coleta que encontra 0 anuncios ou uma
    // quantidade anormalmente baixa (menos da metade do que ja esta
    // rastreado como ativo/ausente) nunca deve ser tratada como sucesso -
    // isso marcaria anuncios existentes como ausentes/removidos por uma
    // falha temporaria, em vez de uma alta real. Melhor falhar alto (vira
    // 'erro' no catch abaixo, sem gravar nada e sem incrementar nenhum
    // contador de ausencia) do que arriscar dado incorreto.
    const LIMIAR_QUEDA_SUSPEITA = 0.5;
    if (!isInitialSeed && rastreadosAntesDaColeta > 0 && listings.length < rastreadosAntesDaColeta * LIMIAR_QUEDA_SUSPEITA) {
      throw new Error(
        `coleta encontrou apenas ${listings.length} anuncio(s) para o site "${siteId}", bem abaixo do ` +
          `esperado (${rastreadosAntesDaColeta} rastreado(s) atualmente) - abortando sem gravar para nao ` +
          "marcar anuncios existentes como ausentes/removidos por uma falha de scraping (bloqueio, timeout, etc)"
      );
    }

    const client = await pool.connect();
    let transacaoAberta = false;
    try {
      await client.query("BEGIN");
      transacaoAberta = true;

      const batch = await upsertListingsBatch(client, siteId, listings, urlBase, isInitialSeed, effectiveUrlOptions);
      const anunciosNovos = batch.anunciosNovos;
      const anunciosAtualizados = batch.anunciosAtualizados;
      const anunciosExistentes = batch.anunciosAtualizados + batch.anunciosSemAlteracao;

      const { marcadosAusentes } = isInitialSeed
        ? { marcadosAusentes: 0 }
        : await markAbsentListings(client, siteId, batch.seenListingIds);

      const churnDeIdentidade = indicaChurnDeIdentidade(listings.length, anunciosNovos, marcadosAusentes, isInitialSeed);
      const status: CrawlSiteResult["status"] = churnDeIdentidade ? "alerta" : "sucesso";
      const mensagemErro = churnDeIdentidade
        ? `possivel churn de identidade: ${anunciosNovos} novo(s) e ${marcadosAusentes} ausente(s) na mesma ` +
          `coleta (${((anunciosNovos + marcadosAusentes) / listings.length * 100).toFixed(1)}% do total encontrado) - ` +
          "alteracoes bloqueadas para evitar duplicacao; confirmar a estabilidade da origem e repetir a coleta"
        : null;

      // Alerta nao pode ser apenas cosmetico: desfaz toda a transacao para
      // impedir que anuncios com identidade instavel sejam criados e que os
      // antigos sejam marcados como ausentes. Os numeros abaixo continuam no
      // log como diagnostico da coleta rejeitada.
      if (churnDeIdentidade) {
        await client.query("ROLLBACK");
      } else {
        await client.query("COMMIT");
      }
      transacaoAberta = false;

      const fimEm = new Date();
      await pool.query(
        `UPDATE site_crawl_runs SET
          fim_em = $2,
          status = $11,
          paginas_visitadas = $3,
          anuncios_encontrados = $4,
          anuncios_novos = $5,
          anuncios_existentes = $6,
          anuncios_atualizados = $7,
          anuncios_ausentes = $8,
          anuncios_sem_alteracao = $9,
          anuncios_duplicados_coleta = $10,
          mensagem_erro = $12
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
          batch.anunciosSemAlteracao,
          batch.duplicadosNaColeta,
          status,
          mensagemErro,
        ]
      );

      return {
        status,
        anunciosEncontrados: listings.length,
        anunciosNovos,
        anunciosExistentes,
        anunciosAtualizados,
        anunciosAusentes: marcadosAusentes,
        paginasVisitadas,
        mensagemErro,
        detalheTecnico: null,
      };
    } catch (err) {
      if (transacaoAberta) {
        await client.query("ROLLBACK");
      }
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

/** Reconciliacao defensiva para quedas abruptas do runner ou do processo. */
export async function reconcileStaleCrawlRuns(pool: pg.Pool, maxAgeHours = 6): Promise<number> {
  await pool.query(
    `UPDATE site_crawl_runs scr
     SET status = 'erro', fim_em = COALESCE(scr.fim_em, now()),
         mensagem_erro = COALESCE(scr.mensagem_erro, 'execucao encerrada automaticamente por estar presa')
     FROM crawl_runs cr
     WHERE scr.crawl_run_id = cr.id
       AND cr.status = 'em_andamento'
       AND cr.inicio_em < now() - ($1::int * interval '1 hour')
       AND scr.fim_em IS NULL`,
    [maxAgeHours]
  );
  const result = await pool.query(
    `UPDATE crawl_runs
     SET status = 'erro', fim_em = COALESCE(fim_em, now()),
         mensagem = COALESCE(mensagem, 'execucao encerrada automaticamente por estar presa')
     WHERE status = 'em_andamento'
       AND inicio_em < now() - ($1::int * interval '1 hour')`,
    [maxAgeHours]
  );
  return result.rowCount ?? 0;
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

  // 'alerta' tambem rebaixa o status geral da execucao (reaproveita
  // 'sucesso_parcial' - crawl_runs.status nao tem um valor proprio para
  // "alerta", so listings/site_crawl_runs tem) para o alerta aparecer
  // tambem na lista de execucoes, nao so no detalhe por site.
  const status =
    sitesErro > 0
      ? sitesSucesso > 0
        ? "sucesso_parcial"
        : "erro"
      : sitesAlerta > 0
        ? "sucesso_parcial"
        : "sucesso";

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
