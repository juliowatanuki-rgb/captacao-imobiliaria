import { chromium } from "playwright";
import type { SiteCrawlerModule } from "./siteRegistry.js";
import { createPraediumCrawler } from "./platforms/praedium.js";
import { createImoviewCrawler } from "./platforms/imoview.js";
import { createKenloCrawler } from "./platforms/kenlo.js";
import { createCorujaCrawler } from "./platforms/coruja.js";
import { createCastelDigitalCrawler } from "./platforms/castel_digital.js";
import { createGuessTecnologiaCrawler } from "./platforms/guess_tecnologia.js";
import { createImobziCrawler } from "./platforms/imobzi.js";
import { createImobealCrawler } from "./platforms/imobeal.js";

const CRIADORES: Record<string, (config: { urlListagem: string; maxPaginas?: number }) => SiteCrawlerModule> = {
  praedium: createPraediumCrawler,
  imoview: createImoviewCrawler,
  kenlo: createKenloCrawler,
  coruja: createCorujaCrawler,
  castel_digital: createCastelDigitalCrawler,
  guess_tecnologia: (config) => createGuessTecnologiaCrawler(config),
  imobzi: createImobziCrawler,
  imobeal: createImobealCrawler,
};

/**
 * Validacao ao vivo de um site SEM gravar nada no Neon (secao 18, passo
 * "validar antes de cadastrar"). Roda so algumas paginas para confirmar
 * paginacao, codigo do imovel, URLs e campos coletados.
 *
 * Uso: npm run validate:site -- <urlListagem> [maxPaginas] [plataforma]
 * plataforma (opcional, default "praedium"): praedium | imoview | kenlo |
 * coruja | castel_digital | guess_tecnologia
 */
async function main() {
  const urlListagem = process.argv[2];
  const maxPaginas = Number(process.argv[3] ?? 3);
  const plataforma = process.argv[4] ?? "praedium";
  if (!urlListagem) {
    console.error("Uso: npm run validate:site -- <urlListagem> [maxPaginas] [plataforma]");
    process.exit(1);
  }
  const criar = CRIADORES[plataforma];
  if (!criar) {
    console.error(`plataforma desconhecida: "${plataforma}". Opcoes: ${Object.keys(CRIADORES).join(", ")}`);
    process.exit(1);
  }

  const urlBase = new URL(urlListagem).origin;
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const crawler = criar({ urlListagem, maxPaginas });
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
