// Validado manualmente contra https://marcohottzimoveis.com.br em 2026-07-29.
// Plataforma real: Praedium (mesmo CDN cdn3.praedium.com.br e mesma estrutura
// de card "div.thumbnail_one" documentada em platforms/praedium.ts), NAO
// "Union Softwares" como chutado na planilha original. Inventario grande:
// 794 imoveis declarados na listagem filtrada por Praia Grande.
import { createPraediumCrawler } from "../platforms/praedium.js";

export default createPraediumCrawler({
  urlListagem: "https://marcohottzimoveis.com.br/imoveis/a-venda/praia-grande-sp",
});
