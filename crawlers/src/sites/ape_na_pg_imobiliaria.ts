// Inspecionado ao vivo em 2026-07-30 contra https://apenapg.com.br.
// Plataforma real: Tecimob (rodape "SITE PARA IMOBILIARIA" -> tecimob.com.br),
// primeira confirmacao real dessa plataforma neste projeto (os chutes
// anteriores de "Tecimob" na planilha sempre se mostraram errados nos outros
// sites ja investigados).
//
// A home mostra so uma secao "destaques" paginada client-side (nao e o
// catalogo completo). O catalogo real fica em /comprar/imoveis (726 imoveis,
// 21/pagina, 35 paginas) - so acessivel clicando no botao "Pesquisar" da
// busca (SPA React/Next com paginacao MUI, NAO por querystring: navegar
// direto para uma URL com ?offset=N e ignorado, o app sempre reseta pra
// offset=1 no carregamento). Por isso a paginacao aqui e feita clicando em
// "li.next a" (MUI Pagination) em vez de mudar a URL; fim da lista detectado
// por "li.next.disabled" (confirmado ao vivo na pagina 35/35, com 12 cards -
// bate exato com 726 - 34*21 = 12).
//
// O catalogo /comprar/imoveis cobre a regiao toda (Praia Grande, Sao Vicente,
// Peruibe, Mongagua, Santos), NAO so Praia Grande - nao ha filtro de cidade
// dedicado por URL/click identificado. Por isso o parser descarta cards cuja
// cidade (ultima linha do card) nao seja "Praia Grande".
//
// Validacao ao vivo (1a tentativa, so com pausa fixa entre paginas) mostrou
// ~20 codigos duplicados em 714 cards - o clique no "next" as vezes le o
// card antes do React re-renderizar. Corrigido esperando o href do 1o card
// mudar (ou timeout) antes de extrair a pagina seguinte.
//
// Estrutura de card (".CardProperty"), extraida via innerText (classes sao
// hashes de styled-components, nao confiar nelas para nomes de campo):
// Ref.: {codigo}
// {Tipo} ... na {Bairro} - {Cidade}/{UF}     (titulo livre)
// R$ {preco}
// {N} Dormitorio(s)   (pode faltar)
// {N} Vaga(s)         (pode faltar)
// {area} m²
// {Bairro} - {Cidade}/{UF}                    (ultima linha, usada para bairro/cidade)
import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const URL_CATALOGO = "https://apenapg.com.br/comprar/imoveis";
const MAX_PAGINAS = 60;
const PAUSA_ENTRE_PAGINAS_MS = 1000;

interface RawCard {
  href: string;
  texto: string;
}

// Nota: evitar funcoes nomeadas dentro do page.evaluate (erro "__name is not
// defined" no transform do tsx/esbuild - ver crawlers/src/platforms/nova_kennedy.ts).
async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".CardProperty"));
    return cards.map((card) => {
      const link = card.querySelector<HTMLAnchorElement>("a");
      return { href: link?.href ?? "", texto: (card as HTMLElement).innerText ?? "" };
    });
  });
}

function parseMoeda(texto: string): number | null {
  const match = texto.match(/R\$\s*([\d.,]+)/);
  if (!match) return null;
  const valor = Number.parseFloat(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
}

function parseNumero(texto: string, padrao: RegExp): number | null {
  const match = texto.match(padrao);
  if (!match) return null;
  const valor = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
}

function parseCard(card: RawCard): ScrapedListing | null {
  if (!card.href) return null;
  const linhas = card.texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const refMatch = card.texto.match(/Ref\.:\s*(\S+)/);
  const localLinha = linhas[linhas.length - 1] ?? "";
  const [bairroRaw, cidadeUf] = localLinha.split(" - ");
  const cidade = cidadeUf ? cidadeUf.split("/")[0].trim() : null;

  const refIdx = linhas.findIndex((l) => l.startsWith("Ref.:"));
  const titulo = refIdx >= 0 ? linhas[refIdx + 1] ?? null : null;
  const tipoImovel = titulo ? titulo.split(" ")[0] : null;

  return {
    externalId: refMatch ? refMatch[1] : null,
    urlOriginal: card.href,
    titulo,
    tipoImovel,
    cidade,
    bairro: bairroRaw?.trim() || null,
    preco: parseMoeda(card.texto),
    areaUtil: parseNumero(card.texto, /([\d.,]+)\s*m²/i),
    dormitorios: parseNumero(card.texto, /(\d+)\s*dormit[óo]rios?/i),
    suites: parseNumero(card.texto, /(\d+)\s*su[íi]tes?/i),
    vagas: parseNumero(card.texto, /(\d+)\s*vagas?/i),
  };
}

const CIDADE_ALVO = "praia grande";

const siteCrawler: SiteCrawlerModule = {
  async scrape({ page }) {
    const listings: ScrapedListing[] = [];
    let paginasVisitadas = 0;

    await page.goto(URL_CATALOGO, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".CardProperty", { timeout: 15_000 }).catch(() => {});

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const cards = await extractCards(page);
      paginasVisitadas += 1;
      if (cards.length === 0) break;

      for (const card of cards) {
        const listing = parseCard(card);
        if (listing && listing.cidade?.toLowerCase().includes(CIDADE_ALVO)) {
          listings.push(listing);
        }
      }

      const proximaDesabilitada = await page.locator("li.next.disabled").count();
      if (proximaDesabilitada > 0) break;
      const proxima = page.locator("li.next a");
      if ((await proxima.count()) === 0) break;

      const primeiroHrefAntes = cards[0]?.href ?? "";
      await proxima.click();
      await page
        .waitForFunction(
          (hrefAnterior) => {
            const primeiro = document.querySelector(".CardProperty a") as HTMLAnchorElement | null;
            return !!primeiro && primeiro.href !== hrefAnterior;
          },
          primeiroHrefAntes,
          { timeout: 8_000 }
        )
        .catch(() => {});
      await page.waitForTimeout(PAUSA_ENTRE_PAGINAS_MS);
    }

    return { listings, paginasVisitadas };
  },
};

export default siteCrawler;
