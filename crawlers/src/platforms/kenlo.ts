// Motor generico para imobiliarias que usam a plataforma Kenlo
// (identificada pelo CDN static-sites.kenlo.io / img.kenlo.io / imgs.kenlo.io
// nas imagens e scripts dos anuncios).
//
// Estrutura de card validada manualmente em novacasarao.com.br em 2026-07-28
// (usar sempre o dominio com "www." - a raiz sem www retorna erro 552):
// <a class="card-with-buttons" href="/imovel/{slug}/{codigo}?from=sale">
//   <div class="card-with-buttons__code">{codigo}</div>
//   <div class="card-with-buttons__title">{Tipo}</div>
//   <div class="card-with-buttons__heading">{Bairro}, {Cidade}</div>
//   <ul>
//     <li>{area} m²</li>
//     <li>{N} Quarto(s)</li>   (pode faltar)
//     <li>{N} Banheiro(s)</li> (pode faltar)
//   </ul>
//   <div class="card-with-buttons__value">R$ {preco}</div>
// </a>
// Vagas/suites nao aparecem no card resumido (so na pagina de detalhe).
// A paginacao e feita via query string `?pagina=N` (server-side).

import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const MAX_PAGINAS_PADRAO = 400;

interface RawCard {
  href: string;
  codigo: string | null;
  titulo: string;
  heading: string | null;
  preco: string;
  itens: string[];
}

async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLAnchorElement>("a.card-with-buttons"));
    return cards.map((card) => {
      const codigo = card.querySelector(".card-with-buttons__code")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const titulo = card.querySelector(".card-with-buttons__title")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const heading = card.querySelector(".card-with-buttons__heading")?.textContent?.trim() ?? null;
      const preco = card.querySelector(".card-with-buttons__value")?.textContent?.trim() ?? "";
      const itens = Array.from(card.querySelectorAll("ul li")).map((li) => li.textContent?.trim() ?? "");
      return { href: card.href, codigo, titulo, heading, preco, itens };
    });
  });
}

function parseMoeda(texto: string): number | null {
  const numeros = texto.replace(/[^\d,]/g, "").replace(",", ".");
  const valor = Number.parseFloat(numeros);
  return Number.isFinite(valor) ? valor : null;
}

function parseItemNumero(itens: string[], padrao: RegExp): number | null {
  for (const item of itens) {
    const match = item.match(padrao);
    if (match) {
      const valor = Number.parseFloat(match[1].replace(",", "."));
      return Number.isFinite(valor) ? valor : null;
    }
  }
  return null;
}

function extractCodigoFromHref(href: string): string | null {
  const semQuery = href.split("?")[0];
  const partes = semQuery.split("/").filter(Boolean);
  return partes.length > 0 ? partes[partes.length - 1] : null;
}

function extractEndereco(heading: string | null): { bairro: string | null; cidade: string | null } {
  if (!heading) return { bairro: null, cidade: null };
  // Formato observado: "{Bairro} - {Cidade} - {UF}".
  const partes = heading.split(" - ").map((p) => p.trim());
  return { bairro: partes[0] || null, cidade: partes[1] || null };
}

export interface KenloConfig {
  urlListagem: string;
  maxPaginas?: number;
}

export function createKenloCrawler(config: KenloConfig): SiteCrawlerModule {
  return {
    async scrape({ page }) {
      const listings: ScrapedListing[] = [];
      const maxPaginas = config.maxPaginas ?? MAX_PAGINAS_PADRAO;
      let paginasVisitadas = 0;

      for (let pagina = 1; pagina <= maxPaginas; pagina++) {
        const separador = config.urlListagem.includes("?") ? "&" : "?";
        await page.goto(`${config.urlListagem}${separador}pagina=${pagina}`, {
          waitUntil: "domcontentloaded",
        });
        paginasVisitadas += 1;

        await page.waitForSelector("a.card-with-buttons", { timeout: 15_000 }).catch(() => {});

        const cards = await extractCards(page);
        if (cards.length === 0) break;

        for (const card of cards) {
          if (!card.href) continue;
          const { bairro, cidade } = extractEndereco(card.heading);

          listings.push({
            externalId: card.codigo ?? extractCodigoFromHref(card.href),
            urlOriginal: card.href,
            titulo: card.titulo || null,
            tipoImovel: card.titulo || null,
            cidade,
            bairro,
            preco: parseMoeda(card.preco),
            areaUtil: parseItemNumero(card.itens, /([\d.,]+)\s*m²/i),
            dormitorios: parseItemNumero(card.itens, /(\d+)\s*Quarto/i),
            banheiros: parseItemNumero(card.itens, /(\d+)\s*Banheiro/i),
          });
        }
      }

      return { listings, paginasVisitadas };
    },
  };
}
