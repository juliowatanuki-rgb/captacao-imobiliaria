// Inspecionado ao vivo em 2026-07-28 contra
// https://plazaimoveisempreendimentos.com/praia-grande/imoveis/venda.
// Plataforma real: GUESS Tecnologia (confirma o chute do seed).
// CONFIRMADO (nao suposicao): so existem 5 imoveis / 1 pagina para Praia
// Grande - o proprio rodape da listagem mostra "Exibindo página 1 de 1." e o
// motor (guess_tecnologia.ts) verifica esse contador em runtime e falha alto
// se ele mudar para mais de 1 pagina, entao paginacao via postback ASP.NET
// ainda nao foi implementada (nao era necessaria neste caso). Ver comentario
// completo em crawlers/src/platforms/guess_tecnologia.ts.
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.
import { createGuessTecnologiaCrawler } from "../platforms/guess_tecnologia.js";

export default createGuessTecnologiaCrawler({
  urlListagem: "https://plazaimoveisempreendimentos.com/praia-grande/imoveis/venda",
});
