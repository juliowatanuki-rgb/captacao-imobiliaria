// Motor generico para imobiliarias que usam a plataforma Imoview
// (identificada pelo CDN cdn.imoview.com.br nas imagens dos anuncios).
// Reaproveitado por varios sites cadastrados com essa plataforma (secao 3 da spec):
// basta criar um arquivo em crawlers/src/sites/<site_id>.ts chamando createImoviewCrawler
// com a urlListagem especifica daquele site.
//
// Estrutura de card validada manualmente em casaparisimoveis.com.br em 2026-07-28:
// <a class="meuLink" href="{urlDetalhe}" data-codigo-mae="{codigo}">
//   ...
//   <div class="container-endereco"><span class="card-text">{Bairro} | {Cidade}</span></div>
//   <h2 class="card-title">{Tipo} a venda no {Bairro}</h2>
//   <div class="preco-imovel-card"><strong>{preco}</strong></div>
//   <div class="container-icon"><img src=".../icon-area.svg"><span>{area} m2</span></div>
//   <div class="container-icon"><img src=".../icon-bed.svg"><span>{dormitorios}</span></div>
//   <div class="container-icon"><img src=".../icon-garage.svg"><span>{vagas}</span></div>
//   <div class="container-icon"><img src=".../icon-shower.svg"><span>{banheiros}</span></div>
// A paginacao e feita via query string `?pagina=N` (server-side, navegavel direto por URL).

import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const MAX_PAGINAS_PADRAO = 250;

interface RawCard {
  codigo: string | null;
  href: string;
  bairro: string | null;
  cidade: string | null;
  titulo: string;
  preco: string;
  area: string | null;
  dormitorios: string | null;
  vagas: string | null;
  banheiros: string | null;
}

// Nota: esta funcao roda serializada dentro da pagina via page.evaluate.
// Evitar declarar funcoes nomeadas (const fn = () => {} / function fn(){})
// aqui dentro - o transform do tsx/esbuild injeta chamadas a um helper
// `__name` para preservar o nome da funcao, que nao existe no contexto da
// pagina e quebra em runtime ("__name is not defined"). Por isso o mapeamento
// dos icones abaixo e feito com um loop simples em vez de uma arrow auxiliar.
async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLAnchorElement>("a.meuLink"));
    return cards.map((card) => {
      const enderecoText = card.querySelector(".container-endereco .card-text")?.textContent?.trim() ?? "";
      const [bairroRaw, cidadeRaw] = enderecoText.split("|").map((s) => s.trim());
      const titulo = card.querySelector(".card-title")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const preco = card.querySelector(".preco-imovel-card strong")?.textContent?.trim() ?? "";

      const iconesPorTipo: Record<string, string | null> = {
        "icon-area": null,
        "icon-bed": null,
        "icon-garage": null,
        "icon-shower": null,
      };
      const icons = Array.from(card.querySelectorAll(".container-icon"));
      for (const icon of icons) {
        const src = icon.querySelector("img")?.getAttribute("src") ?? "";
        const valor = icon.querySelector("span")?.textContent?.trim() ?? null;
        for (const tipo of Object.keys(iconesPorTipo)) {
          if (src.includes(tipo)) {
            iconesPorTipo[tipo] = valor;
          }
        }
      }

      return {
        codigo: card.getAttribute("data-codigo-mae"),
        href: card.href,
        bairro: bairroRaw || null,
        cidade: cidadeRaw || null,
        titulo,
        preco,
        area: iconesPorTipo["icon-area"],
        dormitorios: iconesPorTipo["icon-bed"],
        vagas: iconesPorTipo["icon-garage"],
        banheiros: iconesPorTipo["icon-shower"],
      };
    });
  });
}

function parseMoeda(texto: string): number | null {
  const numeros = texto.replace(/[^\d,]/g, "").replace(",", ".");
  const valor = Number.parseFloat(numeros);
  return Number.isFinite(valor) ? valor : null;
}

function parseArea(texto: string | null): number | null {
  if (!texto) return null;
  const numeros = texto.replace(/[^\d,]/g, "").replace(",", ".");
  const valor = Number.parseFloat(numeros);
  return Number.isFinite(valor) ? valor : null;
}

function parseInteiro(texto: string | null): number | null {
  if (!texto) return null;
  const valor = Number.parseInt(texto, 10);
  return Number.isFinite(valor) ? valor : null;
}

function extractTipoImovel(titulo: string): string | null {
  const match = titulo.match(/^(.+?)\s+[àa]\s+venda/i);
  return match ? match[1].trim() : null;
}

export interface ImoviewConfig {
  urlListagem: string;
  maxPaginas?: number;
}

export function createImoviewCrawler(config: ImoviewConfig): SiteCrawlerModule {
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

        // A listagem e renderizada via JS depois do carregamento inicial da pagina
        // (os cards nao existem no DOM em domcontentloaded). Se o seletor nunca
        // aparecer dentro do timeout, assume-se que chegou ao fim da paginacao.
        await page.waitForSelector("a.meuLink", { timeout: 15_000 }).catch(() => {});

        const cards = await extractCards(page);
        if (cards.length === 0) break;

        for (const card of cards) {
          listings.push({
            externalId: card.codigo,
            urlOriginal: card.href,
            titulo: card.titulo || null,
            tipoImovel: extractTipoImovel(card.titulo),
            cidade: card.cidade,
            bairro: card.bairro,
            preco: parseMoeda(card.preco),
            areaUtil: parseArea(card.area),
            dormitorios: parseInteiro(card.dormitorios),
            vagas: parseInteiro(card.vagas),
            banheiros: parseInteiro(card.banheiros),
          });
        }
      }

      return { listings, paginasVisitadas };
    },
  };
}
