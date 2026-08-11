// Inspecionado ao vivo em 2026-08-05 contra https://eliteimoveispg.com.br.
// Plataforma real: Praedium (mesmo CDN cdn3.praedium.com.br usado por
// arthur_paraguay_investimentos, imigrantes_imoveis, etc - motor generico
// reaproveitado, sem duplicar).
// URL de listagem por cidade encontrada no rodape ("1365 Praia Grande"):
// https://eliteimoveispg.com.br/imoveis/a-venda/praia-grande-sp
// Validado com npm run validate:site: 2 paginas, 40 imoveis, 100%
// externalId e url presentes.
import { createPraediumCrawler } from "../platforms/praedium.js";

export default createPraediumCrawler({
  urlListagem: "https://eliteimoveispg.com.br/imoveis/a-venda/praia-grande-sp",
});
