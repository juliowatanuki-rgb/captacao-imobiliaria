// Inspecionado ao vivo em 2026-07-30 contra
// https://centralimoveispraiagrande.com.br.
//
// Plataforma real: Microsistec (fotos hospedadas em vault.imob.online - mesmo
// CDN de platforms/microsistec.ts). Usa a MESMA variante de template de card
// ja mapeada em sites/realizacao_imoveis.ts (<article class="box-result">,
// sem sufixo "-properties", header com imagem+preco, codigo dentro de
// data-property JSON no footer) - diferente da variante
// <article class="box-result-properties"> de sites/nova_kennedy.ts e
// sites/imoveis_de_classe.ts. Implementado como scraper autocontido, mesmo
// padrao adotado em realizacao_imoveis.ts.
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
//       <li><span>Área </span><b>{N ou "---"}</b></li>
//     </ul>
//   </div>
//   <footer>
//     <a data-property='{"CodigoImovel":16780,"linkPagina":"/{slug}.html",...}'>Contatar</a>
//     <a href="/{slug}.html">Ver Detalhes</a>
//   </footer>
//   <a href="/{slug}.html" class="link"></a>
// </article>
//
// URL de listagem obtida direto do formulario de busca real (Finalidade=Venda,
// Cidade=Praia Grande). Paginacao via querystring `?page=N` (pagina 1 = URL
// sem esse parametro).
import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const URL_LISTAGEM =
  "https://centralimoveispraiagrande.com.br/p-imoveis-venda-praia_grande-ordenacao-7.html";
const MAX_PAGINAS = 300;
// 2000ms (acima do padrao de 800ms de outras plataformas): mesma
// infraestrutura de imoveis_de_classe.ts, onde ritmo rapido (~800ms)
// provocou bloqueio total de conexao (nem curl puro conseguia) apos duas
// coletas de teste.
const PAUSA_ENTRE_PAGINAS_MS = 2000;
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
          const parsed = JSON.parse(dataPropRaw) as { CodigoImovel?: string | number };
          codigoImovel = parsed.CodigoImovel != null ? String(parsed.CodigoImovel) : null;
        } catch {
          codigoImovel = null;
        }
      }
      const alt = card.querySelector("img")?.getAttribute("alt") ?? null;
      const tituloH2 = card.querySelector("h2")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const bairro = card.querySelector("h2 + p")?.textContent?.trim() ?? null;
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

// Protege contra erro de digitacao na fonte (visto ao vivo em
// imoveis_de_classe.ts, mesma plataforma Microsistec: "117711220 m²" em vez
// de algo plausivel) que estoura a coluna numeric(10,2) de area_util no
// banco e derruba a coleta inteira. 100.000 m² e uma folga generosa.
function areaUtilPlausivel(valor: number | null): number | null {
  return valor !== null && valor > 0 && valor <= 100_000 ? valor : null;
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

const centralImoveisPraiaGrandeCrawler: SiteCrawlerModule = {
  async scrape({ page }) {
    const listings: ScrapedListing[] = [];
    let paginasVisitadas = 0;

    await page.setExtraHTTPHeaders({ "User-Agent": USER_AGENT });

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const url = comPagina(URL_LISTAGEM, pagina);

      let cards: RawCard[] = [];
      for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_PAGINA_VAZIA; tentativa++) {
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        } catch (err) {
          // Conexao recusada/instavel (visto na pratica em imoveis_de_classe.ts,
          // mesma plataforma Microsistec, perto do fim da paginacao) - trata
          // como pagina vazia desta tentativa em vez de abortar o site inteiro
          // (secao 18).
          if (tentativa === MAX_TENTATIVAS_PAGINA_VAZIA) throw err;
          await page.waitForTimeout(3_000 * tentativa);
          continue;
        }
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

export default centralImoveisPraiaGrandeCrawler;
