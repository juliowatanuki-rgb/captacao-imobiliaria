// Motor generico para o backend "Imobeal" (identificado pelo dominio
// imobeal-api.onrender.com usado para as imagens com marca d'agua e pela
// conexao socket.io "tenant=<nome>" usada para buscar os dados dos imoveis).
// O front-end e um site Next.js sob medida (React, classes tailwind
// proprias tipo "pl-card") - nao ha evidencia de outro site usando o mesmo
// front-end, so o mesmo backend/CDN. Reaproveitavel se aparecer outro site
// "Imobeal" com o mesmo front-end; caso contrario o motor ainda documenta
// a estrutura para referencia futura.
//
// Estrutura de card validada manualmente em praialarimoveis.com.br em
// 2026-07-28:
// <a class="pl-card" href="/imoveis/{id8}-{slug}">
//   <img src="http://imobeal-api.onrender.com/wm/...">
//   <span>Venda</span>
//   <span class="text-[22px] font-bold ...">R$ {preco}</span>
//   <h3 class="truncate ...">{Titulo}</h3>
//   <p class="... truncate ...">{Cidade} - {Bairro}</p>
//   <div class="mt-auto ...">
//     <span>{n}<span class="opacity-70">dorm.</span></span>
//     <span>{n}<span class="opacity-70">banh.</span></span>
//     <span>{n}<span class="opacity-70">vaga(s)</span></span>
//     <span>{n}<span class="opacity-70">m2</span></span>
//   </div>
// </a>
//
// IMPORTANTE (secao 18): a paginacao NAO funciona por query string na URL -
// navegar direto para "?...&page=2" via page.goto e ignorado (o app volta
// pra pagina 1). Os dados sao carregados via socket.io (nao da pra
// interceptar como XHR/fetch comum), entao a unica forma confiavel de
// paginar e clicar no botao "Proxima" (like a real user) e esperar o
// primeiro card da lista mudar antes de extrair a proxima pagina.
// externalId: os primeiros 8 caracteres do slug em /imoveis/{id8}-{...}
// (nanoid - pode conter "-" e "_", entao NAO dividir por hifen).
// Cidade: NAO e mono-cidade (suposicao inicial errada, corrigida em
// 2026-07-29 apos 1a coleta real trazer 68/997 imoveis de outras cidades do
// litoral - Mongagua, Itanhaem, Sao Vicente, Santos, Bertioga, etc., o site
// cobre "Praia Grande e todo o litoral de SP"). Filtro definitivo usa o
// texto de localizacao do card ("{Cidade} - {Bairro}"), descartando
// qualquer imovel cuja cidade nao comece com "Praia Grande".

import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const MAX_PAGINAS_PADRAO = 120;
const ID_LENGTH = 8;

interface RawCard {
  href: string;
  titulo: string | null;
  localizacao: string | null;
  precoTexto: string;
  itens: string[];
}

// Nota: esta funcao roda serializada dentro da pagina via page.evaluate.
// Evitar declarar funcoes nomeadas aqui dentro - o transform do tsx/esbuild
// injeta chamadas a um helper "__name" que nao existe no contexto da pagina
// (erro "__name is not defined"), ver aviso em platforms/imoview.ts.
async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLAnchorElement>("a.pl-card"));
    return cards.map((card) => {
      const href = card.href;
      const titulo = card.querySelector("h3")?.textContent?.trim() ?? null;
      const localizacao = card.querySelector("p")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const precoTexto = card.querySelector('span[class*="font-bold"]')?.textContent?.trim() ?? "";
      const itensContainer = card.querySelector(".mt-auto");
      const itens = itensContainer
        ? Array.from(itensContainer.children).map((el) => el.textContent?.replace(/\s+/g, " ").trim() ?? "")
        : [];
      return { href, titulo, localizacao, precoTexto, itens };
    });
  });
}

function parseMoeda(texto: string): number | null {
  const numeros = texto.replace(/[^\d,]/g, "").replace(",", ".");
  const valor = Number.parseFloat(numeros);
  return Number.isFinite(valor) ? valor : null;
}

function parseItemNumero(itens: string[], palavraChave: string): number | null {
  for (const item of itens) {
    if (!item.toLowerCase().includes(palavraChave)) continue;
    const match = item.match(/([\d.,]+)/);
    if (!match) continue;
    const valor = Number.parseFloat(match[1].replace(",", "."));
    return Number.isFinite(valor) ? valor : null;
  }
  return null;
}

function extractExternalId(href: string): string | null {
  const match = href.match(/\/imoveis\/([^/?#]+)/);
  if (!match) return null;
  return match[1].slice(0, ID_LENGTH) || null;
}

// Formato observado: "{Cidade} - {Bairro}" (ou so "{Cidade}" quando falta bairro).
function extractLocalizacao(localizacao: string | null): { cidade: string | null; bairro: string | null } {
  if (!localizacao) return { cidade: null, bairro: null };
  const partes = localizacao.split(" - ").map((p) => p.trim());
  return { cidade: partes[0] || null, bairro: partes[1] || null };
}

function isPraiaGrande(cidade: string | null): boolean {
  return /^praia grande/i.test(cidade ?? "");
}

export interface ImobealConfig {
  urlListagem: string;
  maxPaginas?: number;
}

export function createImobealCrawler(config: ImobealConfig): SiteCrawlerModule {
  return {
    async scrape({ page }) {
      const listings: ScrapedListing[] = [];
      const maxPaginas = config.maxPaginas ?? MAX_PAGINAS_PADRAO;
      let paginasVisitadas = 0;

      await page.goto(config.urlListagem, { waitUntil: "networkidle", timeout: 60_000 });

      for (let pagina = 1; pagina <= maxPaginas; pagina++) {
        await page.waitForSelector("a.pl-card", { timeout: 20_000 }).catch(() => {});
        const cards = await extractCards(page);
        paginasVisitadas += 1;
        if (cards.length === 0) break;

        for (const card of cards) {
          if (!card.href) continue;
          const { cidade, bairro } = extractLocalizacao(card.localizacao);
          if (!isPraiaGrande(cidade)) continue; // fora do escopo (litoral de SP alem de Praia Grande)

          listings.push({
            externalId: extractExternalId(card.href),
            urlOriginal: card.href,
            titulo: card.titulo,
            tipoImovel: card.titulo,
            cidade,
            bairro,
            preco: parseMoeda(card.precoTexto),
            areaUtil: parseItemNumero(card.itens, "m²") ?? parseItemNumero(card.itens, "m2"),
            dormitorios: parseItemNumero(card.itens, "dorm"),
            banheiros: parseItemNumero(card.itens, "banh"),
            vagas: parseItemNumero(card.itens, "vaga"),
          });
        }

        if (pagina >= maxPaginas) break;

        const proximoBotao = page.getByRole("button", { name: /pr[oó]xima/i });
        const desabilitado = (await proximoBotao.getAttribute("disabled").catch(() => "sim")) !== null;
        if (desabilitado) break;

        const primeiroHrefAntes = cards[0]?.href ?? null;
        await proximoBotao.click();
        await page
          .waitForFunction(
            (hrefAnterior) => {
              const el = document.querySelector<HTMLAnchorElement>("a.pl-card");
              // Compara pela propriedade .href (absoluta, resolvida pelo
              // browser) e nao pelo atributo bruto - hrefAnterior tambem e
              // absoluto (ver extractCards), senao a comparacao nunca bateria
              // e esta espera resolveria de imediato, sem esperar a pagina
              // seguinte carregar de verdade (risco de reler a mesma pagina 2x).
              return !!el && el.href !== hrefAnterior;
            },
            primeiroHrefAntes,
            { timeout: 20_000 }
          )
          .catch(() => {});
      }

      return { listings, paginasVisitadas };
    },
  };
}
