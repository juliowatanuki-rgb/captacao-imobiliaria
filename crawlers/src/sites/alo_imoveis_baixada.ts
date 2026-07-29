// Validado manualmente contra https://aloimoveisbaixada.com.br em 2026-07-29.
// Plataforma real: Praedium (mesmo CDN cdn3.praedium.com.br e mesma estrutura
// de card "div.thumbnail_one" documentada em platforms/praedium.ts), NAO
// "Kenlo" como chutado na planilha original. Inventario grande: 850 imoveis
// declarados na listagem filtrada por Praia Grande.
import { createPraediumCrawler } from "../platforms/praedium.js";

export default createPraediumCrawler({
  urlListagem: "https://aloimoveisbaixada.com.br/imoveis/a-venda/praia-grande-sp",
});
