// Motor generico para imobiliarias que usam a plataforma Castel Digital
// (identificada pelo CDN cdn.casteldigital.com.br / b4.casteldigital.com.br
// nos scripts e imagens dos anuncios).
//
// Estrutura de card validada manualmente em igorbraga.com.br em 2026-07-28:
// <li class="col-im-grid ..." id="im-1-ref-{codigo}">
//   <div class="item icons1">
//     <a class="main" href="/imovel/{slug}-ref-{codigo}/">
//       <span class="tipo">{Tipo}</span>
//       <span class="cidade">{Cidade}</span>
//       <span class="bairro">{Bairro}</span>
//       <span class="ref">#{codigo formatado}</span>
//       <div class="icones">
//         <span class="dorms" data-original-title="Dormitorios">{N}</span>
//         <span class="bwcs" data-original-title="Banheiros">{N}</span>
//         <span class="vagas" data-original-title="Vagas">{N}</span>
//         <span class="area-total" data-original-title="Area total">{area} m²</span>
//       </div>
//       <div class="preco"><p>R$ {preco}</p></div>
//     </a>
//   </div>
// </li>
// A paginacao e por path: /venda/pagina/{N} (o inventario parece ser de
// rede/nacional, nao so da cidade - confirmar filtro de cidade antes de
// crawlear tudo em producao).

import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const MAX_PAGINAS_PADRAO = 300;
const CODIGO_LI_REGEX = /ref-(\d+)/;

interface RawCard {
  id: string;
  href: string;
  tipo: string | null;
  cidade: string | null;
  bairro: string | null;
  ref: string | null;
  preco: string;
  dorms: string | null;
  bwcs: string | null;
  vagas: string | null;
  areaTotal: string | null;
}

async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const items = Array.from(document.querySelectorAll<HTMLElement>("li[id^='im-']"));
    return items.map((li) => {
      const link = li.querySelector<HTMLAnchorElement>("a.main");
      return {
        id: li.id,
        href: link?.href ?? "",
        tipo: li.querySelector(".tipo")?.textContent?.trim() ?? null,
        cidade: li.querySelector(".cidade")?.textContent?.trim() ?? null,
        bairro: li.querySelector(".bairro")?.textContent?.trim() ?? null,
        ref: li.querySelector(".ref")?.textContent?.trim() ?? null,
        preco: li.querySelector(".preco")?.textContent?.trim() ?? "",
        dorms: li.querySelector(".dorms")?.textContent?.trim() ?? null,
        bwcs: li.querySelector(".bwcs")?.textContent?.trim() ?? null,
        vagas: li.querySelector(".vagas")?.textContent?.trim() ?? null,
        areaTotal: li.querySelector(".area-total")?.textContent?.trim() ?? null,
      };
    });
  });
}

function parseMoeda(texto: string): number | null {
  // Alguns cards tem "de R$ X por R$ Y" (preco promocional) no mesmo bloco -
  // pega so o primeiro numero formatado (evita concatenar os dois valores).
  const match = texto.match(/\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?/);
  if (!match) return null;
  const valor = Number.parseFloat(match[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
}

function parseNumero(texto: string | null): number | null {
  if (!texto) return null;
  const numeros = texto.replace(/[^\d,]/g, "").replace(",", ".");
  const valor = Number.parseFloat(numeros);
  return Number.isFinite(valor) ? valor : null;
}

function extractCidade(cidade: string | null): string | null {
  if (!cidade) return null;
  // O elemento .cidade traz cidade e bairro juntos, separados por " - " e
  // espacos/tabs (ex: "Praia Grande - \t\t\t\t\t\tCanto do Forte") - o bairro
  // ja vem separado em .bairro, entao aqui so interessa o trecho antes do "-".
  const antesDoTraco = cidade.split("-")[0];
  return antesDoTraco.replace(/\s+/g, " ").trim() || null;
}

function extractCodigo(id: string, ref: string | null): string | null {
  const fromId = id.match(CODIGO_LI_REGEX);
  if (fromId) return fromId[1];
  const fromRef = ref?.match(/(\d[\d.]*)/);
  return fromRef ? fromRef[1].replace(/\./g, "") : null;
}

export interface CastelDigitalConfig {
  urlListagem: string;
  maxPaginas?: number;
}

export function createCastelDigitalCrawler(config: CastelDigitalConfig): SiteCrawlerModule {
  return {
    async scrape({ page }) {
      const listings: ScrapedListing[] = [];
      const maxPaginas = config.maxPaginas ?? MAX_PAGINAS_PADRAO;
      let paginasVisitadas = 0;
      const baseSemBarra = config.urlListagem.replace(/\/$/, "");

      for (let pagina = 1; pagina <= maxPaginas; pagina++) {
        const url = pagina === 1 ? config.urlListagem : `${baseSemBarra}/pagina/${pagina}`;
        await page.goto(url, { waitUntil: "domcontentloaded" });
        paginasVisitadas += 1;

        await page.waitForSelector("li[id^='im-']", { timeout: 15_000 }).catch(() => {});

        const cards = await extractCards(page);
        if (cards.length === 0) break;

        for (const card of cards) {
          if (!card.href) continue;

          listings.push({
            externalId: extractCodigo(card.id, card.ref),
            urlOriginal: card.href,
            titulo: card.tipo,
            tipoImovel: card.tipo,
            cidade: extractCidade(card.cidade),
            bairro: card.bairro,
            preco: parseMoeda(card.preco),
            areaUtil: parseNumero(card.areaTotal),
            dormitorios: parseNumero(card.dorms),
            banheiros: parseNumero(card.bwcs),
            vagas: parseNumero(card.vagas),
          });
        }
      }

      return { listings, paginasVisitadas };
    },
  };
}
