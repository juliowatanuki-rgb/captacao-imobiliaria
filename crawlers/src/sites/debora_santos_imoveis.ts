// Validado manualmente contra https://www.deborasantosimoveis.com.br em
// 2026-07-29. Plataforma real: Coruja Sistemas (meta author "Coruja
// Sistemas", mesma estrutura de card "section.property-card-search"
// documentada em platforms/coruja.ts) - confirma o chute da planilha
// original. 1366 imoveis declarados na listagem filtrada por Praia Grande.
import { createCorujaCrawler } from "../platforms/coruja.js";

export default createCorujaCrawler({
  urlListagem: "https://www.deborasantosimoveis.com.br/a-venda/praia-grande-sp",
});
