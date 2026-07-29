// Motor generico para imobiliarias que usam a plataforma "Arbo Imoveis"
// (SaaS whitelabel identificado pelo CDN de imagens static.arboimoveis.com.br
// e pela API interna api-site.arboimoveis.com.br usada pelo front-end React).
//
// Estrutura de card validada manualmente em damascoimoveis.com.br em
// 2026-07-29, usando a URL dedicada por cidade
// https://www.damascoimoveis.com.br/imoveis/a-venda/praia-grande-sp:
//
// <div class="ImovelCard_card__{hash}">
//   <a href="https://.../imovel/{tipo-slug}/venda/{cidade-slug}/sp/{bairro-slug}/{codigo}">
//     ...
//     <span class="ImovelCardInfo_colorOfTypePropertie__{hash}">{Tipo}</span>
//     <span class="ImovelCardInfo_colorOfTitleCondominium__{hash}">{Titulo}</span>
//     <p class="ImovelCardInfo_address__{hash}">
//       <span class="d-none">{Rua}</span><span class="d-none">{Numero}</span>
//       <span>{Bairro}</span><span class="d-none">{Descricao}</span>
//     </p>
//     <p class="ImovelCardInfo_cityState__{hash}">
//       <span>{Cidade}, </span><span>{UF}</span><span class="d-none">{Descricao}</span>
//     </p>
//     <ul class="Icons_list__{hash}">
//       <li><i data-testid="fa-ruler-horizontal"/><span class="Icons_value__{hash}">{area}m²</span></li>
//       <li><i data-testid="fa-bed"/><span class="Icons_value__{hash}">{dormitorios}</span></li>
//       <li><i data-testid="fa-shower"/><span class="Icons_value__{hash}">{banheiros}</span></li>
//       <li><i data-testid="fa-car"/><span class="Icons_value__{hash}">{vagas}</span></li>
//     </ul>
//     <span class="ImovelCardInfo_priceValue__{hash}">R$&nbsp;{preco}</span>
//   </a>
// </div>
//
// Os hashes de CSS Modules mudam por build/dominio - por isso todos os
// seletores usam `[class^="Prefixo_nome__"]` (prefixo estavel) em vez do
// nome completo da classe.
//
// Nao ha suites/vagas garantidos no icone (o card so mostra os icones que
// existem); um resumo textual oculto (`ImovelCardInfo_colorOfLocalization__`)
// as vezes contem "{N} Suite(s)" e serve de reforco best-effort (pode faltar).
//
// Paginacao: NAO e por URL/query string. A listagem carrega por scroll
// infinito (React), que dispara chamadas internas a
// api-site.arboimoveis.com.br a cada rolagem. Essas chamadas exigem
// sessao/cookies do browser real (testado: chamar a API diretamente por HTTP
// puro, mesmo copiando a URL exata capturada da rede, retornou lista vazia -
// mais fragil que reaproveitar o DOM ja renderizado pelo proprio site).
// Por isso o crawler rola a pagina repetidamente, contando cards unicos por
// href, com pausa entre rolagens e uma rodada extra de espera/rolagem antes
// de concluir fim de lista (nao confiar numa unica rolagem "sem novidade").

import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const MAX_ROLAGENS_PADRAO = 60;
const PAUSA_ENTRE_ROLAGENS_MS = 900;
const ROLAGENS_ESTAVEIS_PARA_CONCLUIR = 3;

interface RawCard {
  href: string;
  tipo: string | null;
  titulo: string | null;
  bairro: string | null;
  cidade: string | null;
  preco: string;
  areaTexto: string | null;
  dormitoriosTexto: string | null;
  banheirosTexto: string | null;
  vagasTexto: string | null;
  hiddenLoc: string | null;
}

async function contarCardsUnicos(page: Page): Promise<number> {
  return page.evaluate(() => {
    const hrefs = Array.from(document.querySelectorAll('a[href*="/imovel/"]')).map(
      (a) => (a as HTMLAnchorElement).href,
    );
    return new Set(hrefs).size;
  });
}

// Nota: esta funcao roda serializada dentro da pagina via page.evaluate.
// Evitar declarar funcoes nomeadas (const fn = () => {} / function fn(){})
// aqui dentro - o transform do tsx/esbuild injeta chamadas a um helper
// `__name` para preservar o nome da funcao, que nao existe no contexto da
// pagina e quebra em runtime ("__name is not defined"). Por isso o
// mapeamento dos icones e os filtros de span visivel/oculto abaixo usam
// loops simples em vez de arrows auxiliares (.find/.filter com callback
// nomeado).
async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div[class^="ImovelCard_card__"]'));
    return cards.map((card) => {
      const linkEl = card.querySelector("a");
      const href = linkEl ? (linkEl as HTMLAnchorElement).href : "";

      const tipo =
        card.querySelector('span[class^="ImovelCardInfo_colorOfTypePropertie__"]')?.textContent?.trim() ?? null;
      const titulo =
        card.querySelector('span[class^="ImovelCardInfo_colorOfTitleCondominium__"]')?.textContent?.trim() ?? null;

      let bairro: string | null = null;
      const enderecoP = card.querySelector('p[class^="ImovelCardInfo_address__"]');
      if (enderecoP) {
        const spans = Array.from(enderecoP.querySelectorAll("span"));
        for (const span of spans) {
          if (!span.className.includes("d-none")) {
            bairro = span.textContent?.trim() ?? null;
            break;
          }
        }
      }

      let cidade: string | null = null;
      const cityStateP = card.querySelector('p[class^="ImovelCardInfo_cityState__"]');
      if (cityStateP) {
        const spans = Array.from(cityStateP.querySelectorAll("span"));
        for (const span of spans) {
          if (!span.className.includes("d-none")) {
            cidade = span.textContent?.replace(/,\s*$/, "").trim() ?? null;
            break;
          }
        }
      }

      const preco =
        card.querySelector('span[class^="ImovelCardInfo_priceValue__"]')?.textContent?.trim() ?? "";

      const iconItens = Array.from(card.querySelectorAll('ul[class^="Icons_list__"] li'));
      const testidsAlvo = ["fa-ruler-horizontal", "fa-bed", "fa-shower", "fa-car"];
      const valoresPorIcone: Record<string, string | null> = {
        "fa-ruler-horizontal": null,
        "fa-bed": null,
        "fa-shower": null,
        "fa-car": null,
      };
      for (const item of iconItens) {
        const icone = item.querySelector("i[data-testid]");
        const testid = icone?.getAttribute("data-testid") ?? "";
        if (testidsAlvo.indexOf(testid) === -1) continue;
        valoresPorIcone[testid] = item.querySelector('span[class^="Icons_value__"]')?.textContent?.trim() ?? null;
      }

      const hiddenLoc =
        card.querySelector('span[class^="ImovelCardInfo_colorOfLocalization__"]')?.textContent?.trim() ?? null;

      return {
        href,
        tipo,
        titulo,
        bairro,
        cidade,
        preco,
        areaTexto: valoresPorIcone["fa-ruler-horizontal"],
        dormitoriosTexto: valoresPorIcone["fa-bed"],
        banheirosTexto: valoresPorIcone["fa-shower"],
        vagasTexto: valoresPorIcone["fa-car"],
        hiddenLoc,
      };
    });
  });
}

function parseMoeda(texto: string): number | null {
  const semNbsp = texto.replace(/ /g, " ");
  const numeros = semNbsp.replace(/[^\d,]/g, "").replace(",", ".");
  const valor = Number.parseFloat(numeros);
  return Number.isFinite(valor) ? valor : null;
}

function parseNumero(texto: string | null): number | null {
  if (!texto) return null;
  const match = texto.replace(",", ".").match(/([\d.]+)/);
  if (!match) return null;
  const valor = Number.parseFloat(match[1]);
  return Number.isFinite(valor) ? valor : null;
}

function parseSuitesDoTextoOculto(hiddenLoc: string | null): number | null {
  if (!hiddenLoc) return null;
  const match = hiddenLoc.match(/(\d+)\s*Suite/i);
  if (!match) return null;
  const valor = Number.parseInt(match[1], 10);
  return Number.isFinite(valor) ? valor : null;
}

function extractCodigoFromHref(href: string): string | null {
  const semQuery = href.split("?")[0];
  const partes = semQuery.split("/").filter(Boolean);
  return partes.length > 0 ? partes[partes.length - 1] : null;
}

export interface ArboImoveisConfig {
  urlListagem: string;
  maxPaginas?: number;
}

export function createArboImoveisCrawler(config: ArboImoveisConfig): SiteCrawlerModule {
  return {
    async scrape({ page }) {
      const maxRolagens = config.maxPaginas ?? MAX_ROLAGENS_PADRAO;

      await page.goto(config.urlListagem, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(1_500);

      let contagemAnterior = await contarCardsUnicos(page);
      let rolagensEstaveis = 0;
      let rolagensFeitas = 0;

      for (; rolagensFeitas < maxRolagens; rolagensFeitas++) {
        await page.mouse.wheel(0, 3_000);
        await page.waitForTimeout(PAUSA_ENTRE_ROLAGENS_MS);

        const contagemAtual = await contarCardsUnicos(page);
        if (contagemAtual === contagemAnterior) {
          rolagensEstaveis += 1;
        } else {
          rolagensEstaveis = 0;
        }
        contagemAnterior = contagemAtual;

        if (rolagensEstaveis >= ROLAGENS_ESTAVEIS_PARA_CONCLUIR) {
          // Nao confiar numa unica sequencia "sem novidade": espera mais e
          // tenta rolar de novo antes de considerar a lista completa (mesma
          // logica de retry-antes-de-desistir usada no motor coruja.ts).
          await page.waitForTimeout(2_000);
          await page.mouse.wheel(0, 3_000);
          await page.waitForTimeout(1_500);
          const recontagem = await contarCardsUnicos(page);
          if (recontagem === contagemAnterior) {
            rolagensFeitas += 1;
            break;
          }
          contagemAnterior = recontagem;
          rolagensEstaveis = 0;
        }
      }

      const cardsBrutos = await extractCards(page);
      const vistos = new Set<string>();
      const listings: ScrapedListing[] = [];

      for (const card of cardsBrutos) {
        if (!card.href || vistos.has(card.href)) continue;
        vistos.add(card.href);

        listings.push({
          externalId: extractCodigoFromHref(card.href),
          urlOriginal: card.href,
          titulo: card.titulo || null,
          tipoImovel: card.tipo || null,
          cidade: card.cidade,
          bairro: card.bairro,
          preco: card.preco ? parseMoeda(card.preco) : null,
          areaUtil: parseNumero(card.areaTexto),
          dormitorios: parseNumero(card.dormitoriosTexto),
          banheiros: parseNumero(card.banheirosTexto),
          vagas: parseNumero(card.vagasTexto),
          suites: parseSuitesDoTextoOculto(card.hiddenLoc),
        });
      }

      return { listings, paginasVisitadas: rolagensFeitas };
    },
  };
}
