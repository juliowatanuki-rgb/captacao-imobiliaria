// Inspecionado ao vivo em 2026-07-30 contra https://imoveisdeclasse.com.br.
//
// Plataforma real: Microsistec (fotos hospedadas em vault.imob.online - mesmo
// CDN de platforms/microsistec.ts). Usa a MESMA variante de template de card
// ja mapeada em sites/nova_kennedy.ts (<article class="box-result-properties">
// com "Cod.: {codigo}" no header e link direto em footer), diferente da
// variante <article class="box-result"> (sem sufixo -properties) de
// sites/realizacao_imoveis.ts. Como platforms/microsistec.ts so sabe
// interpretar um terceiro template (<article class="box-construction-8">),
// implementado aqui como scraper autocontido, mesmo padrao adotado em
// nova_kennedy.ts.
//
// Estrutura de card (validada ao vivo):
// <article class="box-result box-result-properties grid-12">
//   <header>
//     <span>Cod.: {codigo}</span>
//     <div class="owl-carousel property-fotos">...</div>
//   </header>
//   <div class="col-sm-7 ...">
//     <h2>{Tipo} em {Cidade}, {Bairro}</h2>
//     <ul>
//       <li><b>{N ou "---"}</b><span>dorm.</span></li>
//       <li><b>{N ou "---"}</b><span>suíte(s)</span></li>
//       <li><b>{N ou "---"}</b><span>banheiro(s)</span></li>
//       <li><b>{N ou "---"}</b><span>vaga(s)</span></li>
//       <li><b>{N} <small>m²</small></b><span>Área (útil)</span></li>
//     </ul>
//     <p>{descricao}</p>
//     <b class="price"><small> venda</small>R$ {preco}<br></b>  (preco pode faltar em imoveis "sob consulta")
//   </div>
//   <footer>
//     <a href="/{codigo}-{slug}.html">MAIS INFORMAÇÕES</a>
//     <a data-property='{"CodigoImovel":723383,...}'>CONTATAR CORRETOR</a>
//   </footer>
// </article>
//
// URL de listagem obtida direto do formulario de busca real (Finalidade=Venda,
// Cidade=Praia Grande), 4055 imoveis no total, 15/pagina. Paginacao via
// querystring `?page=N` (pagina 1 = URL sem esse parametro).
import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const URL_LISTAGEM =
  "https://imoveisdeclasse.com.br/p-imoveis-venda-praia_grande-ordenacao-7.html";
const MAX_PAGINAS = 300;
// 2000ms (acima do padrao de 800ms de outras plataformas): apos duas
// coletas de teste em ritmo rapido (~800ms), o servidor passou a recusar
// TODAS as conexoes (nem curl puro conseguia, nao so o Playwright) - provavel
// rate-limit/WAF. Mesmo dominio/host aparentemente compartilhado com
// central_imoveis_praia_grande.ts (bloqueio afetou os dois simultaneamente).
const PAUSA_ENTRE_PAGINAS_MS = 2000;
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
// imoveis_de_classe, codigo 722991: "117711220 m²" em vez de algo como
// "117 m²") que estoura a coluna numeric(10,2) de area_util no banco e
// derruba a coleta inteira. 100.000 m² e uma folga generosa - nenhum
// apartamento/casa residencial real chega perto disso.
function areaUtilPlausivel(valor: number | null): number | null {
  return valor !== null && valor > 0 && valor <= 100_000 ? valor : null;
}

function extractCodigo(codigoTexto: string | null, href: string): string | null {
  const fromTexto = codigoTexto?.match(/(\d+)/);
  if (fromTexto) return fromTexto[1];
  const fromHref = href.match(/\/(\d+)-/);
  return fromHref ? fromHref[1] : null;
}

// Formato do h2: "{Tipo} em {Cidade}, {Bairro}".
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

const imoveisDeClasseCrawler: SiteCrawlerModule = {
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
          // Conexao recusada/instavel (visto na pratica perto do fim da
          // paginacao, provavel rate-limit) - trata como pagina vazia desta
          // tentativa em vez de abortar o site inteiro (secao 18).
          if (tentativa === MAX_TENTATIVAS_PAGINA_VAZIA) throw err;
          await page.waitForTimeout(3_000 * tentativa);
          continue;
        }
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

export default imoveisDeClasseCrawler;
