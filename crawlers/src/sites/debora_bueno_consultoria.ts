// Inspecionado ao vivo em 2026-07-30 contra https://deborabuenoimoveis.com.br.
// Plataforma real: "Apresenta.me" (meta author "Apresenta.me ~ Plataforma
// Imobiliaria", CDN img.apre.me, script script.apre.me), primeira confirmacao
// dessa plataforma neste projeto.
//
// A listagem em /imoveis/ carrega so 18 cards inicialmente e usa um botao
// "Mostrar mais Imoveis" (".BtnShowMoreImovel") para carregar o restante via
// JS (nao ha paginacao por URL/querystring) - confirmado ao vivo: 1 clique
// adiciona +18 cards e decrementa o contador "Restam N registros". Por isso a
// coleta clica nesse botao repetidamente ate ele sumir do DOM.
//
// O filtro por cidade tambem e client-side (nao ha URL dedicada por cidade) -
// a listagem geral (441 imoveis) inclui outras cidades (Bertioga, Mongagua,
// Peruibe, Riviera de Sao Lourenco, Sao Paulo: ~10 imoveis). Como o campo
// ".Endereco .cidade" de cada card informa a cidade real, o filtro e feito no
// proprio parser (cards com cidade != "Praia Grande" sao descartados).
//
// Estrutura de card (".LI_Imovel"), validada ao vivo:
// <div class="LI_Imovel">
//   <a class="Title" href="{urlDetalhe}">{titulo}</a>
//   <div class="Categoria"><span class="Categoria">Residencial</span>»<span class="SubCategoria">{Tipo}</span></div>
//   <span class="ImovelValor ValorDestaque"><span class="Valor"><span class="value">R$ {preco}</span></span></span>
//   <span class="ImovelId"><span class="id">{id}</span> <span class="reference">({ref})</span><span class="buildingId">{buildingId}</span></span>
//   <span class="Endereco"><span class="Bairro">{Bairro}</span>, <span class="cidade">{Cidade}</span>, ...</span>
//   <span class="Resumo"><span class="ResumoItens">
//     <span class="ResumoItem BEDROOM"><span class="val">{N}</span></span>       (pode faltar)
//     <span class="ResumoItem BATHROOM"><span class="val">{N}</span></span>     (pode faltar)
//     <span class="ResumoItem AREA_USEFUL"><span class="val">{area}m²</span></span>
//     <span class="ResumoItem GARAGE"><span class="val">{N}</span></span>       (pode faltar)
//   </span></span>
// </div>
// Nota: o "preco" exibido e o valor de "Pacote de Venda"/entrada em alguns
// anuncios (marketing de entrada parcelada), nao necessariamente o valor
// cheio do imovel - repassado como esta exibido no card, sem tentar inferir
// o valor total.
import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const URL_LISTAGEM = "https://deborabuenoimoveis.com.br/imoveis/";
const CIDADE_ALVO = "praia grande";
const MAX_CLIQUES = 40;
const PAUSA_ENTRE_CLIQUES_MS = 700;

interface RawCard {
  href: string;
  titulo: string | null;
  tipo: string | null;
  preco: string;
  bairro: string | null;
  cidade: string | null;
  reference: string | null;
  buildingId: string | null;
  dormitorios: string | null;
  banheiros: string | null;
  vagas: string | null;
  areaUtil: string | null;
}

async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".LI_Imovel"));
    return cards.map((card) => {
      const link = card.querySelector<HTMLAnchorElement>("a.Title");
      return {
        href: link?.href ?? "",
        titulo: link?.textContent?.trim() ?? null,
        tipo: card.querySelector(".SubCategoria")?.textContent?.trim() ?? null,
        preco: card.querySelector(".ImovelValor .value")?.textContent?.trim() ?? "",
        bairro: card.querySelector(".Endereco .Bairro")?.textContent?.trim() ?? null,
        cidade: card.querySelector(".Endereco .cidade")?.textContent?.trim() ?? null,
        reference: card.querySelector(".ImovelId .reference")?.textContent?.trim() ?? null,
        buildingId: card.querySelector(".ImovelId .buildingId")?.textContent?.trim() ?? null,
        dormitorios: card.querySelector(".ResumoItem.BEDROOM .val")?.textContent?.trim() ?? null,
        banheiros: card.querySelector(".ResumoItem.BATHROOM .val")?.textContent?.trim() ?? null,
        vagas: card.querySelector(".ResumoItem.GARAGE .val")?.textContent?.trim() ?? null,
        areaUtil: card.querySelector(".ResumoItem.AREA_USEFUL .val")?.textContent?.trim() ?? null,
      };
    });
  });
}

function parseMoeda(texto: string): number | null {
  const numeros = texto.replace(/[^\d,]/g, "").replace(",", ".");
  const valor = Number.parseFloat(numeros);
  return Number.isFinite(valor) ? valor : null;
}

function parseNumero(texto: string | null): number | null {
  if (!texto) return null;
  const match = texto.match(/([\d.,]+)/);
  if (!match) return null;
  const valor = Number.parseFloat(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
}

function extractCodigo(card: RawCard): string | null {
  if (card.reference) {
    const semParenteses = card.reference.replace(/[()]/g, "").trim();
    if (semParenteses) return semParenteses;
  }
  return card.buildingId;
}

const siteCrawler: SiteCrawlerModule = {
  async scrape({ page }) {
    await page.goto(URL_LISTAGEM, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".LI_Imovel", { timeout: 15_000 }).catch(() => {});

    for (let clique = 0; clique < MAX_CLIQUES; clique++) {
      const botao = page.locator(".BtnShowMoreImovel");
      if ((await botao.count()) === 0) break;
      const visivel = await botao.first().isVisible().catch(() => false);
      if (!visivel) break;
      await botao.first().click();
      await page.waitForTimeout(PAUSA_ENTRE_CLIQUES_MS);
    }

    const cards = await extractCards(page);
    const listings: ScrapedListing[] = [];

    for (const card of cards) {
      if (!card.href) continue;
      if (!card.cidade || !card.cidade.toLowerCase().includes(CIDADE_ALVO)) continue;

      listings.push({
        externalId: extractCodigo(card),
        urlOriginal: card.href,
        titulo: card.titulo,
        tipoImovel: card.tipo,
        cidade: card.cidade,
        bairro: card.bairro,
        preco: parseMoeda(card.preco),
        areaUtil: parseNumero(card.areaUtil),
        dormitorios: parseNumero(card.dormitorios),
        banheiros: parseNumero(card.banheiros),
        vagas: parseNumero(card.vagas),
      });
    }

    return { listings, paginasVisitadas: 1 };
  },
};

export default siteCrawler;
