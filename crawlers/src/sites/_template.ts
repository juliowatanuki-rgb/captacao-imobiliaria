// Crawler modelo (secao 18 e 19, passo 6).
// Para adicionar uma nova imobiliaria: copie este arquivo para
// `crawlers/src/sites/<site_id>.ts`, onde <site_id> e exatamente o `id`
// cadastrado em monitored_sites (ver packages/db/sites.seed.json).
// Ajuste os seletores CSS conforme o HTML real do site.
//
// Este arquivo NAO e carregado automaticamente (comeca com "_") - serve so de referencia.

import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const MAX_PAGINAS = 50;

const siteCrawler: SiteCrawlerModule = {
  // Parametros de URL adicionais que identificam o imovel neste site especifico,
  // alem dos padroes globais (id, codigo, cod, imovel, listing, property).
  urlOptions: {
    extraIdentifyingParams: [],
  },

  async scrape({ page, urlListagem }) {
    const listings: ScrapedListing[] = [];
    let paginasVisitadas = 0;
    let urlAtual: string | null = urlListagem;

    while (urlAtual && paginasVisitadas < MAX_PAGINAS) {
      await page.goto(urlAtual, { waitUntil: "domcontentloaded" });
      paginasVisitadas += 1;

      // Ajuste o seletor do card de anuncio conforme o site.
      const cards = await page.locator(".card-imovel").all();

      for (const card of cards) {
        const linkHref = await card.locator("a").first().getAttribute("href");
        if (!linkHref) continue;

        const titulo = (await card.locator(".titulo").first().textContent().catch(() => null))?.trim() ?? null;
        const bairro = (await card.locator(".bairro").first().textContent().catch(() => null))?.trim() ?? null;
        const precoTexto = (await card.locator(".preco").first().textContent().catch(() => null))?.trim() ?? null;
        const codigo = (await card.locator(".codigo").first().textContent().catch(() => null))?.trim() ?? null;

        listings.push({
          externalId: codigo || null,
          urlOriginal: linkHref,
          titulo,
          bairro,
          preco: precoTexto ? parsePreco(precoTexto) : null,
        });
      }

      // Ajuste o seletor do link de "proxima pagina". Retorna null quando acabar.
      const proximaHref = await page
        .locator('a[rel="next"]')
        .first()
        .getAttribute("href")
        .catch(() => null);
      urlAtual = proximaHref ? new URL(proximaHref, urlListagem).toString() : null;
    }

    return { listings, paginasVisitadas };
  },
};

function parsePreco(texto: string): number | null {
  const numeros = texto.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const valor = Number.parseFloat(numeros);
  return Number.isFinite(valor) ? valor : null;
}

export default siteCrawler;
