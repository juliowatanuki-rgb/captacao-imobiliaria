// Inspecionado ao vivo em 2026-07-29 contra https://spinolaimob.com.br.
// Plataforma real: USO / Agiliza (produto da Union Softwares - confirmado
// pelo CDN cdn.uso.com.br nas fotos), PORÉM com o template visual "novo"
// (redesign do produto: cards ".link_resultado" com classes "titulo_novo" /
// "valor_novo", nada a ver com o template documentado em
// platforms/uso_softwares.ts) - por isso este site tem scrape() proprio em
// vez de reaproveitar createUsoSoftwaresCrawler. Reaproveitavel se aparecer
// outro site USO com este mesmo template "novo".
//
// So 2 imoveis em Praia Grande no momento da validacao (inventario pequeno,
// mas site funcional e plataforma ja mapeada).
//
// Estrutura de card validada manualmente em
// https://spinolaimob.com.br/imoveis/sp/praia-grande/:
// <div class="link_resultado">
//   <a class="botao_ver_mais" href="{urlDetalhe}">Ver mais</a>
//   <h3 class="titulo_novo">{Tipo}</h3>
//   <div class="valor_novo"><small>VENDA</small><h5>R$ {preco}</h5></div>
//   <div class="icones_caracteristicas">
//     <div class="detalhe_novo">{N} quarto</div>    (pode faltar)
//     <div class="detalhe_novo">{N} banheiro</div>  (pode faltar)
//     <div class="detalhe_novo">{N} vaga</div>      (pode faltar)
//   </div>
//   <div class="final_card"><span>{Bairro} - {Cidade}/{UF}</span></div>
//   <div class="clicaveis_card"><a class="flag_ref"><span class="border1">Ref.{codigo}</span></a></div>
// </div>
// Paginacao confirmada via ".pagination a" -> href
// "javascript: paginacao('/imoveis/sp/praia-grande/pagina-{N}/')" - a URL
// dentro da chamada e navegavel diretamente (mesmo padrao dos links normais
// do site, ex: /comprar/pagina-1/). So existe a pagina 1 no momento da
// validacao (2 imoveis) - o loop segue o maior numero de pagina visto no
// proprio controle de paginacao, sem adivinhar um total fixo.
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.

import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const MAX_PAGINAS = 60;

interface RawCard {
  href: string;
  tipo: string | null;
  preco: string;
  bairroLinha: string | null;
  ref: string | null;
  caracteristicas: string[];
}

interface RawPagina {
  cards: RawCard[];
  maxPaginaVista: number;
}

async function extractPagina(page: Page): Promise<RawPagina> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".link_resultado")).map((card) => {
      const href = card.querySelector<HTMLAnchorElement>("a.botao_ver_mais")?.href ?? "";
      const tipo = card.querySelector(".titulo_novo")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const preco = card.querySelector(".valor_novo h5")?.textContent?.trim() ?? "";
      const bairroLinha = card.querySelector(".final_card span")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const ref =
        card.querySelector(".clicaveis_card .flag_ref .border1")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const caracteristicas = Array.from(card.querySelectorAll(".icones_caracteristicas .detalhe_novo")).map(
        (d) => d.textContent?.replace(/\s+/g, " ").trim() ?? ""
      );
      return { href, tipo, preco, bairroLinha, ref, caracteristicas };
    });

    const numerosPagina = Array.from(document.querySelectorAll(".pagination a"))
      .map((a) => Number.parseInt(a.textContent?.trim() ?? "", 10))
      .filter((n) => Number.isFinite(n));
    const maxPaginaVista = numerosPagina.length > 0 ? Math.max(...numerosPagina) : 1;

    return { cards, maxPaginaVista };
  });
}

function parseMoeda(texto: string): number | null {
  const numeros = texto.replace(/[^\d,]/g, "").replace(",", ".");
  const valor = Number.parseFloat(numeros);
  return Number.isFinite(valor) ? valor : null;
}

function parseCaracteristica(itens: string[], padrao: RegExp): number | null {
  for (const item of itens) {
    const match = item.match(padrao);
    if (match) {
      const valor = Number.parseFloat(match[1].replace(",", "."));
      return Number.isFinite(valor) ? valor : null;
    }
  }
  return null;
}

// "Caicara - Praia Grande/SP" -> { bairro: "Caicara", cidade: "Praia Grande" }
function parseBairroLinha(texto: string | null): { bairro: string | null; cidade: string | null } {
  if (!texto) return { bairro: null, cidade: null };
  const [bairro, resto] = texto.split(" - ");
  const cidade = resto ? resto.split("/")[0].trim() : null;
  return { bairro: bairro?.trim() ?? null, cidade };
}

const siteCrawler: SiteCrawlerModule = {
  async scrape({ page, urlListagem }) {
    const listings: ScrapedListing[] = [];
    let paginasVisitadas = 0;
    const baseSemBarra = urlListagem.replace(/\/$/, "");
    let maxPaginaVista = 1;

    for (let pagina = 1; pagina <= Math.min(maxPaginaVista, MAX_PAGINAS); pagina++) {
      const url = `${baseSemBarra}/pagina-${pagina}/`;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".link_resultado", { timeout: 15_000 }).catch(() => {});
      const { cards, maxPaginaVista: maxDestaPagina } = await extractPagina(page);

      paginasVisitadas += 1;
      maxPaginaVista = Math.max(maxPaginaVista, maxDestaPagina);
      if (cards.length === 0) break;

      for (const card of cards) {
        if (!card.href) continue;
        const { bairro, cidade } = parseBairroLinha(card.bairroLinha);
        const codigo = card.ref?.replace(/^Ref\.?\s*/i, "") ?? null;
        listings.push({
          externalId: codigo,
          urlOriginal: card.href,
          titulo: card.tipo && bairro ? `${card.tipo} em ${bairro}` : card.tipo,
          tipoImovel: card.tipo,
          cidade,
          bairro,
          preco: parseMoeda(card.preco),
          dormitorios: parseCaracteristica(card.caracteristicas, /(\d+)\s*quartos?/i),
          banheiros: parseCaracteristica(card.caracteristicas, /(\d+)\s*banheiros?/i),
          vagas: parseCaracteristica(card.caracteristicas, /(\d+)\s*vagas?/i),
        });
      }

      await page.waitForTimeout(800);
    }

    return { listings, paginasVisitadas };
  },
};

export default siteCrawler;
