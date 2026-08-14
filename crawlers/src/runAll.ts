import { chromium } from "playwright";
import { getPool } from "@captacao/db";
import {
  crawlSite,
  finishCrawlRun,
  reconcileStaleCrawlRuns,
  startCrawlRun,
  tryAcquireCrawlLock,
  type CrawlSiteResult,
} from "@captacao/crawler-core";
import { loadSiteModule } from "./siteRegistry.js";

interface SiteRow {
  id: string;
  nome: string;
  url_base: string;
  url_listagem: string;
  plataforma: string | null;
}

const MAX_GRUPOS_CONCORRENTES = 4;

/** Executa a coleta diaria de todos os sites ativos (secao 17 e 19, passo 15). */
async function main() {
  const pool = getPool();
  const crawlLock = await tryAcquireCrawlLock(pool);
  if (!crawlLock) {
    console.warn("[runAll] outra coleta ja esta em andamento; encerrando sem alterar dados");
    await pool.end();
    return;
  }

  try {
    await reconcileStaleCrawlRuns(pool);
    const { rows: sites } = await pool.query<SiteRow>(
      `SELECT id, nome, url_base, url_listagem, plataforma
       FROM monitored_sites
       WHERE ativo = true AND is_agregador = false
       ORDER BY id`
    );

    if (sites.length === 0) {
      console.warn("[runAll] nenhum site ativo cadastrado em monitored_sites");
    }

    const { crawlRunId } = await startCrawlRun(pool, sites.length);
    console.log(`[runAll] crawl_run ${crawlRunId} iniciado para ${sites.length} site(s)`);

    const results: CrawlSiteResult[] = [];

    // Auditoria de 2026-08-05: se algo depois de startCrawlRun lancar excecao
    // sem passar por aqui (browser.launch(), context.close(), um crash no meio
    // do loop), o crawl_run fica preso em 'em_andamento' para sempre.
    // finishCrawlRun sempre roda no finally, com os resultados parciais.
    try {
      const browser = await chromium.launch();
      try {
        const grupos = new Map<string, SiteRow[]>();
        for (const site of sites) {
          const chave = site.plataforma?.trim() || `site:${site.id}`;
          const grupo = grupos.get(chave) ?? [];
          grupo.push(site);
          grupos.set(chave, grupo);
        }
        const gruposArray = Array.from(grupos.values());
        let proximoGrupo = 0;
        const trabalhadores = Array.from(
          { length: Math.min(MAX_GRUPOS_CONCORRENTES, gruposArray.length) },
          async () => {
            while (true) {
              const indice = proximoGrupo++;
              const grupo = gruposArray[indice];
              if (!grupo) return;

              for (const site of grupo) {
          if (!crawlLock.isHealthy()) {
            throw new Error("conexao do lock global foi encerrada pelo banco durante a coleta");
          }
          try {
            console.log(`[runAll] iniciando site "${site.id}"`);
            const context = await browser.newContext();
            try {
              // A carga do modulo acontece dentro do scrape(), para que falhas
              // de um crawler sejam registradas como erro isolado do site.
              const result = await crawlSite({
                pool,
                crawlRunId,
                siteId: site.id,
                urlBase: site.url_base,
                scrape: async () => {
                  const module = await loadSiteModule(site.id);
                  const page = await context.newPage();
                  const output = await module.scrape({ page, urlBase: site.url_base, urlListagem: site.url_listagem });
                  return { ...output, urlOptions: module.urlOptions };
                },
              });

              results.push(result);
              console.log(
                `[runAll] site "${site.id}" -> status=${result.status} encontrados=${result.anunciosEncontrados} novos=${result.anunciosNovos} atualizados=${result.anunciosAtualizados} ausentes=${result.anunciosAusentes}`
              );
              if (result.mensagemErro) {
                console.error(`[runAll] site "${site.id}" erro: ${result.mensagemErro}`);
              }
            } finally {
              await context.close().catch(() => {});
            }
          } catch (err) {
            // Nenhum erro de infraestrutura de um site pode rejeitar o
            // trabalhador inteiro e deixar o crawl_run preso em andamento.
            const mensagemErro = err instanceof Error ? err.message : String(err);
            const detalheTecnico = err instanceof Error ? (err.stack ?? null) : null;
            console.error(`[runAll] falha inesperada no site "${site.id}": ${mensagemErro}`);
            results.push({
              status: "erro",
              anunciosEncontrados: 0,
              anunciosNovos: 0,
              anunciosExistentes: 0,
              anunciosAtualizados: 0,
              anunciosAusentes: 0,
              paginasVisitadas: 0,
              mensagemErro,
              detalheTecnico,
            });
          }
              }
            }
          }
        );
        await Promise.all(trabalhadores);
      } finally {
        await browser.close().catch(() => {});
      }
    } finally {
      await finishCrawlRun(pool, crawlRunId, results);
      console.log(`[runAll] crawl_run ${crawlRunId} finalizado (${results.length}/${sites.length} site(s) com resultado)`);
    }
  } finally {
    await crawlLock.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[runAll] falhou:", err);
  process.exit(1);
});
