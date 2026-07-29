// Validado manualmente contra https://realizeimoveispg.com.br em 2026-07-29.
// Plataforma real: Praedium (mesmo CDN cdn3.praedium.com.br e mesma estrutura
// de card "div.thumbnail_one" documentada em platforms/praedium.ts), NAO
// "Imoview" como chutado na planilha original.
import { createPraediumCrawler } from "../platforms/praedium.js";

export default createPraediumCrawler({
  urlListagem: "https://realizeimoveispg.com.br/imoveis/a-venda/praia-grande-sp",
});
