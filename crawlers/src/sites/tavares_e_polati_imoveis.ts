// Atualizado em 2026-10-26: o site migrou de Praedium para Market Imóvel.
// A rota antiga /imoveis/a-venda agora retorna 404; a listagem ativa é
// /imoveis/venda e usa paginação client-side com ?page=N.
import { createMarketImovelCrawler } from "../platforms/market_imovel.js";

export default createMarketImovelCrawler({
  urlListagem: "https://tavaresepolati.com.br/imoveis/venda",
});
