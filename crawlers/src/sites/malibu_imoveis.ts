// Inspecionado ao vivo em 2026-07-30 contra https://malibuimoveis.com.br.
// Plataforma real: Praedium (mesmo CDN cdn3.praedium.com.br e mesma
// estrutura de card "div.thumbnail_one" de platforms/praedium.ts). Site
// mono-cidade (so Praia Grande, 474 imoveis) - reaproveita o motor generico
// sem necessidade de filtro extra.
import { createPraediumCrawler } from "../platforms/praedium.js";

export default createPraediumCrawler({
  urlListagem: "https://malibuimoveis.com.br/imoveis/a-venda/praia-grande-sp",
});
