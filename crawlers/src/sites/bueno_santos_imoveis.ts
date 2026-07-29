// Validado manualmente contra https://www.buenosantosimoveis.com.br em
// 2026-07-29. Plataforma real: Nido (meta author "Nido Tecnologia", mesmo CDN
// objectstorage.sa-saopaulo-1.oraclecloud.com), NAO "Coruja Sistemas" como
// chutado na planilha original. Template "box-5" (variante do template
// "box-7" usado em safira_imoveis_praia_grande.ts) - motor compartilhado em
// platforms/nido_variant.ts. 198 imoveis declarados na listagem filtrada por
// Praia Grande.
import { createNidoVariantCrawler } from "../platforms/nido_variant.js";

export default createNidoVariantCrawler({
  urlListagem: "https://www.buenosantosimoveis.com.br/imoveis/venda/sp/praia-grande",
  cardSelector: "property-box-5",
  priceSelector: ".price-ratings-box .price",
});
