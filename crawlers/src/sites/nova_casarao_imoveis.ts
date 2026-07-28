// Inspecionado ao vivo em 2026-07-28 contra https://www.novacasarao.com.br
// (o dominio sem "www." retorna erro 552 - sempre usar www.).
// Plataforma real: Kenlo (o seed original tinha "Union Softwares" como chute,
// nao confirmado).
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.
import { createKenloCrawler } from "../platforms/kenlo.js";

export default createKenloCrawler({
  urlListagem: "https://www.novacasarao.com.br/imoveis/a-venda",
});
