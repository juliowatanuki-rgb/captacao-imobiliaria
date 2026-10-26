// Motor para listagens da plataforma Market Imóvel.
// Validado ao vivo em tavaresepolati.com.br em 2026-10-26.

import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const MAX_PAGINAS_PADRAO = 100;
const PAUSA_ENTRE_PAGINAS_MS = 800;

interface RawCard { titulo: string; codigo: string | null; endereco: string | null; texto: string; }

async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("div.cursor-pointer"))
    .map((card) => {
      const texto = (card.innerText ?? "").replace(/\s+/g, " ").trim();
      const titulo = card.querySelector<HTMLElement>("[title]")?.textContent?.trim() ?? "";
      const endereco = card.querySelector("p")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const codigo = texto.match(/#([A-Za-z0-9-]+)/)?.[1] ?? null;
      return { titulo, codigo, endereco, texto };
    }).filter((card) => Boolean(card.codigo && card.titulo)));
}

function numero(texto: string, padrao: RegExp): number | null {
  const match = texto.match(padrao);
  if (!match) return null;
  const valor = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
}

function moeda(texto: string): number | null {
  const valor = texto.match(/R\$\s*([\d.]+(?:,\d+)?)/i)?.[1];
  if (!valor) return null;
  const normalizado = Number.parseFloat(valor.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(normalizado) ? normalizado : null;
}

function enderecoPartes(endereco: string | null): { bairro: string | null; cidade: string | null } {
  const partes = (endereco ?? "").split(",").map((parte) => parte.trim());
  return { bairro: partes[0] || null, cidade: partes[1] || null };
}

function slugDetalhe(titulo: string, codigo: string, urlListagem: string): string {
  const slug = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${new URL(urlListagem).origin}/${slug}-${codigo}-${codigo}`;
}

export interface MarketImovelConfig { urlListagem: string; maxPaginas?: number; }

export function createMarketImovelCrawler(config: MarketImovelConfig): SiteCrawlerModule {
  return {
    async scrape({ page }) {
      const listings: ScrapedListing[] = [];
      const maxPaginas = config.maxPaginas ?? MAX_PAGINAS_PADRAO;
      let paginasVisitadas = 0;

      for (let pagina = 1; pagina <= maxPaginas; pagina++) {
        const separador = config.urlListagem.includes("?") ? "&" : "?";
        const url = `${config.urlListagem}${separador}page=${pagina}`;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForSelector("div.cursor-pointer", { timeout: 15_000 }).catch(() => {});
        const cards = await extractCards(page);
        paginasVisitadas += 1;
        if (pagina === 1 && cards.length === 0) {
          throw new Error(`Market Imóvel retornou pagina 1 sem cards (titulo="${await page.title()}", url="${url}")`);
        }
        if (cards.length === 0) break;

        for (const card of cards) {
          const { bairro, cidade } = enderecoPartes(card.endereco);
          listings.push({
            externalId: card.codigo,
            urlOriginal: slugDetalhe(card.titulo, card.codigo ?? "", config.urlListagem),
            titulo: card.titulo || null,
            tipoImovel: card.titulo?.split(" para ")[0] ?? null,
            cidade, bairro, preco: moeda(card.texto),
            areaUtil: numero(card.texto, /(\d+(?:[.,]\d+)?)\s*m²/i),
            dormitorios: numero(card.texto, /(\d+)\s+quartos?/i),
            banheiros: numero(card.texto, /(\d+)\s+banheiros?/i),
            vagas: numero(card.texto, /(\d+)\s+vagas?/i),
          });
        }
        await page.waitForTimeout(PAUSA_ENTRE_PAGINAS_MS);
      }
      return { listings, paginasVisitadas };
    },
  };
}
