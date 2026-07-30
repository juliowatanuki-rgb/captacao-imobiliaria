// Inspecionado ao vivo em 2026-07-30 contra https://www.novacpi.com.br.
// Plataforma real: Kenlo (mesmo CDN static-sites.kenlo.io e mesma estrutura
// de card "a.card-with-buttons" de platforms/kenlo.ts). Codigos com sufixo
// "-NCE". Inventario grande (mais de 50 paginas confirmadas ao vivo, ~600+
// imoveis), paginacao ?pagina=N.
import { createKenloCrawler } from "../platforms/kenlo.js";

export default createKenloCrawler({
  urlListagem: "https://www.novacpi.com.br/imoveis/a-venda/praia-grande",
});
