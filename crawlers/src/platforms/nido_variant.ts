// Motor generico para sites Nido que usam um template diferente do
// documentado em platforms/nido.ts (cards ".card1"). Ha pelo menos 2
// variantes desse outro template, com container e seletor de preco
// diferentes mas o resto identico:
//   - "property-box-7" (safira_imoveis_praia_grande.ts): preco em
//     ".price-box span".
//   - "property-box-5" (bueno_santos_imoveis.ts): preco em
//     ".price-ratings-box .price".
// Estrutura comum (validada ao vivo em 2026-07-29 em ambos os sites):
// <div class="{cardSelector}">
//   <div class="property-thumbnail">
//     <a class="property-img" href="{urlDetalhe}">{preco no priceSelector}</a>
//   </div>
//   <div class="detail">
//     <h1 class="title"><a>{Bairro}</a></h1>
//     <div class="location"><a>{Cidade}&nbsp;|&nbsp;{Tipo}&nbsp;|&nbsp;REF.:{codigo}</a></div>
//   </div>
//   <ul class="facilities-list">...</ul>   (ordem rotulo/numero varia por site -
//     por isso os parsers abaixo usam regex sobre o texto inteiro do item, nao
//     dependem de qual vem primeiro)
// </div>
// Paginacao via path: {urlListagem}/{N} (pagina 1 tambem aceita o sufixo "/1").

import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const MAX_PAGINAS_PADRAO = 120;
const MAX_TENTATIVAS_PAGINA_VAZIA = 3;

interface RawCard {
  href: string;
  bairro: string | null;
  locationTexto: string | null;
  preco: string;
  facilidades: string[];
}

function parseMoeda(texto: string): number | null {
  const numeros = texto.replace(/[^\d,]/g, "").replace(",", ".");
  const valor = Number.parseFloat(numeros);
  return Number.isFinite(valor) ? valor : null;
}

function parseFacilidade(facilidades: string[], padrao: RegExp): number | null {
  for (const item of facilidades) {
    const match = item.match(padrao);
    if (match) {
      const valor = Number.parseFloat(match[1].replace(/\./g, "").replace(",", "."));
      return Number.isFinite(valor) ? valor : null;
    }
  }
  return null;
}

// "Praia Grande | Apartamento | REF.:SI2933" -> { cidade, tipo, codigo }
function parseLocation(texto: string | null): { cidade: string | null; tipo: string | null; codigo: string | null } {
  if (!texto) return { cidade: null, tipo: null, codigo: null };
  const partes = texto.split("|").map((p) => p.trim());
  const codigoMatch = texto.match(/REF\.:\s*(\S+)/i);
  return {
    cidade: partes[0] || null,
    tipo: partes[1] || null,
    codigo: codigoMatch ? codigoMatch[1] : null,
  };
}

export interface NidoVariantConfig {
  urlListagem: string;
  /** Classe do container do card, sem o ponto (ex: "property-box-7"). */
  cardSelector: string;
  /** Seletor CSS do preco, relativo ao card (ex: ".price-box span"). */
  priceSelector: string;
  maxPaginas?: number;
}

export function createNidoVariantCrawler(config: NidoVariantConfig): SiteCrawlerModule {
  return {
    async scrape({ page }) {
      const listings: ScrapedListing[] = [];
      const maxPaginas = config.maxPaginas ?? MAX_PAGINAS_PADRAO;
      let paginasVisitadas = 0;
      const baseSemBarra = config.urlListagem.replace(/\/$/, "");

      for (let pagina = 1; pagina <= maxPaginas; pagina++) {
        const url = `${baseSemBarra}/${pagina}`;

        let cards: RawCard[] = [];
        for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_PAGINA_VAZIA; tentativa++) {
          await page.goto(url, { waitUntil: "domcontentloaded" });
          await page
            .waitForSelector(`.${config.cardSelector}`, { timeout: 15_000 })
            .catch(() => {});
          cards = await extractCards(page, config.cardSelector, config.priceSelector);
          if (cards.length > 0) break;
          if (tentativa < MAX_TENTATIVAS_PAGINA_VAZIA) {
            await page.waitForTimeout(1_000 * tentativa);
          }
        }

        paginasVisitadas += 1;
        if (cards.length === 0) break;

        for (const card of cards) {
          if (!card.href) continue;
          const { cidade, tipo, codigo } = parseLocation(card.locationTexto);
          listings.push({
            externalId: codigo,
            urlOriginal: card.href,
            titulo: tipo && card.bairro ? `${tipo} em ${card.bairro}` : tipo ?? card.bairro,
            tipoImovel: tipo,
            cidade,
            bairro: card.bairro,
            preco: parseMoeda(card.preco),
            areaUtil: parseFacilidade(card.facilidades, /([\d.,]+)\s*m²/i),
            dormitorios: parseFacilidade(card.facilidades, /(\d+)\s*dorm/i),
            suites: parseFacilidade(card.facilidades, /(\d+)\s*su[íi]te/i),
            vagas: parseFacilidade(card.facilidades, /(\d+)\s*vaga/i),
          });
        }

        await page.waitForTimeout(800);
      }

      return { listings, paginasVisitadas };
    },
  };
}

async function extractCards(page: Page, cardSelector: string, priceSelector: string): Promise<RawCard[]> {
  return page.evaluate(
    ({ cardSelector, priceSelector }) => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>(`.${cardSelector}`));
      return cards.map((card) => {
        const link = card.querySelector<HTMLAnchorElement>(".property-thumbnail a.property-img");
        const bairro = card.querySelector(".detail .title a")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
        const locationTexto =
          card.querySelector(".detail .location a")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
        const preco = card.querySelector(priceSelector)?.textContent?.trim() ?? "";
        const facilidades = Array.from(card.querySelectorAll(".facilities-list li")).map(
          (li) => li.textContent?.replace(/\s+/g, " ").trim() ?? ""
        );
        return { href: link?.href ?? "", bairro, locationTexto, preco, facilidades };
      });
    },
    { cardSelector, priceSelector }
  );
}
