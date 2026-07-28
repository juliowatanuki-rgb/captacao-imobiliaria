// Motor generico para imobiliarias que usam a plataforma Microsistec ("site
// para imobiliaria desenvolvido por Microsistec" - microsistec.com.br), com
// fotos hospedadas em vault.imob.online.
//
// Estrutura de card validada manualmente em felicianoassociadosimoveis.com.br
// em 2026-07-28:
// <article class="box-construction-8">
//   <header>
//     <b>Cod: {codigo}</b>
//     ... carrossel de fotos ...
//   </header>
//   <section>
//     <div class="info">
//       <span>R$&nbsp;{preco}</span>  (pode faltar quando o imovel e "sob consulta")
//       <b>{Cidade}<br>{Bairro}</b>  (textContent normalizado vira "Cidade - Bairro")
//     </div>
//     <h2>{Tipo} para Comprar em {Cidade}, {Bairro}, {N} quartos</h2>
//     <ul>
//       <li><span>quartos</span><b>{N}</b></li>
//       <li><span>vaga</span><b>{N}</b></li>
//       <li><span>banheiro</span><b>{N}</b></li>
//       <li><span>área m2</span><b>{N}</b></li>
//       <li><a href="{urlDetalhe}" class="...background-cta">Saiba mais</a></li>
//     </ul>
//   </section>
// </article>
// urlDetalhe segue o padrao /detalhes/imovel/{tipo-slug}/{cidade-slug}/{bairro-slug}/codigo/{codigo}.
//
// Paginacao via querystring `&page=N` (o site guarda os filtros correntes em
// `?filters=` como um JSON base64 - reaproveitamos o valor de filters presente
// na urlListagem configurada e so trocamos/adicionamos o `page`).
//
// Atencao: o site retorna 403 Forbidden para o User-Agent padrao do
// Playwright (bloqueio por WAF) - contornado com page.setExtraHTTPHeaders
// definindo um User-Agent de navegador comum antes de qualquer goto.

import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const MAX_PAGINAS_PADRAO = 200;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface RawCard {
  href: string;
  codigo: string | null;
  preco: string;
  localizacao: string | null;
  tituloH2: string | null;
  itens: string[];
}

async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>("article.box-construction-8"));
    return cards.map((card) => {
      const link = card.querySelector<HTMLAnchorElement>("section a.background-cta") ??
        card.querySelector<HTMLAnchorElement>("section > a");
      const codigo = card.querySelector("header b")?.textContent?.trim() ?? null;
      const preco = card.querySelector(".info span")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const localizacao = card.querySelector(".info b")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const tituloH2 = card.querySelector("h2")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const itens = Array.from(card.querySelectorAll("ul > li")).map(
        (li) => li.textContent?.replace(/\s+/g, " ").trim() ?? ""
      );
      return { href: link?.href ?? "", codigo, preco, localizacao, tituloH2, itens };
    });
  });
}

function parseMoeda(texto: string): number | null {
  const match = texto.match(/\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?/);
  if (!match) return null;
  const valor = Number.parseFloat(match[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
}

function parseItemNumero(itens: string[], rotulo: RegExp): number | null {
  for (const item of itens) {
    if (rotulo.test(item)) {
      const match = item.match(/([\d.,]+)\s*$/) ?? item.match(/(\d+(?:[.,]\d+)?)/);
      if (match) {
        const valor = Number.parseFloat(match[1].replace(",", "."));
        return Number.isFinite(valor) ? valor : null;
      }
    }
  }
  return null;
}

function extractEndereco(localizacao: string | null): { cidade: string | null; bairro: string | null } {
  if (!localizacao) return { cidade: null, bairro: null };
  const partes = localizacao.split("-").map((p) => p.trim());
  return { cidade: partes[0] || null, bairro: partes[1] || null };
}

function extractCodigo(codigoTexto: string | null, href: string): string | null {
  const fromTexto = codigoTexto?.match(/(\d+)/);
  if (fromTexto) return fromTexto[1];
  const fromHref = href.match(/\/codigo\/(\d+)/);
  return fromHref ? fromHref[1] : null;
}

function extractTipoImovel(tituloH2: string | null): string | null {
  if (!tituloH2) return null;
  const match = tituloH2.match(/^(.+?)\s+para\s+(Comprar|Alugar)/i);
  return match ? match[1].trim() : null;
}

function comPagina(urlListagem: string, pagina: number): string {
  const url = new URL(urlListagem);
  url.searchParams.set("page", String(pagina));
  return url.toString();
}

export interface MicrosistecConfig {
  urlListagem: string;
  maxPaginas?: number;
}

export function createMicrosistecCrawler(config: MicrosistecConfig): SiteCrawlerModule {
  return {
    async scrape({ page }) {
      const listings: ScrapedListing[] = [];
      const maxPaginas = config.maxPaginas ?? MAX_PAGINAS_PADRAO;
      let paginasVisitadas = 0;

      await page.setExtraHTTPHeaders({ "User-Agent": USER_AGENT });

      for (let pagina = 1; pagina <= maxPaginas; pagina++) {
        const url = comPagina(config.urlListagem, pagina);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        paginasVisitadas += 1;

        await page.waitForSelector("article.box-construction-8", { timeout: 15_000 }).catch(() => {});

        let cards = await extractCards(page);
        if (cards.length === 0) {
          // Uma pagina vazia pode ser o fim real da paginacao OU uma
          // renderizacao lenta (visto na pratica em coruja.ts, onde
          // reexecucoes sucessivas encontravam mais paginas reais do que a
          // anterior por causa desse falso-vazio transitorio) - espera mais
          // um pouco e tenta de novo uma unica vez antes de concluir.
          await page.waitForTimeout(2_000);
          await page.waitForSelector("article.box-construction-8", { timeout: 10_000 }).catch(() => {});
          cards = await extractCards(page);
          if (cards.length === 0) break;
        }

        for (const card of cards) {
          if (!card.href) continue;
          const { cidade, bairro } = extractEndereco(card.localizacao);

          listings.push({
            externalId: extractCodigo(card.codigo, card.href),
            urlOriginal: card.href,
            titulo: card.tituloH2,
            tipoImovel: extractTipoImovel(card.tituloH2),
            cidade,
            bairro,
            preco: parseMoeda(card.preco),
            areaUtil: parseItemNumero(card.itens, /área/i),
            dormitorios: parseItemNumero(card.itens, /quarto/i),
            banheiros: parseItemNumero(card.itens, /banheiro/i),
            vagas: parseItemNumero(card.itens, /vaga/i),
          });
        }
      }

      return { listings, paginasVisitadas };
    },
  };
}
