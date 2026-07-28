// Motor generico para imobiliarias que usam a plataforma Imobzi
// (identificada pelo Angular custom-element <imobzi-property-card>, pelas
// imagens hospedadas em imobzi.storage.googleapis.com / firebasestorage.app
// (bucket "imobzi-app-production") e pela API auxiliar api2.imobzi.app).
//
// Estrutura de card validada manualmente em housefort.com.br em 2026-07-28
// (SPA Angular com SSR - o HTML ja vem com os cards renderizados, sem
// necessidade de esperar chamadas XHR):
// <imobzi-property-card>
//   <mat-card>
//     ...
//     <a href="/imovel/{slug}-code-{codigo}">{imagens}</a>   (link dentro da galeria)
//     <h3 class="h3 color-title property-title" title="{Tipo} em {Bairro} - {Cidade}, {UF}">...</h3>
//     <h3 class="h2 color-title"> R$ {preco} <span class="small">/venda</span></h3>
//     <h3 class="h3 color-title neighborhood-title">Cod: {codigo}</h3>
//     <div class="icons">
//       <p title="Dormitorios">{n}</p>
//       <p title="Banheiros">{n}</p>
//       <p title="Suites">{n}</p>
//       <p title="Vagas">{n}</p>
//       <p title="useful_area">{area} m2</p>
//     </div>
//   </mat-card>
// </imobzi-property-card>
// A paginacao e feita via query string `&page=N` (SSR, navegavel direto por URL).
//
// IMPORTANTE (secao 18): a busca `/buscar` deste site parece ser compartilhada
// por uma rede/franquia - ela retorna imoveis de VARIAS cidades do Brasil
// (nao so da cidade da imobiliaria), sem uma URL dedicada so para Praia
// Grande. O titulo do card normalmente termina em "- {Cidade}, {UF}", mas
// tem variacoes sujas (sem UF, com texto extra tipo "por 549000" colado).
// Por isso o filtro definitivo de cidade usa o href do imovel (que sempre
// contem o slug "-praia-grande-" quando o imovel e de Praia Grande) e nao o
// texto do titulo - imoveis sem esse slug no href sao descartados aqui
// mesmo (nao sao devolvidos pelo crawler).

import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const MAX_PAGINAS_PADRAO = 150;

interface RawCard {
  href: string;
  codigoTexto: string | null;
  tituloAttr: string | null;
  precoTexto: string;
  icones: { titulo: string | null; texto: string }[];
}

// Nota: esta funcao roda serializada dentro da pagina via page.evaluate.
// Evitar declarar funcoes nomeadas aqui dentro - o transform do tsx/esbuild
// injeta chamadas a um helper "__name" que nao existe no contexto da pagina
// (erro "__name is not defined"), ver aviso em platforms/imoview.ts.
async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>("imobzi-property-card"));
    return cards.map((card) => {
      const href = card.querySelector<HTMLAnchorElement>('a[href^="/imovel/"]')?.href ?? "";
      const codigoTexto = card.querySelector(".neighborhood-title")?.textContent?.trim() ?? null;
      const tituloEl = card.querySelector(".property-title");
      const tituloAttr = tituloEl?.getAttribute("title") ?? tituloEl?.textContent?.trim() ?? null;
      const precoEl = Array.from(card.querySelectorAll("h3.color-title")).find((el) =>
        (el.textContent ?? "").includes("R$")
      );
      const precoTexto = precoEl?.childNodes[0]?.textContent?.trim() ?? "";
      const icones = Array.from(card.querySelectorAll(".icons p")).map((el) => ({
        titulo: el.getAttribute("title"),
        texto: el.textContent?.replace(/\s+/g, " ").trim() ?? "",
      }));
      return { href, codigoTexto, tituloAttr, precoTexto, icones };
    });
  });
}

function parseMoeda(texto: string): number | null {
  const numeros = texto.replace(/[^\d,]/g, "").replace(",", ".");
  const valor = Number.parseFloat(numeros);
  return Number.isFinite(valor) ? valor : null;
}

// Remove acentos para comparar titulos de icone (o site usa "Dormitórios",
// "Suítes" etc. com acentuacao, mas nao vale a pena depender disso).
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function parseIconeNumero(icones: RawCard["icones"], tituloIcone: string): number | null {
  const alvo = normalizar(tituloIcone);
  const item = icones.find((i) => i.titulo && normalizar(i.titulo) === alvo);
  if (!item) return null;
  const match = item.texto.match(/([\d.,]+)/);
  if (!match) return null;
  const valor = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
}

function extractCodigo(codigoTexto: string | null, href: string): string | null {
  if (codigoTexto) {
    const match = codigoTexto.match(/(\d+)/);
    if (match) return match[1];
  }
  const matchHref = href.match(/-code-(\d+)/i);
  return matchHref ? matchHref[1] : null;
}

// Formato tipico do titulo: "{Tipo} em {Bairro} - {Cidade}, {UF}" (com variacoes sujas).
function extractBairro(tituloAttr: string | null): string | null {
  if (!tituloAttr) return null;
  const match = tituloAttr.match(/\bem\s+(.+?)\s*[-–]\s*.+$/i);
  return match ? match[1].trim() : null;
}

function isPraiaGrande(href: string): boolean {
  return /-praia-grande(-|$)/i.test(href);
}

export interface ImobziConfig {
  urlListagem: string;
  maxPaginas?: number;
}

export function createImobziCrawler(config: ImobziConfig): SiteCrawlerModule {
  return {
    async scrape({ page }) {
      const listings: ScrapedListing[] = [];
      const maxPaginas = config.maxPaginas ?? MAX_PAGINAS_PADRAO;
      let paginasVisitadas = 0;

      for (let pagina = 1; pagina <= maxPaginas; pagina++) {
        const separador = config.urlListagem.includes("?") ? "&" : "?";
        const url = pagina === 1 ? config.urlListagem : `${config.urlListagem}${separador}page=${pagina}`;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        paginasVisitadas += 1;

        await page.waitForSelector("imobzi-property-card", { timeout: 15_000 }).catch(() => {});

        const cards = await extractCards(page);
        if (cards.length === 0) break;

        for (const card of cards) {
          if (!card.href) continue;
          if (!isPraiaGrande(card.href)) continue; // fora do escopo (rede nacional)

          listings.push({
            externalId: extractCodigo(card.codigoTexto, card.href),
            urlOriginal: card.href,
            titulo: card.tituloAttr,
            tipoImovel: card.tituloAttr,
            cidade: "Praia Grande",
            bairro: extractBairro(card.tituloAttr),
            preco: parseMoeda(card.precoTexto),
            areaUtil: parseIconeNumero(card.icones, "useful_area"),
            dormitorios: parseIconeNumero(card.icones, "Dormitorios"),
            suites: parseIconeNumero(card.icones, "Suites"),
            banheiros: parseIconeNumero(card.icones, "Banheiros"),
            vagas: parseIconeNumero(card.icones, "Vagas"),
          });
        }
      }

      return { listings, paginasVisitadas };
    },
  };
}
