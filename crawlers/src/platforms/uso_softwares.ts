// Motor generico para imobiliarias que usam a plataforma "USO" / "Agiliza"
// (produto da Union Softwares - identificada pelo CDN cdnuso.com/cdn.uso.com.br
// nas fotos, pelo link "Cadastre seu Imovel" apontando para
// agilizaunion.com.br/app e pelo rodape com logo "logo_uso.png").
//
// Estrutura de card validada manualmente em michelettoconsimoveis.com.br em
// 2026-07-29, usando a URL dedicada por cidade (encontrada via o filtro
// "Cidade" da home, um dropdown Semantic UI que reescreve a URL ao buscar):
// https://michelettoconsimoveis.com.br/imoveis/sp/praia-grande/
//
// <a class="link_resultado" href="/comprar/sp/{cidade-slug}/{bairro-slug}/{tipo-slug}/{codigo-numerico}">
//   <h3 class="titulo_novo">{Tipo}</h3>
//   <div class="valor_novo"><small>VENDA</small><h5>R$ {preco}</h5></div>
//   <div class="icones_caracteristicas">
//     <div class="detalhe_novo"><i class="ph ph-bed"/><span>{quartos}</span></div>
//     <div class="detalhe_novo"><i class="ph ph-shower"/><span>{banheiros}</span></div>
//     <div class="detalhe_novo"><i class="ph ph-car-simple"/><span>{vagas}</span></div>
//   </div>
//   <div class="final_card"><span>{Bairro} - {Cidade}/{UF}</span></div>
//   <div class="clicaveis_card"><span class="border1">Ref.{codigo}</span></div>
// </a>
//
// Nao ha icone de area util nos cards validados (so aparece na pagina de
// detalhe) - areaUtil fica null quando ausente.
//
// Paginacao: via URL no padrao `${urlListagem}pagina-{N}/` (link real
// observado: `javascript: paginacao('/imoveis/sp/praia-grande/pagina-1/')`).
// Paginas alem do fim retornam 0 cards (nao erro).

import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const MAX_PAGINAS_PADRAO = 200;
const PAUSA_ENTRE_PAGINAS_MS = 800;
const MAX_TENTATIVAS_PAGINA_VAZIA = 3;

interface RawCard {
  href: string;
  tipo: string | null;
  preco: string;
  quartos: string | null;
  banheiros: string | null;
  vagas: string | null;
  finalCard: string | null;
  ref: string | null;
}

// Nota: esta funcao roda serializada dentro da pagina via page.evaluate.
// Evitar declarar funcoes nomeadas (const fn = () => {} / function fn(){})
// aqui dentro - o transform do tsx/esbuild injeta chamadas a um helper
// `__name` para preservar o nome da funcao, que nao existe no contexto da
// pagina e quebra em runtime ("__name is not defined"). Por isso o
// mapeamento dos icones abaixo usa um loop simples em vez de uma arrow
// auxiliar.
async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("a.link_resultado"));
    return cards.map((card) => {
      const href = (card as HTMLAnchorElement).href;
      const tipo = card.querySelector(".titulo_novo")?.textContent?.trim() ?? null;
      const preco = card.querySelector(".valor_novo h5")?.textContent?.trim() ?? "";

      const detalhes = Array.from(card.querySelectorAll(".icones_caracteristicas .detalhe_novo"));
      let quartos: string | null = null;
      let banheiros: string | null = null;
      let vagas: string | null = null;
      for (const detalhe of detalhes) {
        const icone = detalhe.querySelector("i");
        const classe = icone?.className ?? "";
        const valor = detalhe.querySelector(".icone_numero span")?.textContent?.trim() ?? null;
        if (classe.includes("ph-bed")) quartos = valor;
        else if (classe.includes("ph-shower")) banheiros = valor;
        else if (classe.includes("ph-car")) vagas = valor;
      }

      const finalCard = card.querySelector(".final_card")?.textContent?.trim() ?? null;
      const ref = card.querySelector(".flag_ref span")?.textContent?.trim() ?? null;

      return { href, tipo, preco, quartos, banheiros, vagas, finalCard, ref };
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
  const valor = Number.parseFloat(texto.replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
}

function parseBairroCidade(finalCard: string | null): { bairro: string | null; cidade: string | null } {
  if (!finalCard) return { bairro: null, cidade: null };
  // Formato observado: "{Bairro} - {Cidade}/{UF}".
  const partes = finalCard.split(" - ");
  const bairro = partes.length > 1 ? partes[0].trim() : null;
  const cidadeUf = partes.length > 1 ? partes[1] : partes[0];
  const cidade = cidadeUf ? cidadeUf.split("/")[0].trim() : null;
  return { bairro, cidade };
}

function parseCodigo(ref: string | null, href: string): string | null {
  if (ref) {
    const semPrefixo = ref.replace(/^Ref\.?/i, "").trim();
    if (semPrefixo) return semPrefixo;
  }
  const semQuery = href.split("?")[0];
  const partes = semQuery.split("/").filter(Boolean);
  return partes.length > 0 ? partes[partes.length - 1] : null;
}

function montarUrlPagina(urlListagem: string, pagina: number): string {
  const base = urlListagem.endsWith("/") ? urlListagem : `${urlListagem}/`;
  return `${base}pagina-${pagina}/`;
}

export interface UsoSoftwaresConfig {
  urlListagem: string;
  maxPaginas?: number;
}

export function createUsoSoftwaresCrawler(config: UsoSoftwaresConfig): SiteCrawlerModule {
  return {
    async scrape({ page }) {
      const listings: ScrapedListing[] = [];
      const maxPaginas = config.maxPaginas ?? MAX_PAGINAS_PADRAO;
      let paginasVisitadas = 0;

      for (let pagina = 1; pagina <= maxPaginas; pagina++) {
        const url = montarUrlPagina(config.urlListagem, pagina);

        let cards: RawCard[] = [];
        for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_PAGINA_VAZIA; tentativa++) {
          await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
          cards = await extractCards(page);
          if (cards.length > 0) break;
          if (tentativa < MAX_TENTATIVAS_PAGINA_VAZIA) {
            await page.waitForTimeout(PAUSA_ENTRE_PAGINAS_MS * tentativa);
          }
        }

        paginasVisitadas += 1;
        if (cards.length === 0) break;

        for (const card of cards) {
          if (!card.href) continue;
          const { bairro, cidade } = parseBairroCidade(card.finalCard);

          listings.push({
            externalId: parseCodigo(card.ref, card.href),
            urlOriginal: card.href,
            titulo: card.tipo || null,
            tipoImovel: card.tipo || null,
            cidade,
            bairro,
            preco: card.preco ? parseMoeda(card.preco) : null,
            dormitorios: parseNumero(card.quartos),
            banheiros: parseNumero(card.banheiros),
            vagas: parseNumero(card.vagas),
          });
        }

        await page.waitForTimeout(PAUSA_ENTRE_PAGINAS_MS);
      }

      return { listings, paginasVisitadas };
    },
  };
}
