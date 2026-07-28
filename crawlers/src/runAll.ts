import { chromium } from "playwright";
import { getPool } from "@captacao/db";
import { crawlSite, finishCrawlRun, startCrawlRun, type CrawlSiteResult } from "@captacao/crawler-core";
import { loadSiteModule } from "./siteRegistry.js";

interface SiteRow {
  id: string;
  nome: string;
  url_base: string;
  url_listagem: string;
}

/** Executa a coleta diaria de todos os sites ativos (secao 17 e 19, passo 15). */
async function main() {
  const pool = getPool();

  const { rows: sites } = await pool.query<SiteRow>(
    `SELECT id, nome, url_base, url_listagem
     FROM monitored_sites
     WHERE ativo = true AND is_agregador = false
     ORDER BY id`
  );

  if (sites.length === 0) {
    console.warn("[runAll] nenhum site ativo cadastrado em monitored_sites");
  }

  const { crawlRunId } = await startCrawlRun(pool, sites.length);
  console.log(`[runAll] crawl_run ${crawlRunId} iniciado para ${sites.length} site(s)`);

  const browser = await chromium.launch();
  const results: CrawlSiteResult[] = [];

  try {
    // Sequencial: cada site roda um apos o outro. Um erro em um site
    // (capturado dentro de crawlSite) nao impede os demais (secao 18).
    for (const site of sites) {
      console.log(`[runAll] iniciando site "${site.id}"`);
      const context = await browser.newContext();
      try {
        // A carga do modulo do site acontece DENTRO do scrape(), para que uma
        // falha (ex: arquivo do crawler inexistente) seja capturada por
        // crawlSite() e vire um registro de erro em site_crawl_runs, em vez
        // de deixar aquele site sem nenhum log (secao 13).
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
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  await finishCrawlRun(pool, crawlRunId, results);
  console.log(`[runAll] crawl_run ${crawlRunId} finalizado`);
  await pool.end();
}

main().catch((err) => {
  console.error("[runAll] falhou:", err);
  process.exit(1);
});
