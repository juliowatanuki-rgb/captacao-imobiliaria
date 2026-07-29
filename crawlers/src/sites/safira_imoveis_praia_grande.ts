// Inspecionado ao vivo em 2026-07-29 contra
// https://www.safiraimoveispraiagrande.com.br. Plataforma real: Nido
// (confirmado - mesmo CDN objectstorage.sa-saopaulo-1.oraclecloud.com usado
// por moradanapraia.com.br), PORÉM com um template visual diferente do
// documentado em platforms/nido.ts (cards ".property-box-7", nao ".card1") -
// por isso este site tem scrape() proprio em vez de reaproveitar
// createNidoCrawler. Reaproveitavel se aparecer outro site Nido com este
// mesmo template.
//
// Estrutura de card validada manualmente em
// https://www.safiraimoveispraiagrande.com.br/imoveis/venda/SP/praia-grande/1:
// <div class="property-box-7">
//   <div class="property-thumbnail">
//     <a class="property-img" href="{urlDetalhe}">
//       <div class="price-box"><span>R$ {preco}</span></div>
//     </a>
//   </div>
//   <div class="detail">
//     <h1 class="title"><a>{Bairro}</a></h1>
//     <div class="location"><a>{Cidade}&nbsp;|&nbsp;{Tipo}&nbsp;|&nbsp;REF.:{codigo}</a></div>
//   </div>
//   <ul class="facilities-list">
//     <li><span>Área Útil</span>{area}m²</li>
//     <li><span>Dormitórios</span>{N}</li>   (pode faltar)
//     <li><span>Suítes</span>{N}</li>        (pode faltar)
//     <li><span>Vagas</span>{N}</li>         (pode faltar)
//   </ul>
// </div>
// Paginacao via path: {urlListagem}/{N} (pagina 1 tambem aceita o sufixo "/1").
// Validado ao vivo em 2026-07-29: 511 imoveis, 6/pagina (~86 paginas), URL ja
// filtrada por Praia Grande (nao ha contaminacao de outras cidades).
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.

import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const MAX_PAGINAS = 120;
const MAX_TENTATIVAS_PAGINA_VAZIA = 3;

interface RawCard {
  href: string;
  bairro: string | null;
  locationTexto: string | null;
  preco: string;
  facilidades: string[];
}

async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".property-box-7"));
    return cards.map((card) => {
      const link = card.querySelector<HTMLAnchorElement>(".property-thumbnail a.property-img");
      const bairro = card.querySelector(".detail .title a")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const locationTexto =
        card.querySelector(".detail .location a")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const preco = card.querySelector(".price-box span")?.textContent?.trim() ?? "";
      const facilidades = Array.from(card.querySelectorAll(".facilities-list li")).map(
        (li) => li.textContent?.replace(/\s+/g, " ").trim() ?? ""
      );
      return { href: link?.href ?? "", bairro, locationTexto, preco, facilidades };
    });
  });
}

function parseMoeda(texto: string): number | null {
  const numeros = texto.replace(/[^\d,]/g, "").replace(",", ".");
  const valor = Number.parseFloat(numeros);
  return Number.isFinite(valor) ? valor : null;
}

function parseFacilidade(facilidades: string[], rotulo: string): number | null {
  const item = facilidades.find((f) => f.startsWith(rotulo));
  if (!item) return null;
  const match = item.slice(rotulo.length).match(/([\d.,]+)/);
  if (!match) return null;
  const valor = Number.parseFloat(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
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

const siteCrawler: SiteCrawlerModule = {
  async scrape({ page, urlListagem }) {
    const listings: ScrapedListing[] = [];
    let paginasVisitadas = 0;
    const baseSemBarra = urlListagem.replace(/\/$/, "");

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const url = `${baseSemBarra}/${pagina}`;

      let cards: RawCard[] = [];
      for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_PAGINA_VAZIA; tentativa++) {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".property-box-7", { timeout: 15_000 }).catch(() => {});
        cards = await extractCards(page);
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
          areaUtil: parseFacilidade(card.facilidades, "Área Útil"),
          dormitorios: parseFacilidade(card.facilidades, "Dormitórios"),
          suites: parseFacilidade(card.facilidades, "Suítes"),
          vagas: parseFacilidade(card.facilidades, "Vagas"),
        });
      }

      await page.waitForTimeout(800);
    }

    return { listings, paginasVisitadas };
  },
};

export default siteCrawler;
