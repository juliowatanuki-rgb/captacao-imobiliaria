// Validado manualmente contra https://www.tavaresepolati.com.br em 2026-07-28.
// Plataforma real: Praedium (o seed original tinha "Imoview" como chute -
// nao confirmado - a inspecao ao vivo mostrou HTML/CDN da Praedium).
import { createPraediumCrawler } from "../platforms/praedium.js";

export default createPraediumCrawler({
  urlListagem: "https://tavaresepolati.com.br/imoveis/a-venda",
});
