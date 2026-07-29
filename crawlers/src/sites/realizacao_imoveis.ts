// Inspecionado ao vivo em 2026-07-29 contra
// https://realizacoesimoveismongagua.com.br (dominio raiz redireciona para
// www., que por sua vez devolve 403 Forbidden para o User-Agent padrao do
// Playwright - contornado com um User-Agent de navegador comum, mesma tecnica
// de platforms/microsistec.ts).
//
// O nome do dominio ("...mongagua.com.br") e o titulo da home
// ("Realização Imóveis - Mongaguá/SP") sugerem que a imobiliaria e sediada em
// Mongagua, MAS o dropdown de cidade da busca (#Cidade) inclui "Praia Grande"
// como opcao valida, e a busca por Venda + Praia Grande retorna um inventario
// real e nao-vazio (155 imoveis, ver validacao abaixo) - portanto o site
// cobre Praia Grande de verdade (rede regional multi-cidade) e faz sentido
// continuar cadastrado.
//
// Plataforma real: Microsistec ("desenvolvido por Microsistec" no rodape,
// fotos em vault.imob.online - mesmo CDN de platforms/microsistec.ts,
// confirma o chute errado do seed que dizia "Vista Software"). PORÉM esse
// site usa um template de card DIFERENTE do que platforms/microsistec.ts
// sabe interpretar (aqui: <article class="box-result box-result-properties">,
// la: <article class="box-construction-8">) - provavelmente uma versao mais
// antiga/outro tema da mesma plataforma. Como platforms/microsistec.ts esta
// sendo usado por outro processo/agente em paralelo nesta sessao (nao pode
// ser tocado agora), este arquivo implementa um scraper autocontido para essa
// variante de template em vez de reaproveitar o motor generico. Quando o
// arquivo compartilhado estiver livre, val a pena avaliar unificar os dois
// templates dentro de platforms/microsistec.ts (por parametro de template)
// para nao ter logica duplicada de forma permanente.
//
// A URL de listagem foi obtida preenchendo o formulario de busca real
// (Finalidade=Venda, Cidade=Praia Grande) e observando a URL final apos
// submissao (query params viram um path amigavel):
// https://realizacoesimoveismongagua.com.br/p-imoveis-venda-praia_grande-ordenacao-7.html
// Paginacao via querystring `?page=N` (pagina 1 = URL sem esse parametro).
//
// Estrutura de card (validada ao vivo):
// <article class="box-result box-result-properties grid-12">
//   <header>
//     <span>{OPORTUNIDADE ou vazio}</span>
//     <img alt="{Tipo} em {Cidade}, bairro {Bairro}" src="...vault.imob.online...">
//     <p><small> Venda</small>R$ {preco}<br></p>   (preco pode faltar em imoveis "sob consulta")
//   </header>
//   <div class="col-sm-8 ...">
//     <h2>{Tipo} em {Cidade}</h2>
//     <p>{Bairro}</p>
//     <p class="info">{descricao}</p>
//     <ul>
//       <li><span>Dorm.</span><b>{N ou "---"}</b></li>
//       <li><span>Suítes</span><b>{N ou "---"}</b></li>
//       <li><span>Vagas</span><b>{N ou "---"}</b></li>
//       <li><span>Banheiros</span><b>{N ou "---"}</b></li>
//       <li><span>Área m²</span><b>{N ou "---"}</b></li>
//     </ul>
//   </div>
//   <footer>
//     <a data-property='{"CodigoImovel":"11.730","linkPagina":"/{slug}.html","id":17875187,...}'>Contatar</a>
//     <a href="/{slug}.html">Ver Detalhes</a>
//   </footer>
//   <a href="/{slug}.html" class="link"></a>
// </article>
//
// Validado ao vivo (2026-07-29), 2 execucoes seguidas com resultado
// identico: 155 imoveis, 11 paginas (15/pagina, ultima com 5), page=12 vazia
// confirmando fim real da paginacao. externalId (CodigoImovel) sempre
// presente e unico nas duas execucoes, urlOriginal sempre absoluta e
// presente, 0 ocorrencias de cidade != Praia Grande (checado via alt da
// imagem, que sempre segue "... em Praia Grande, bairro ...").
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.

import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const URL_LISTAGEM =
  "https://realizacoesimoveismongagua.com.br/p-imoveis-venda-praia_grande-ordenacao-7.html";
const MAX_PAGINAS = 60;
const PAUSA_ENTRE_PAGINAS_MS = 800;
const MAX_TENTATIVAS_PAGINA_VAZIA = 3;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface RawCard {
  href: string;
  codigoImovel: string | null;
  alt: string | null;
  tituloH2: string | null;
  bairro: string | null;
  precoTexto: string;
  itens: { rotulo: string | null; valor: string }[];
}

// Nota: esta funcao roda serializada dentro da pagina via page.evaluate.
// Evitar declarar funcoes nomeadas aqui dentro - o transform do tsx/esbuild
// injeta chamadas a um helper "__name" que nao existe no contexto da pagina
// (erro "__name is not defined").
async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>("article.box-result"));
    return cards.map((card) => {
      const hrefEl = card.querySelector<HTMLAnchorElement>('footer a[href^="/"]');
      const href = hrefEl?.href ?? "";
      const dataPropRaw = card.querySelector("a[data-property]")?.getAttribute("data-property") ?? null;
      let codigoImovel: string | null = null;
      if (dataPropRaw) {
        try {
          const parsed = JSON.parse(dataPropRaw) as { CodigoImovel?: string };
          codigoImovel = parsed.CodigoImovel ?? null;
        } catch {
          codigoImovel = null;
        }
      }
      const alt = card.querySelector("img")?.getAttribute("alt") ?? null;
      const tituloH2 = card.querySelector("h2")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const bairro = card.querySelector("div.col-sm-8 p, div.col-xs-12 p")?.textContent?.trim() ?? null;
      const precoTexto = card.querySelector("header p")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const itens = Array.from(card.querySelectorAll("ul > li.small-item")).map((li) => ({
        rotulo: li.querySelector("span")?.textContent?.trim() ?? null,
        valor: li.querySelector("b")?.textContent?.trim() ?? "",
      }));
      return { href, codigoImovel, alt, tituloH2, bairro, precoTexto, itens };
    });
  });
}

function parseMoeda(texto: string): number | null {
  const match = texto.match(/\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?/);
  if (!match) return null;
  const valor = Number.parseFloat(match[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
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

// Formato do h2/alt: "{Tipo} em {Cidade}[, bairro {Bairro}]".
function extractTipoImovel(tituloH2: string | null): string | null {
  if (!tituloH2) return null;
  const match = tituloH2.match(/^(.+?)\s+em\s+.+$/i);
  return match ? match[1].trim() : tituloH2;
}

function extractCidade(alt: string | null): string | null {
  if (!alt) return "Praia Grande";
  const match = alt.match(/\bem\s+(.+?)(?:,\s*bairro|$)/i);
  return match ? match[1].trim() : "Praia Grande";
}

function comPagina(urlBase: string, pagina: number): string {
  if (pagina <= 1) return urlBase;
  const url = new URL(urlBase);
  url.searchParams.set("page", String(pagina));
  return url.toString();
}

const realizacaoImoveisCrawler: SiteCrawlerModule = {
  async scrape({ page }) {
    const listings: ScrapedListing[] = [];
    let paginasVisitadas = 0;

    await page.setExtraHTTPHeaders({ "User-Agent": USER_AGENT });

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const url = comPagina(URL_LISTAGEM, pagina);

      let cards: RawCard[] = [];
      for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_PAGINA_VAZIA; tentativa++) {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForSelector("article.box-result", { timeout: 15_000 }).catch(() => {});
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
          externalId: card.codigoImovel,
          urlOriginal: card.href,
          titulo: card.tituloH2,
          tipoImovel: extractTipoImovel(card.tituloH2),
          cidade: extractCidade(card.alt),
          bairro: card.bairro,
          preco: parseMoeda(card.precoTexto),
          areaUtil: parseItemNumero(card.itens, /área/i),
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

export default realizacaoImoveisCrawler;
