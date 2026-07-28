// Inspecionado ao vivo em 2026-07-28 contra https://m2mimoveis.com.br.
// Plataforma real: Coruja Sistemas (confirma o chute do seed).
//
// A urlListagem antiga ("/a-venda", sem filtro de cidade) retorna inventario
// de VARIAS cidades do litoral (so 589 de 660 imoveis eram de Praia Grande
// numa revalidacao completa em 2026-07-28 - o resto era Mongagua, Itanhaem,
// Sao Vicente, Santos, Peruibe etc). Trocada para a URL dedicada por cidade
// (mesmo padrao de igor_braga_imoveis/tempone_imoveis_pg/dema_imoveis):
// https://m2mimoveis.com.br/a-venda/praia-grande-sp
// Revalidado ao vivo com essa URL: 380 imoveis, 20 paginas, 100% com
// cidade="PRAIA GRANDE - SP", 0 externalId duplicado, 0 urlOriginal relativa.
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.
import { createCorujaCrawler } from "../platforms/coruja.js";

export default createCorujaCrawler({
  urlListagem: "https://m2mimoveis.com.br/a-venda/praia-grande-sp",
});
