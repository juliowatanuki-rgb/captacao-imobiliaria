// Inspecionado ao vivo em 2026-07-29 contra
// https://www.safiraimoveispraiagrande.com.br. Plataforma real: Nido
// (confirmado - mesmo CDN objectstorage.sa-saopaulo-1.oraclecloud.com usado
// por moradanapraia.com.br), PORÉM com um template visual diferente do
// documentado em platforms/nido.ts (cards ".property-box-7", nao ".card1").
// Esse template ("box-7") tambem aparece em bueno_santos_imoveis.ts (variante
// "box-5") - motor compartilhado em platforms/nido_variant.ts.
//
// Validado ao vivo em 2026-07-29: 511 imoveis, 6/pagina (~86 paginas), URL ja
// filtrada por Praia Grande (nao ha contaminacao de outras cidades). 1a
// coleta confirmada contra o Neon em 2026-07-29: 511 novos, 0 erro.
import { createNidoVariantCrawler } from "../platforms/nido_variant.js";

export default createNidoVariantCrawler({
  urlListagem: "https://www.safiraimoveispraiagrande.com.br/imoveis/venda/SP/praia-grande",
  cardSelector: "property-box-7",
  priceSelector: ".price-box span",
});
