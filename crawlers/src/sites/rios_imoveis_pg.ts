// Inspecionado ao vivo em 2026-08-05 contra https://riosimoveispg.com.br.
// Plataforma real: Praedium (mesmo CDN cdn3.praedium.com.br usado por
// arthur_paraguay_investimentos, elite_imoveis_pg, etc - motor generico
// reaproveitado, sem duplicar).
// URL de listagem por cidade encontrada nos links de bairro do rodape
// (removendo o segmento de bairro):
// https://riosimoveispg.com.br/imoveis/a-venda/praia-grande-sp
// Validado com npm run validate:site: 2 paginas, 40 imoveis, 100%
// externalId e url presentes. Bairro vem com prefixo de rua neste site
// (ex.: "Rua Paula Ney - Vila Assunção") - cosmetic, nao impede o uso.
import { createPraediumCrawler } from "../platforms/praedium.js";

export default createPraediumCrawler({
  urlListagem: "https://riosimoveispg.com.br/imoveis/a-venda/praia-grande-sp",
});
