// Inspecionado ao vivo em 2026-07-30 contra https://www.costadosolimobiliaria.com.br.
// Plataforma real: Kenlo (mesmo CDN static-sites.kenlo.io e mesma estrutura
// de card "a.card-with-buttons" de platforms/kenlo.ts). Codigos com sufixo
// "-C0O".
import { createKenloCrawler } from "../platforms/kenlo.js";

export default createKenloCrawler({
  urlListagem: "https://www.costadosolimobiliaria.com.br/imoveis/a-venda/praia-grande",
});
