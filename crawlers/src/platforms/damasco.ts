import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

interface Card { href: string; code: string; title: string; price: string; location: string; features: string[] }

function numberFrom(text: string | undefined): number | null {
  if (!text) return null;
  const match = text.match(/[\d.,]+/);
  if (!match) return null;
  const token = match[0];
  const normalized = token.includes(",")
    ? token.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(?:\.\d{3})+$/.test(token)
      ? token.replace(/\./g, "")
      : token;
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

export function createDamascoCrawler(config: { maxPaginas?: number } = {}): SiteCrawlerModule {
  return {
    async scrape({ page }) {
      const listings: ScrapedListing[] = [];
      let paginasVisitadas = 0;
      for (let pagina = 1; pagina <= (config.maxPaginas ?? 20); pagina++) {
        const url = `https://damascoimoveis.com.br/imoveis?cidade=Praia+Grande&finalidade=venda&page=${pagina}&route=%2Fimoveis`;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        const cards = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(".property-card, article.cartao-imovel")).map((card) => {
          const link = card.querySelector<HTMLAnchorElement>(".card-title a[href*='/imovel/'], a[href*='/imovel/']");
          return {
            href: link?.href ?? "",
            code: card.getAttribute("data-codigo") ?? card.querySelector(".card-code")?.textContent?.trim() ?? "",
            title: card.querySelector(".card-title, .cartao-imovel__titulo")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
            price: card.querySelector(".card-price, .cartao-imovel__preco")?.textContent?.trim() ?? "",
            location: card.querySelector(".card-location, .cartao-imovel__local")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
            features: Array.from(card.querySelectorAll(".card-features .feature-item, .cartao-imovel li")).map((el) => el.textContent?.trim() ?? ""),
          };
        })) as Card[];
        paginasVisitadas++;
        if (!cards.length) break;
        for (const card of cards) {
          if (!card.href || !card.code) continue;
          const loc = card.location.split(/\s+-\s+/);
          const tipo = card.title.match(/^(.+?)\s+[àa]\s+venda/i)?.[1]?.trim() ?? null;
          const feature = (pattern: RegExp) => card.features.find((item) => pattern.test(item));
          listings.push({
            externalId: card.code,
            urlOriginal: card.href,
            titulo: card.title || null,
            tipoImovel: tipo,
            cidade: loc.length > 1 ? loc[loc.length - 1] : "Praia Grande",
            bairro: loc.length > 1 ? loc.slice(0, -1).join(" - ") : null,
            preco: numberFrom(card.price),
            areaUtil: numberFrom(feature(/m²|m2/i)),
            dormitorios: numberFrom(feature(/dorm/i)),
            banheiros: numberFrom(feature(/banh/i)),
          });
        }
        if (cards.length < 12) break;
      }
      return { listings, paginasVisitadas };
    },
  };
}
