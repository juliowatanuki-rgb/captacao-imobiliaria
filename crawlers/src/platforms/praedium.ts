// Motor generico para imobiliarias que usam a plataforma Praedium
// (identificada pelo CDN cdn*.praedium.com.br nas imagens dos anuncios e pela
// URL /imoveis/a-venda[/<cidade>]). Reaproveitado pelos sites cadastrados com
// essa plataforma real (nao confundir com o "plataforma provavel" do seed,
// que era apenas um chute inicial - confirmar sempre inspecionando o site).
//
// Estrutura de card validada manualmente em imigrantesimoveis.com.br e
// tavaresepolati.com.br em 2026-07-28:
// <div class="thumbnail_one">
//   <a class="property-card-link" href="/imovel/{slug}-id-{codigo}">
//     <div class="property_pricing">R$ {preco}</div>
//   </a>
//   <div class="thum_one_content">
//     <a class="property-card-link" href="...">
//       <h2 class="property_card_heading">
//         <span class="color-primary">{Tipo} a Venda [com {N} quartos], {area}m2</span>
//         <span class="property_card_address">{Bairro}, {Cidade}-{UF}</span>
//       </h2>
//       <div class="thum_data"><ul>
//         <li><span>{N} Quartos</span></li>   (pode faltar)
//         <li><span>{N} Banheiros</span></li>
//         <li><span>{N} Vagas</span></li>     (pode faltar)
//         <li><span>{area} m2</span></li>
//       </ul></div>
//     </a>
//   </div>
// </div>
// A paginacao e feita via query string `?pagina=N` (server-side, navegavel
// direto por URL, com <ul class="pagination"> contendo rel="next" no ultimo item).
// O codigo do imovel vem embutido no final do slug da URL (`-id-{codigo}`),
// nao existe atributo separado nem parametro de query para ele.
//
// Instabilidade de paginacao observada em 2026-07-29 validando allprimeimoveis.com.br:
// uma coleta sequencial sem pausas as vezes sofre rate-limit/anti-bot e uma
// pagina no meio da lista vem vazia mesmo havendo mais itens depois (0 cards na
// pagina 1 numa segunda execucao imediatamente apos a primeira, quando a
// primeira trouxe 880 imoveis). Corrigido com pausa entre paginas + retry com
// reload se a pagina vier vazia (mesma licao aplicada em coruja.ts e nido.ts).

import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const MAX_PAGINAS_PADRAO = 150;
const CODIGO_REGEX = /-id-(\d+)\/?$/;
const PAUSA_ENTRE_PAGINAS_MS = 800;
const MAX_TENTATIVAS_PAGINA_VAZIA = 3;

interface RawCard {
  href: string;
  titulo: string;
  endereco: string | null;
  preco: string;
  dados: string[];
}

// Nota: roda serializada dentro da pagina via page.evaluate - evitar funcoes
// nomeadas aqui dentro (ver crawlers/src/platforms/imoview.ts para o motivo).
async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>("div.thumbnail_one"));
    return cards.map((card) => {
      const link = card.querySelector<HTMLAnchorElement>("a.property-card-link");
      const titulo = card.querySelector(".property_card_heading .color-primary")?.textContent?.replace(/\s+/g, " ").trim()
        ?? card.querySelector(".property_card_heading")?.textContent?.replace(/\s+/g, " ").trim()
        ?? "";
      const endereco = card.querySelector(".property_card_address")?.textContent?.trim() ?? null;
      const preco = card.querySelector(".property_pricing")?.textContent?.trim() ?? "";
      const dados = Array.from(card.querySelectorAll(".thum_data li span")).map(
        (span) => span.textContent?.trim() ?? ""
      );
      return {
        href: link?.href ?? "",
        titulo,
        endereco,
        preco,
        dados,
      };
    });
  });
}

function parseMoeda(texto: string): number | null {
  const numeros = texto.replace(/[^\d,]/g, "").replace(",", ".");
  const valor = Number.parseFloat(numeros);
  return Number.isFinite(valor) ? valor : null;
}

function parseDadoNumero(dados: string[], padrao: RegExp): number | null {
  for (const dado of dados) {
    const match = dado.match(padrao);
    if (match) {
      const valor = Number.parseFloat(match[1].replace(",", "."));
      return Number.isFinite(valor) ? valor : null;
    }
  }
  return null;
}

function extractCodigo(href: string): string | null {
  const match = href.match(CODIGO_REGEX);
  return match ? match[1] : null;
}

function extractTipoImovel(titulo: string): string | null {
  const match = titulo.match(/^(.+?)\s+[àa]\s+venda/i);
  return match ? match[1].trim() : null;
}

function extractEndereco(endereco: string | null): { bairro: string | null; cidade: string | null } {
  if (!endereco) return { bairro: null, cidade: null };
  const partes = endereco.split(",").map((p) => p.trim());
  const bairro = partes[0] || null;
  const cidade = partes[1] ? partes[1].replace(/-[A-Z]{2}$/, "").trim() : null;
  return { bairro, cidade };
}

export interface PraediumConfig {
  urlListagem: string;
  maxPaginas?: number;
}

export function createPraediumCrawler(config: PraediumConfig): SiteCrawlerModule {
  return {
    async scrape({ page }) {
      const listings: ScrapedListing[] = [];
      const maxPaginas = config.maxPaginas ?? MAX_PAGINAS_PADRAO;
      let paginasVisitadas = 0;

      for (let pagina = 1; pagina <= maxPaginas; pagina++) {
        const separador = config.urlListagem.includes("?") ? "&" : "?";
        const url = `${config.urlListagem}${separador}pagina=${pagina}`;

        let cards: RawCard[] = [];
        for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_PAGINA_VAZIA; tentativa++) {
          await page.goto(url, { waitUntil: "domcontentloaded" });
          await page.waitForSelector("div.thumbnail_one", { timeout: 15_000 }).catch(() => {});
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
          const { bairro, cidade } = extractEndereco(card.endereco);

          listings.push({
            externalId: extractCodigo(card.href),
            urlOriginal: card.href,
            titulo: card.titulo || null,
            tipoImovel: extractTipoImovel(card.titulo),
            cidade,
            bairro,
            preco: parseMoeda(card.preco),
            areaUtil: parseDadoNumero(card.dados, /([\d.,]+)\s*m²/i),
            dormitorios: parseDadoNumero(card.dados, /(\d+)\s*Quarto/i),
            vagas: parseDadoNumero(card.dados, /(\d+)\s*Vaga/i),
            banheiros: parseDadoNumero(card.dados, /(\d+)\s*Banheiro/i),
          });
        }

        await page.waitForTimeout(PAUSA_ENTRE_PAGINAS_MS);
      }

      return { listings, paginasVisitadas };
    },
  };
}
