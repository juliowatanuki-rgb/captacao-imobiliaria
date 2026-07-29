// Validado manualmente contra https://www.quintaldeareiaimoveis.com.br em
// 2026-07-29. Plataforma real: Coruja Sistemas (meta author "Coruja
// Sistemas", mesma estrutura de card "section.property-card-search"
// documentada em platforms/coruja.ts), NAO "Vista Software" como chutado na
// planilha original. 1249 imoveis declarados na listagem filtrada por Praia
// Grande.
import { createCorujaCrawler } from "../platforms/coruja.js";

export default createCorujaCrawler({
  urlListagem: "https://www.quintaldeareiaimoveis.com.br/a-venda/praia-grande-sp",
});
