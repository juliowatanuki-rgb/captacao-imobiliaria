// Inspecionado ao vivo em 2026-07-28 contra
// https://plazaimoveisempreendimentos.com/praia-grande/imoveis/venda.
// Plataforma real: GUESS Tecnologia (confirma o chute do seed).
// ATENCAO: so 5 imoveis / 1 pagina no momento da inspecao - este motor ainda
// NAO suporta paginacao via postback ASP.NET (ver comentario em
// crawlers/src/platforms/guess_tecnologia.ts). Revisar antes de crawlear se
// o numero de imoveis crescer.
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.
import { createGuessTecnologiaCrawler } from "../platforms/guess_tecnologia.js";

export default createGuessTecnologiaCrawler({
  urlListagem: "https://plazaimoveisempreendimentos.com/praia-grande/imoveis/venda",
});
