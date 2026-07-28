// Inspecionado ao vivo em 2026-07-28 contra https://www.novacasarao.com.br
// (o dominio sem "www." retorna erro 552 - sempre usar www.).
// Plataforma real: Kenlo (o seed original tinha "Union Softwares" como chute,
// nao confirmado).
//
// A urlListagem antiga ("/imoveis/a-venda", sem filtro de cidade) retorna
// inventario de varias cidades (31 de 3375 imoveis numa revalidacao completa
// em 2026-07-28 eram de Mongagua/Itanhaem/Sao Vicente/Guaruja/Joanopolis, nao
// Praia Grande). Trocada para a URL dedicada por cidade (encontrada via um
// link de bairro no rodape, no formato /imoveis/a-venda/praia-grande/{bairro}
// - removendo o segmento de bairro filtra pela cidade toda):
// https://www.novacasarao.com.br/imoveis/a-venda/praia-grande
// Revalidado com essa URL: 3344 imoveis, 280 paginas, 100% cidade="Praia
// Grande", 0 externalId duplicado.
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.
import { createKenloCrawler } from "../platforms/kenlo.js";

export default createKenloCrawler({
  urlListagem: "https://www.novacasarao.com.br/imoveis/a-venda/praia-grande",
});
