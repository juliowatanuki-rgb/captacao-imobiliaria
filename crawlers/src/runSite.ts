import { chromium } from "playwright";
import { getPool } from "@captacao/db";
import { crawlSite, finishCrawlRun, startCrawlRun } from "@captacao/crawler-core";
import { loadSiteModule } from "./siteRegistry.js";

/** Executa um unico site, identificado por argv[2]. Uso: npm run crawl:site -- <site_id> */
async function main() {
  const siteId = process.argv[2];
  if (!siteId) {
    console.error("Uso: npm run crawl:site -- <site_id>");
    process.exit(1);
  }

  const pool = getPool();
  const { rows } = await pool.query<{
    id: string;
    nome: string;
    url_base: string;
    url_listagem: string;
    ativo: boolean;
  }>(`SELECT id, nome, url_base, url_listagem, ativo FROM monitored_sites WHERE id = $1`, [siteId]);

  if (rows.length === 0) {
    console.error(`site "${siteId}" nao encontrado em monitored_sites`);
    process.exit(1);
  }
  const site = rows[0];

  const { crawlRunId } = await startCrawlRun(pool, 1);
  const browser = await chromium.launch();

  const context = await browser.newContext();
  try {
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

    await context.close();
    await finishCrawlRun(pool, crawlRunId, [result]);

    console.log(`[${site.id}] status=${result.status} encontrados=${result.anunciosEncontrados} novos=${result.anunciosNovos} atualizados=${result.anunciosAtualizados} ausentes=${result.anunciosAusentes}`);
    if (result.mensagemErro) {
      console.error(`[${site.id}] erro: ${result.mensagemErro}`);
    }
  } finally {
    await browser.close();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[runSite] falhou:", err);
  process.exit(1);
});
