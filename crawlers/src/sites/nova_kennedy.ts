// Inspecionado ao vivo em 2026-07-29 contra https://novakennedy.com.br.
//
// Plataforma real: Microsistec (confirmado via <meta name="DC.Creator"
// content="microsistec.com.br">/DC.Publisher no <head>, fotos hospedadas em
// vault.imob.online - mesmo CDN de platforms/microsistec.ts e de
// realizacao_imoveis.ts), NAO Tecimob como chutado no seed. Porem este site
// usa um TERCEIRO template de card, diferente dos outros dois ja mapeados
// (<article class="box-construction-8"> em platforms/microsistec.ts,
// <article class="box-result"> em realizacao_imoveis.ts): aqui e
// <article class="box-result-properties"> (variante sem <img alt> no header
// e sem <p> de bairro separado - bairro vem dentro do proprio <h2>). Como
// nao reaproveita nenhum dos dois motores existentes, implementado como
// scraper autocontido (mesmo padrao de realizacao_imoveis.ts) em vez de
// tentar generalizar platforms/microsistec.ts para um terceiro formato.
//
// A urlListagem generica por tipo ("/p-apartamento-venda.html", sem filtro
// de cidade) inclui Mongagua e Santos alem de Praia Grande (dropdown #Cidade
// tem as 3 opcoes) - E existe uma URL unificada que cobre TODOS os tipos de
// imovel de uma vez com o filtro de cidade aplicado via slug amigavel:
// https://novakennedy.com.br/p-imoveis-venda-praia_grande.html
// Confirmado ao vivo: todos os cards das paginas verificadas trazem "em
// Praia Grande" no h2 (checado tambem que os tipos vem misturados -
// Apartamento/Casa/Kitnet/Casa de Condominio - nao e so 1 tipo default).
// Paginacao via querystring `?page=N` (pagina 1 = URL sem esse parametro).
//
// Estrutura de card (validada ao vivo via fetch+DOMParser, sem anti-bot
// aparente neste dominio):
// <article class="box-result box-result-properties grid-12">
//   <header>
//     <span>Cod.: {codigo}</span>
//     <div class="owl-carousel property-fotos">...</div>
//   </header>
//   <div class="col-sm-7 ...">
//     <h2>{Tipo}  em {Cidade}, {Bairro}</h2>
//     <ul>
//       <li><b>{N ou "---"}</b><span>dorm.</span></li>
//       <li><b>{N ou "---"}</b><span>suíte(s)</span></li>
//       <li><b>{N ou "---"}</b><span>banheiro(s)</span></li>
//       <li><b>{N ou "---"}</b><span>vaga(s)</span></li>
//       <li><b>{N ou "---"}</b><span>Área</span></li>
//     </ul>
//     <p>{descricao}</p>
//     <b class="price"><small> venda</small>R$ {preco}<br></b>  (preco pode faltar em imoveis "sob consulta")
//   </div>
//   <footer>
//     <a href="/{codigo}-{slug}.html">MAIS INFORMAÇÕES</a>
//     <a data-property='{"CodigoImovel":14885301,...}'>CONTATAR CORRETOR</a>
//   </footer>
//   <a href="/{codigo}-{slug}.html" class="link"></a>
// </article>
//
// Validado ao vivo em 2026-07-29 (fetch direto, 1a e ultima pagina): 15
// imoveis/pagina, pagina 68 com 4 (total ~1009), pagina 69 vazia confirmando
// fim real da paginacao. externalId sempre presente (extraido do "Cod.:" do
// header), urlOriginal sempre absoluta (resolvida via propriedade .href).
import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const URL_LISTAGEM = "https://novakennedy.com.br/p-imoveis-venda-praia_grande.html";
const MAX_PAGINAS = 90;
const PAUSA_ENTRE_PAGINAS_MS = 800;
const MAX_TENTATIVAS_PAGINA_VAZIA = 3;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface RawCard {
  href: string;
  codigoTexto: string | null;
  tituloH2: string | null;
  precoTexto: string;
  itens: { rotulo: string | null; valor: string }[];
}

// Nota: esta funcao roda serializada dentro da pagina via page.evaluate.
// Evitar declarar funcoes nomeadas aqui dentro - o transform do tsx/esbuild
// injeta chamadas a um helper "__name" que nao existe no contexto da pagina
// (erro "__name is not defined").
async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>("article.box-result-properties"));
    return cards.map((card) => {
      const hrefEl = card.querySelector<HTMLAnchorElement>('footer a[href^="/"]');
      const href = hrefEl?.href ?? "";
      const codigoTexto = card.querySelector("header span")?.textContent?.trim() ?? null;
      const tituloH2 = card.querySelector("h2")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const precoTexto = card.querySelector("b.price")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const itens = Array.from(card.querySelectorAll("ul > li")).map((li) => ({
        rotulo: li.querySelector("span")?.textContent?.trim() ?? null,
        valor: li.querySelector("b")?.textContent?.trim() ?? "",
      }));
      return { href, codigoTexto, tituloH2, precoTexto, itens };
    });
  });
}

function parseMoeda(texto: string): number | null {
  const match = texto.match(/\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?/);
  if (!match) return null;
  const valor = Number.parseFloat(match[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
}

// Protege contra erro de digitacao na fonte (visto ao vivo em
// imoveis_de_classe.ts, mesma plataforma Microsistec: "117711220 m²" em vez
// de algo plausivel) que estoura a coluna numeric(10,2) de area_util no
// banco e derruba a coleta inteira. 100.000 m² e uma folga generosa - este
// site roda no crawl.yml diario, entao um valor assim quebraria a coleta
// automatica ate ser corrigido manualmente.
function areaUtilPlausivel(valor: number | null): number | null {
  return valor !== null && valor > 0 && valor <= 100_000 ? valor : null;
}

function parseItemNumero(itens: RawCard["itens"], rotulo: RegExp): number | null {
  const item = itens.find((i) => i.rotulo && rotulo.test(i.rotulo));
  if (!item) return null;
  if (!item.valor || item.valor.trim() === "---") return null;
  const match = item.valor.match(/([\d.,]+)/);
  if (!match) return null;
  const valor = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
}

function extractCodigo(codigoTexto: string | null, href: string): string | null {
  const fromTexto = codigoTexto?.match(/(\d+)/);
  if (fromTexto) return fromTexto[1];
  const fromHref = href.match(/\/(\d+)-/);
  return fromHref ? fromHref[1] : null;
}

// Formato do h2: "{Tipo}  em {Cidade}, {Bairro}" (bairro pode faltar).
function extractTipoImovel(tituloH2: string | null): string | null {
  if (!tituloH2) return null;
  const match = tituloH2.match(/^(.+?)\s+em\s+.+$/i);
  return match ? match[1].trim() : tituloH2;
}

function extractEndereco(tituloH2: string | null): { cidade: string | null; bairro: string | null } {
  if (!tituloH2) return { cidade: null, bairro: null };
  const match = tituloH2.match(/\bem\s+(.+)$/i);
  if (!match) return { cidade: null, bairro: null };
  const partes = match[1].split(",").map((p) => p.trim());
  return { cidade: partes[0] || null, bairro: partes[1] || null };
}

function comPagina(urlBase: string, pagina: number): string {
  if (pagina <= 1) return urlBase;
  const url = new URL(urlBase);
  url.searchParams.set("page", String(pagina));
  return url.toString();
}

const novaKennedyCrawler: SiteCrawlerModule = {
  async scrape({ page }) {
    const listings: ScrapedListing[] = [];
    let paginasVisitadas = 0;

    await page.setExtraHTTPHeaders({ "User-Agent": USER_AGENT });

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const url = comPagina(URL_LISTAGEM, pagina);

      let cards: RawCard[] = [];
      for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_PAGINA_VAZIA; tentativa++) {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForSelector("article.box-result-properties", { timeout: 15_000 }).catch(() => {});
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
        const { cidade, bairro } = extractEndereco(card.tituloH2);

        listings.push({
          externalId: extractCodigo(card.codigoTexto, card.href),
          urlOriginal: card.href,
          titulo: card.tituloH2,
          tipoImovel: extractTipoImovel(card.tituloH2),
          cidade,
          bairro,
          preco: parseMoeda(card.precoTexto),
          areaUtil: areaUtilPlausivel(parseItemNumero(card.itens, /área/i)),
          dormitorios: parseItemNumero(card.itens, /dorm/i),
          suites: parseItemNumero(card.itens, /su[íi]te/i),
          banheiros: parseItemNumero(card.itens, /banheiro/i),
          vagas: parseItemNumero(card.itens, /vaga/i),
        });
      }

      await page.waitForTimeout(PAUSA_ENTRE_PAGINAS_MS);
    }

    return { listings, paginasVisitadas };
  },
};

export default novaKennedyCrawler;
