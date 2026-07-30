// Inspecionado ao vivo em 2026-07-30 contra https://www.primeimoveispg.com.br.
// Plataforma real: Kenlo (mesmo CDN static-sites.kenlo.io e mesma estrutura
// de card "a.card-with-buttons" de platforms/kenlo.ts). Site mono-cidade
// (Praia Grande, 666 imoveis), paginacao ?pagina=N confirmada ao vivo.
import { createKenloCrawler } from "../platforms/kenlo.js";

export default createKenloCrawler({
  urlListagem: "https://www.primeimoveispg.com.br/imoveis/a-venda/praia-grande",
});
