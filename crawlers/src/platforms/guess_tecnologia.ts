// Motor generico para imobiliarias que usam a plataforma GUESS Tecnologia
// (identificada pelo rodape "guesstecnologia.com.br" e por ser ASP.NET
// WebForms classico - IDs tipo ContentPlaceHolder1_..., postback via
// __doPostBack/UpdatePanel).
//
// Estrutura de card validada manualmente em
// plazaimoveisempreendimentos.com/praia-grande/imoveis/venda em 2026-07-28:
// <div class="item-imovel">
//   <a href="/imovel/{slug}/{ref}/">
//     <div class="bloco-classificacao">{Tipo}</div>
//     <div class="bloco-negocio">{Negocio}</div>
//     <div class="bloco-localizacao">{Bairro}</div>
//     <div class="item-icone"><i class="fa-bed"></i>{N}</div>
//     <div class="item-icone"><i class="fa-shower"></i>{N}</div>
//     <div class="item-icone"><i class="fa-car"></i>{N}</div>
//     <div class="bloco-valor">R$ {preco}</div>
//   </a>
//   Ref.: {codigo}
// </div>
//
// LIMITACAO IMPORTANTE: o site e multi-tenant por cidade no path (a raiz do
// dominio sem "/praia-grande" resolve para outro tenant - ex: Marilia/SP) e a
// paginacao alem da 1a pagina normalmente usa __doPostBack/UpdatePanel do
// ASP.NET, nao uma URL navegavel direto. No momento da inspecao a listagem de
// Praia Grande tinha so 5 imoveis / 1 pagina, entao este motor NAO implementa
// paginacao via postback ainda - so le a pagina inicial informada. Se o
// numero de imoveis crescer a ponto de precisar de mais paginas, sera preciso
// simular o postback (clicar no link "proxima pagina" via Playwright) antes
// de usar este motor em producao.

import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

interface RawCard {
  href: string;
  classificacao: string | null;
  negocio: string | null;
  bairro: string | null;
  preco: string;
  icones: string[];
  refTexto: string;
}

async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>("div.item-imovel"));
    return cards.map((card) => {
      const link = card.querySelector<HTMLAnchorElement>("a");
      return {
        href: link?.href ?? "",
        classificacao: card.querySelector(".bloco-classificacao")?.textContent?.trim() ?? null,
        negocio: card.querySelector(".bloco-negocio")?.textContent?.trim() ?? null,
        bairro: card.querySelector(".bloco-localizacao")?.textContent?.trim() ?? null,
        preco: card.querySelector(".bloco-valor")?.textContent?.trim() ?? "",
        icones: Array.from(card.querySelectorAll(".item-icone")).map((el) => el.textContent?.trim() ?? ""),
        refTexto: card.textContent?.trim() ?? "",
      };
    });
  });
}

function parseMoeda(texto: string): number | null {
  // O bloco de preco pode ter outro texto colado (ex: Ref.) - pega so o
  // primeiro numero formatado, em vez de concatenar todos os digitos do texto.
  const match = texto.match(/\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?/);
  if (!match) return null;
  const valor = Number.parseFloat(match[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
}

function parseIconeNumero(icones: string[], indice: number): number | null {
  const texto = icones[indice];
  if (!texto) return null;
  const match = texto.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function extractCodigo(refTexto: string): string | null {
  const match = refTexto.match(/Ref\.?:?\s*(\d+)/i);
  return match ? match[1] : null;
}

export interface GuessTecnologiaConfig {
  urlListagem: string;
}

export function createGuessTecnologiaCrawler(config: GuessTecnologiaConfig): SiteCrawlerModule {
  return {
    async scrape({ page }) {
      const listings: ScrapedListing[] = [];

      await page.goto(config.urlListagem, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("div.item-imovel", { timeout: 15_000 }).catch(() => {});

      const cards = await extractCards(page);
      for (const card of cards) {
        if (!card.href) continue;

        listings.push({
          externalId: extractCodigo(card.refTexto),
          urlOriginal: card.href,
          titulo: card.classificacao,
          tipoImovel: card.classificacao,
          bairro: card.bairro,
          preco: parseMoeda(card.preco),
          dormitorios: parseIconeNumero(card.icones, 0),
          banheiros: parseIconeNumero(card.icones, 1),
          vagas: parseIconeNumero(card.icones, 2),
        });
      }

      return { listings, paginasVisitadas: 1 };
    },
  };
}
