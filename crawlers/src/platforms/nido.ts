// Motor generico para imobiliarias que usam a plataforma Nido
// (identificada pelo painel administrativo em app.nidoadm.com.br linkado no
// header/login do site, pelo CDN de imagens objectstorage.sa-saopaulo-1.oraclecloud.com
// e pela marca "nido.com.br" no rodape).
//
// Estrutura de card validada manualmente em moradanapraia.com.br em 2026-07-29:
// <div class="d-flex col-sm-6 col-md-3">
//   <a href="https://.../imovel/{slug}/{codigo}" target="_blank" class="text-decoration-none d-flex w-100">
//     <div class="card1 shadow">
//       <div class="foto position-relative"><img src="..."></div>
//       <div class="info">
//         <div class="text-uppercase ... p-2 ...">
//           <span>{Bairro}</span>
//           <span>{Cidade} - {UF}</span>
//         </div>
//         <div class="d-flex align-items-center justify-content-between text-text px-2">
//           <span>{Tipo}</span>
//           <span>{codigo}</span>
//         </div>
//         <div class="text-text px-2 f-14">
//           <span>VENDA</span><span>R$ {preco}</span>
//         </div>
//         <div class="d-flex justify-content-between p-2 f-14 text-text">
//           <div class="box-icons"><span>{N} dorms.</span></div>   (pode faltar)
//           <div class="box-icons"><span>{N} suíte</span></div>    (pode faltar)
//           <div class="box-icons"><span>{N} vaga</span></div>     (pode faltar)
//           <div class="box-icons"><span>{area} m² AU</span></div>
//         </div>
//       </div>
//     </div>
//   </a>
// </div>
// A paginacao e feita via path: /{urlListagem}/{N} (pagina 1 = urlListagem sem
// sufixo). Validado ao vivo em 2026-07-29 contra
// https://www.moradanapraia.com.br/imoveis/venda/sp/praia-grande: 1737
// imoveis, 37 paginas (48/pagina, ultima com 9), estavel em 2 execucoes
// seguidas.

import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const MAX_PAGINAS_PADRAO = 200;
const PAUSA_ENTRE_PAGINAS_MS = 800;
const MAX_TENTATIVAS_PAGINA_VAZIA = 3;

interface RawCard {
  href: string;
  bairro: string | null;
  cidadeUf: string | null;
  tipo: string | null;
  codigo: string | null;
  preco: string;
  icones: string[];
}

async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".card1"));
    return cards.map((card) => {
      const link = card.closest("a") as HTMLAnchorElement | null;
      const enderecoSpans = Array.from(card.querySelectorAll(".info > div:first-child > span"));
      const bairro = enderecoSpans[0]?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const cidadeUf = enderecoSpans[1]?.textContent?.replace(/\s+/g, " ").trim() ?? null;

      const tipoLinha = card.querySelectorAll(".info > div.d-flex.align-items-center.justify-content-between span");
      const tipo = tipoLinha[0]?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const codigo = tipoLinha[1]?.textContent?.replace(/\s+/g, " ").trim() ?? null;

      const preco = card.querySelector(".text-text.px-2.f-14 span:last-child")?.textContent?.trim() ?? "";

      const icones = Array.from(card.querySelectorAll(".box-icons span")).map(
        (s) => s.textContent?.replace(/\s+/g, " ").trim() ?? ""
      );

      return { href: link?.href ?? "", bairro, cidadeUf, tipo, codigo, preco, icones };
    });
  });
}

function parseMoeda(texto: string): number | null {
  const numeros = texto.replace(/[^\d,]/g, "").replace(",", ".");
  const valor = Number.parseFloat(numeros);
  return Number.isFinite(valor) ? valor : null;
}

function parseIconeNumero(icones: string[], padrao: RegExp): number | null {
  for (const icone of icones) {
    const match = icone.match(padrao);
    if (match) {
      const valor = Number.parseFloat(match[1].replace(",", "."));
      return Number.isFinite(valor) ? valor : null;
    }
  }
  return null;
}

function extractCidade(cidadeUf: string | null): string | null {
  if (!cidadeUf) return null;
  // Formato observado: "{Cidade} - {UF}".
  const antesDoTraco = cidadeUf.split(" - ")[0];
  return antesDoTraco.trim() || null;
}

function extractCodigoFromHref(href: string): string | null {
  const semQuery = href.split("?")[0].replace(/\/$/, "");
  const partes = semQuery.split("/").filter(Boolean);
  return partes.length > 0 ? partes[partes.length - 1] : null;
}

export interface NidoConfig {
  urlListagem: string;
  maxPaginas?: number;
}

export function createNidoCrawler(config: NidoConfig): SiteCrawlerModule {
  return {
    async scrape({ page }) {
      const listings: ScrapedListing[] = [];
      const maxPaginas = config.maxPaginas ?? MAX_PAGINAS_PADRAO;
      let paginasVisitadas = 0;
      const baseSemBarra = config.urlListagem.replace(/\/$/, "");

      for (let pagina = 1; pagina <= maxPaginas; pagina++) {
        const url = pagina === 1 ? config.urlListagem : `${baseSemBarra}/${pagina}`;

        let cards: RawCard[] = [];
        for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_PAGINA_VAZIA; tentativa++) {
          await page.goto(url, { waitUntil: "domcontentloaded" });
          await page.waitForSelector(".card1", { timeout: 15_000 }).catch(() => {});
          cards = await extractCards(page);
          if (cards.length > 0) break;
          if (tentativa < MAX_TENTATIVAS_PAGINA_VAZIA) {
            await page.waitForTimeout(1_000 * tentativa);
          }
        }

        paginasVisitadas += 1;
        if (cards.length === 0) break;

        for (const card of cards) {
          if (!card.href) continue;

          listings.push({
            externalId: card.codigo ?? extractCodigoFromHref(card.href),
            urlOriginal: card.href,
            titulo: card.tipo,
            tipoImovel: card.tipo,
            cidade: extractCidade(card.cidadeUf),
            bairro: card.bairro,
            preco: parseMoeda(card.preco),
            areaUtil: parseIconeNumero(card.icones, /([\d.,]+)\s*m²/i),
            dormitorios: parseIconeNumero(card.icones, /(\d+)\s*dorms?\.?/i),
            suites: parseIconeNumero(card.icones, /(\d+)\s*su[íi]te/i),
            vagas: parseIconeNumero(card.icones, /(\d+)\s*vaga/i),
          });
        }

        await page.waitForTimeout(PAUSA_ENTRE_PAGINAS_MS);
      }

      return { listings, paginasVisitadas };
    },
  };
}
