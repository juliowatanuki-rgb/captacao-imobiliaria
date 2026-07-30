// Inspecionado ao vivo em 2026-07-30 contra https://arthurparaguay.com.br.
// Plataforma real: Praedium (mesmo CDN cdn3.praedium.com.br e mesma
// estrutura de card "div.thumbnail_one" de platforms/praedium.ts). Site
// cobre tambem Mongagua alem de Praia Grande - usa a URL dedicada
// /imoveis/a-venda/praia-grande-sp (~1456 imoveis), mesmo padrao ja usado em
// imigrantes_imoveis/tavares_e_polati/all_prime/malibu_imoveis.
import { createPraediumCrawler } from "../platforms/praedium.js";

export default createPraediumCrawler({
  urlListagem: "https://arthurparaguay.com.br/imoveis/a-venda/praia-grande-sp",
});
