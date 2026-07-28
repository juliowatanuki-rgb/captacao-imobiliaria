// Inspecionado ao vivo em 2026-07-28 contra https://www.housefort.com.br.
// Plataforma real: Imobzi (o seed original tinha "Desenvolvimento proprio /
// W Imoveis" como chute, nao confirmado - na verdade e um Angular SPA com
// SSR construido sobre a plataforma Imobzi, identificada pelo custom element
// <imobzi-property-card> e pelo CDN imobzi.storage.googleapis.com).
//
// A busca generica do site (`/buscar?availability=buy&order=neighborhood`)
// retorna imoveis de uma rede/franquia com cobertura nacional (~1.414
// imoveis, ~79 paginas de 18 itens), nao so de Praia Grande - nao existe uma
// URL dedicada por cidade. O motor generico (platforms/imobzi.ts) filtra
// pelo href de cada card (so aceita hrefs com o slug "-praia-grande-"),
// entao e necessario paginar por toda a rede para nao perder imoveis (a
// ordenacao "por bairro" nao agrupa por cidade).
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.
import { createImobziCrawler } from "../platforms/imobzi.js";

export default createImobziCrawler({
  urlListagem: "https://www.housefort.com.br/buscar?availability=buy&order=neighborhood",
});
