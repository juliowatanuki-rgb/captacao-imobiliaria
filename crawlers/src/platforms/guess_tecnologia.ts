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
// ATENCAO: o site e multi-tenant por cidade no path (a raiz do dominio sem
// "/praia-grande" resolve para outro tenant - ex: a raiz "/imoveis/venda" sem
// prefixo de cidade retorna erro de runtime ASP.NET, nao a listagem de outra
// cidade). Use sempre a URL completa com o slug da cidade.
//
// PAGINACAO: CONFIRMADO em 2026-07-28 (nao e suposicao) que a listagem de
// Praia Grande tem so 1 pagina / 5 imoveis no total, via inspecao ao vivo com
// Playwright em plazaimoveisempreendimentos.com/praia-grande/imoveis/venda:
//   - o proprio rodape da listagem exibe o texto "Exibindo página 1 de 1."
//   - o contador de resultados mostra "5 imóveis"
//   - os unicos links com __doPostBack na pagina sao de busca/filtro/comparacao
//     (ctl00$CtrlPesquisa$BtnPesquisarImoveis, ContentPlaceHolder1$LnkCompareImoveis,
//     ContentPlaceHolder1$DdlOrdenacao, checkboxes de refinamento de negocio/valor,
//     ContentPlaceHolder1$DdlCidadesRefinamento) - nenhum deles e um controle de
//     "proxima pagina" ou numero de pagina.
// Por isso este motor le so a 1a pagina de propósito, nao por limitacao nao
// implementada. Se no futuro "Exibindo página 1 de N" mostrar N > 1 (ex: se o
// inventario de Praia Grande crescer, ou se este motor for reaproveitado para
// outra cidade/tenant GUESS Tecnologia com mais imoveis), sera preciso
// implementar paginacao via __doPostBack real (provavelmente um controle tipo
// ContentPlaceHolder1$...Pager disparado ao clicar no numero da pagina/link
// "Próxima", com espera do UpdatePanel recarregar) - o padrao acima nao foi
// visto na pratica porque so havia 1 pagina para testar.

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

      // Guarda-corpo: este motor so foi validado (2026-07-28) para o caso "página 1
      // de 1" (ver comentario no topo do arquivo). Se o rodape indicar mais de 1
      // pagina, falha alto em vez de coletar silenciosamente so a 1a pagina -
      // sinal de que a paginacao via __doPostBack precisa ser implementada.
      const totalPaginas = await page.evaluate(() => {
        const match = document.body.innerText.match(/Exibindo\s+p[aá]gina\s+\d+\s+de\s+(\d+)/i);
        return match ? Number.parseInt(match[1], 10) : null;
      });
      if (totalPaginas !== null && totalPaginas > 1) {
        throw new Error(
          `guess_tecnologia: listagem indica ${totalPaginas} paginas, mas este motor so suporta 1 pagina ` +
            `(paginacao via __doPostBack ainda nao implementada - ver comentario no topo do arquivo)`
        );
      }

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
