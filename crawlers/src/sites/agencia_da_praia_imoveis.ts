// Inspecionado ao vivo em 2026-08-05 contra https://www.agenciadapraia.com.br
// (usar sempre o dominio com "www." - mesmo padrao ja observado em outros
// sites Kenlo, ver nova_casarao_imoveis.ts).
// Plataforma real: Kenlo (mesmo motor generico reaproveitado de
// nova_casarao_imoveis, identificado pelo CDN static-sites.kenlo.io /
// img.kenlo.io e pela classe a.card-with-buttons).
// URL de listagem sem filtro de cidade (/imoveis/a-venda) retorna 725
// imoveis de varias cidades (ha filtros por bairro no rodape sugerindo
// cobertura regional, mesmo problema ja documentado em nova_casarao_imoveis) -
// trocada para a URL dedicada por cidade (removendo o segmento de bairro de
// um link do rodape, mesmo truque usado em nova_casarao_imoveis):
// https://www.agenciadapraia.com.br/imoveis/a-venda/praia-grande
// Validado com npm run validate:site: 2 paginas, 24 imoveis, 100%
// externalId e url presentes, 100% cidade="Praia Grande".
import { createKenloCrawler } from "../platforms/kenlo.js";

export default createKenloCrawler({
  urlListagem: "https://www.agenciadapraia.com.br/imoveis/a-venda/praia-grande",
});
