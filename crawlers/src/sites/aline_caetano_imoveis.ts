// Inspecionado ao vivo em 2026-07-29 contra https://www.alinecaetano.com.br.
// Plataforma real: Imobzi (o seed original tinha "Desenvolvimento proprio"
// como chute, nao confirmado - na verdade e um Angular SPA Imobzi, so que
// numa versao mais nova do template, com o custom-element
// <imobzi-grid-card> em vez de <imobzi-property-card>; mesma imagem hospedada
// em lh3.googleusercontent.com/CDN do Google, api2.imobzi.app). O motor
// platforms/imobzi.ts foi atualizado para reconhecer os dois templates (ver
// comentario la) em vez de duplicar o motor.
//
// A busca deste site tem um parametro de cidade dedicado
// (`&city=Praia%20Grande`), diferente do housefort (que nao tem e precisa
// paginar a rede inteira filtrando por href). URL usada, obtida clicando no
// botao de pagina 2 na listagem de um bairro e observando a URL real por
// tras (`/buscar?availability=buy&city=Praia%20Grande&order=most_relevant&direction=desc`):
// https://www.alinecaetano.com.br/buscar?availability=buy&city=Praia%20Grande&order=most_relevant&direction=desc
//
// Validado ao vivo (2026-07-29): 1855 imoveis anunciados, 104 paginas (18 por
// pagina, ultima com 1), page=105 retorna vazio (fim real, nao instabilidade -
// paginas 1/2/20/60/103/104/105 testadas individualmente e o total bate).
// 100% dos hrefs amostrados contem o slug "-praia-grande-" (filtro de cidade
// do proprio site + filtro por href do motor como segunda camada).
import { createImobziCrawler } from "../platforms/imobzi.js";

export default createImobziCrawler({
  urlListagem:
    "https://www.alinecaetano.com.br/buscar?availability=buy&city=Praia%20Grande&order=most_relevant&direction=desc",
  maxPaginas: 130,
});
