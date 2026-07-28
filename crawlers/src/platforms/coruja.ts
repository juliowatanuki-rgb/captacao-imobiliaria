// Motor generico para imobiliarias que usam a plataforma Coruja Sistemas
// (identificada pelo rodape "Site feito por Coruja Sistemas" e pelas imagens
// hospedadas em CloudFront, ex: d1cvze3955gobs.cloudfront.net).
//
// Estrutura de card validada manualmente em m2mimoveis.com.br em 2026-07-28 e
// re-confirmada em temponeimoveispg.com.br em 2026-07-28 (mesmo motor, cards
// identicos):
// <section class="property-card-search">
//   <a class="__link" href="imoveis/{slug}-{CODIGO}">
//     <div class="property-card-search--title">{Tipo} - REF: {CODIGO}</div>
//     <div class="property-card-search--location">{Bairro}, {Cidade}</div>
//     <div class="property-card-search--price-sale"><div class="price">R$ {preco}</div></div>
//       (preco pode vir como "SOB CONSULTA" - tratar como nulo)
//     <div class="compositions">
//       <div class="composition">
//         <i class="..."></i>
//         <div class="name-composition">{label}</div>  (Área | Quartos | Vagas | Suites | Banheiros)
//         <div class="number">{numero}</div>
//       </div>
//     </div>
//   </a>
// </section>
// Atencao: o label vem ANTES do numero (ex: textContent normalizado
// "Área 70,00", "Quartos 2") - nao no formato "{numero} {label}". Os parsers
// abaixo procuram o rotulo seguido do numero, nao o contrario (bug corrigido
// em 2026-07-28: a versao anterior procurava "m²"/numero-antes-do-rotulo e
// por isso areaUtil/dormitorios/suites/banheiros/vagas sempre voltavam null
// tanto para m2m_imoveis quanto para tempone_imoveis_pg).
// A paginacao e feita via query string `?pagina=N` (server-side).
// Atencao: o proprio site tem erros de digitacao na cidade cadastrada
// (ex: "PARIA GRANDE", "PRAIA GARNDE") - nao normalizar/corrigir aqui, so
// repassar o texto bruto (correcao de grafia e responsabilidade de outra etapa).

import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const MAX_PAGINAS_PADRAO = 200;

interface RawCard {
  href: string;
  titulo: string;
  localizacao: string | null;
  preco: string;
  composicoes: string[];
}

async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>("section.property-card-search"));
    return cards.map((card) => {
      const link = card.querySelector<HTMLAnchorElement>("a.__link");
      const titulo = card.querySelector(".property-card-search--title")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const localizacao = card.querySelector(".property-card-search--location")?.textContent?.trim() ?? null;
      const preco = card.querySelector(".property-card-search--price-sale .price")?.textContent?.trim() ?? "";
      const composicoes = Array.from(card.querySelectorAll(".compositions .composition")).map(
        (el) => el.textContent?.replace(/\s+/g, " ").trim() ?? ""
      );
      return { href: link?.href ?? "", titulo, localizacao, preco, composicoes };
    });
  });
}

function parseMoeda(texto: string): number | null {
  if (/consulta/i.test(texto)) return null;
  const numeros = texto.replace(/[^\d,]/g, "").replace(",", ".");
  const valor = Number.parseFloat(numeros);
  return Number.isFinite(valor) ? valor : null;
}

function parseComposicaoNumero(itens: string[], padrao: RegExp): number | null {
  for (const item of itens) {
    const match = item.match(padrao);
    if (match) {
      const valor = Number.parseFloat(match[1].replace(",", "."));
      return Number.isFinite(valor) ? valor : null;
    }
  }
  return null;
}

function extractCodigoFromTitulo(titulo: string): string | null {
  const match = titulo.match(/REF:\s*(\S+)/i);
  return match ? match[1] : null;
}

function extractTipoImovel(titulo: string): string | null {
  const match = titulo.match(/^(.+?)\s*-\s*REF:/i);
  return match ? match[1].trim() : titulo || null;
}

function extractEndereco(localizacao: string | null): { bairro: string | null; cidade: string | null } {
  if (!localizacao) return { bairro: null, cidade: null };
  const partes = localizacao.split(",").map((p) => p.trim());
  return { bairro: partes[0] || null, cidade: partes[1] || null };
}

export interface CorujaConfig {
  urlListagem: string;
  maxPaginas?: number;
}

export function createCorujaCrawler(config: CorujaConfig): SiteCrawlerModule {
  return {
    async scrape({ page }) {
      const listings: ScrapedListing[] = [];
      const maxPaginas = config.maxPaginas ?? MAX_PAGINAS_PADRAO;
      let paginasVisitadas = 0;

      for (let pagina = 1; pagina <= maxPaginas; pagina++) {
        // Espacamento entre navegacoes: diagnostico ao vivo em m2m_imoveis
        // mostrou que paginas altas (ex: 69, 70) tem conteudo correto quando
        // acessadas isoladamente, mas uma coleta sequencial rapida (sem
        // pausa) parava cedo (17, 22, 31 paginas) de forma inconsistente
        // entre execucoes - indicio de rate-limit/anti-bot por velocidade de
        // requisicoes, nao de renderizacao lenta. Uma pequena pausa antes de
        // cada navegacao (alem do retry-se-vazio abaixo) reduz esse risco.
        if (pagina > 1) {
          await page.waitForTimeout(800);
        }
        const separador = config.urlListagem.includes("?") ? "&" : "?";
        await page.goto(`${config.urlListagem}${separador}pagina=${pagina}`, {
          waitUntil: "domcontentloaded",
        });
        paginasVisitadas += 1;

        await page.waitForSelector("section.property-card-search", { timeout: 15_000 }).catch(() => {});

        let cards = await extractCards(page);
        if (cards.length === 0) {
          // Uma pagina vazia pode ser o fim real da paginacao OU um
          // rate-limit/anti-bot temporario (ver comentario acima sobre o
          // diagnostico em m2m_imoveis - paginas com conteudo real voltavam
          // vazias so numa coleta sequencial rapida). Antes de concluir que
          // acabou, tenta mais algumas vezes com espera crescente.
          for (let tentativa = 1; tentativa <= 3 && cards.length === 0; tentativa++) {
            await page.waitForTimeout(2_000 * tentativa);
            await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
            await page.waitForSelector("section.property-card-search", { timeout: 10_000 }).catch(() => {});
            cards = await extractCards(page);
          }
          if (cards.length === 0) break;
        }

        for (const card of cards) {
          if (!card.href) continue;
          const { bairro, cidade } = extractEndereco(card.localizacao);

          listings.push({
            externalId: extractCodigoFromTitulo(card.titulo),
            urlOriginal: card.href,
            titulo: card.titulo || null,
            tipoImovel: extractTipoImovel(card.titulo),
            cidade,
            bairro,
            preco: parseMoeda(card.preco),
            areaUtil: parseComposicaoNumero(card.composicoes, /Área\s*([\d.,]+)/i),
            dormitorios: parseComposicaoNumero(card.composicoes, /Quartos?\s*(\d+)/i),
            suites: parseComposicaoNumero(card.composicoes, /Su[ií]tes?\s*(\d+)/i),
            banheiros: parseComposicaoNumero(card.composicoes, /Banheiros?\s*(\d+)/i),
            vagas: parseComposicaoNumero(card.composicoes, /Vagas?\s*(\d+)/i),
          });
        }
      }

      return { listings, paginasVisitadas };
    },
  };
}
