import { chromium } from "playwright";
import { createPraediumCrawler } from "./platforms/praedium.js";

/**
 * Validacao ao vivo de um site Praedium SEM gravar nada no Neon (secao 18,
 * passo "validar antes de cadastrar"). Roda so algumas paginas para
 * confirmar paginacao, codigo do imovel, URLs e campos coletados.
 *
 * Uso: npm run validate:site -- <urlListagem> [maxPaginas]
 */
async function main() {
  const urlListagem = process.argv[2];
  const maxPaginas = Number(process.argv[3] ?? 3);
  if (!urlListagem) {
    console.error("Uso: npm run validate:site -- <urlListagem> [maxPaginas]");
    process.exit(1);
  }

  const urlBase = new URL(urlListagem).origin;
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const crawler = createPraediumCrawler({ urlListagem, maxPaginas });
    const { listings, paginasVisitadas } = await crawler.scrape({ page, urlBase, urlListagem });

    console.log(`paginasVisitadas=${paginasVisitadas}`);
    console.log(`totalListingsNestasPaginas=${listings.length}`);

    const semExternalId = listings.filter((l) => !l.externalId).length;
    const semUrl = listings.filter((l) => !l.urlOriginal).length;
    console.log(`semExternalId=${semExternalId} semUrl=${semUrl}`);

    console.log("--- amostra (ate 5) ---");
    for (const l of listings.slice(0, 5)) {
      console.log(JSON.stringify(l));
    }
    console.log("--- ultimos 3 da ultima pagina lida ---");
    for (const l of listings.slice(-3)) {
      console.log(JSON.stringify(l));
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[validateSite] falhou:", err);
  process.exit(1);
});
