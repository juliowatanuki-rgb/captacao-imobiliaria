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

/** Executa um unico site, identificado por argv[2]. Uso: npm run crawl:site -- <site_id> */
async function main() {
  const siteId = process.argv[2];
  if (!siteId) {
    console.error("Uso: npm run crawl:site -- <site_id>");
    process.exit(1);
  }

  const pool = getPool();
  const crawlLock = await tryAcquireCrawlLock(pool);
  if (!crawlLock) {
    console.warn(`[${siteId}] outra coleta ja esta em andamento; encerrando sem alterar dados`);
    await pool.end();
    return;
  }

  let site: {
    id: string;
    nome: string;
    url_base: string;
    url_listagem: string;
    ativo: boolean;
  };
  let result: CrawlSiteResult | null = null;

  try {
    await reconcileStaleCrawlRuns(pool);
    const { rows } = await pool.query<typeof site>(
      `SELECT id, nome, url_base, url_listagem, ativo FROM monitored_sites WHERE id = $1`,
      [siteId]
    );

    if (rows.length === 0) {
      throw new Error(`site "${siteId}" nao encontrado em monitored_sites`);
    }
    site = rows[0];

    const { crawlRunId } = await startCrawlRun(pool, 1);
    // Auditoria de 2026-08-05: se qualquer coisa depois de startCrawlRun
    // lancar excecao (browser.launch(), context.close(), ate o proprio
    // finishCrawlRun) sem passar por aqui, o crawl_run fica preso em
    // 'em_andamento' para sempre. `result` sempre acaba sendo finalizado no
    // `finally`, com um resultado de erro sintetico se crawlSite nao rodar.
    try {
      const browser = await chromium.launch();
      try {
        const context = await browser.newContext();
        try {
          result = await crawlSite({
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
        } finally {
          await context.close().catch(() => {});
        }
      } finally {
        await browser.close().catch(() => {});
      }
    } finally {
      if (!result) {
        const mensagemErro = "falha antes de crawlSite() rodar (browser/context nao inicializou) - ver logs da execucao";
        result = {
          status: "erro",
          anunciosEncontrados: 0,
          anunciosNovos: 0,
          anunciosExistentes: 0,
          anunciosAtualizados: 0,
          anunciosAusentes: 0,
          paginasVisitadas: 0,
          mensagemErro,
          detalheTecnico: null,
        };
      }
      await finishCrawlRun(pool, crawlRunId, [result]);
    }
  } finally {
    await crawlLock.release();
    await pool.end();
  }

  if (!result) {
    throw new Error(`[${siteId}] coleta terminou sem resultado`);
  }
  console.log(`[${site.id}] status=${result.status} encontrados=${result.anunciosEncontrados} novos=${result.anunciosNovos} atualizados=${result.anunciosAtualizados} ausentes=${result.anunciosAusentes}`);
  if (result.mensagemErro) {
    console.error(`[${site.id}] erro: ${result.mensagemErro}`);
  }
}

main().catch((err) => {
  console.error("[runSite] falhou:", err);
  process.exit(1);
});
