// Inspecionado ao vivo em 2026-07-30 contra
// https://gmrsolucoesimobiliarias.com.br. Plataforma real: "Objetiva
// Software" (Next.js), primeira confirmacao dessa plataforma neste projeto.
//
// Site cobre varias cidades (destaque para Votuporanga/SP, sede da empresa) -
// so 4 imoveis em Praia Grande no momento da validacao. A propria aplicacao
// consome uma API JSON limpa (visivel no devtools ao carregar /imoveis):
// GET /api/cidades -> [{ nome, filtro: "cidade", codigo }], Praia Grande =
// codigo "5238".
// GET /api/imoveis?includeParents=false&page=1&limit=12&cidade=5238 ->
// { imoveis: [...], total }. Nao ha necessidade de scraping de HTML - a API
// e chamada direto (mesma origem do site, sem CORS/autenticacao).
// URL do anuncio: https://gmrsolucoesimobiliarias.com.br/imoveis/{urlId}
// (urlId ja vem com o codigo no final, ex:
// "casa-a-venda-com-2-quartos-em-ocian-praia-grande-sao-paulo-765").
// Inventario pequeno mas mantido, mesmo padrao ja adotado para
// spinola_consultoria_imobiliaria (so 2 imoveis).
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const CODIGO_CIDADE_PRAIA_GRANDE = "5238";
const LIMIT = 50;
const MAX_PAGINAS = 10;

interface ApiImovel {
  imovelCodigo: number;
  tipoNome: string | null;
  urlId: string;
  titulo: string | null;
  localizacao: { bairro: string | null; cidade: string | null };
  comodos: {
    dormitorios?: { quantidade: number | null };
    banheiros?: { quantidade: number | null };
    suites?: { quantidade: number | null };
    garagens?: { quantidade: number | null };
  };
  areas: { areaTotal?: { quantidade: number | string | null }; areaPrivativa?: { quantidade: number | string | null } };
  valores: { venda?: { raw: number | null } };
}

interface ApiResposta {
  imoveis: ApiImovel[];
  total: number;
}

function numeroOuNulo(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const num = typeof valor === "number" ? valor : Number.parseFloat(valor);
  return Number.isFinite(num) && num > 0 ? num : null;
}

const siteCrawler: SiteCrawlerModule = {
  async scrape({ page, urlBase }) {
    const listings: ScrapedListing[] = [];
    let paginasVisitadas = 0;

    // Navega ate o proprio site primeiro para que o fetch() abaixo rode no
    // mesmo-origin (evita bloqueio de CORS ao chamar a API a partir de
    // about:blank).
    await page.goto(urlBase, { waitUntil: "domcontentloaded" });

    for (let numeroPagina = 1; numeroPagina <= MAX_PAGINAS; numeroPagina++) {
      const url = `${urlBase}/api/imoveis?includeParents=false&page=${numeroPagina}&limit=${LIMIT}&cidade=${CODIGO_CIDADE_PRAIA_GRANDE}`;
      const resposta: ApiResposta = await page.evaluate(async (apiUrl) => {
        const res = await fetch(apiUrl);
        return res.json();
      }, url);

      paginasVisitadas += 1;
      if (!resposta.imoveis || resposta.imoveis.length === 0) break;

      for (const imovel of resposta.imoveis) {
        listings.push({
          externalId: String(imovel.imovelCodigo),
          urlOriginal: `${urlBase}/imoveis/${imovel.urlId}`,
          titulo: imovel.titulo,
          tipoImovel: imovel.tipoNome,
          cidade: imovel.localizacao?.cidade ?? null,
          bairro: imovel.localizacao?.bairro ?? null,
          preco: imovel.valores?.venda?.raw ?? null,
          areaUtil: numeroOuNulo(imovel.areas?.areaPrivativa?.quantidade ?? imovel.areas?.areaTotal?.quantidade),
          dormitorios: imovel.comodos?.dormitorios?.quantidade ?? null,
          suites: imovel.comodos?.suites?.quantidade ?? null,
          banheiros: imovel.comodos?.banheiros?.quantidade ?? null,
          vagas: imovel.comodos?.garagens?.quantidade ?? null,
        });
      }

      if (resposta.imoveis.length < LIMIT || listings.length >= resposta.total) break;
    }

    return { listings, paginasVisitadas };
  },
};

export default siteCrawler;
