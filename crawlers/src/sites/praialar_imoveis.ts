// Inspecionado ao vivo em 2026-07-28 contra https://praialarimoveis.com.br.
// Plataforma real: site Next.js sob medida (front-end proprio, classes
// "pl-card" etc.) sobre um backend/CDN de imagens chamado "Imobeal"
// (imobeal-api.onrender.com, socket.io com tenant=praialar). O seed
// original tinha "Sub 100 Sistemas" como chute, nao confirmado - nao bateu
// com nenhuma plataforma ja conhecida.
//
// Assim como group_house_fort, o site cobre "Praia Grande e todo o litoral
// de SP" - a 1a coleta real trouxe 68/997 imoveis de outras cidades
// (Mongagua, Itanhaem, etc.), entao o motor (platforms/imobeal.ts) filtra
// pelo texto de localizacao do card, mantendo so "Praia Grande - {Bairro}".
//
// A paginacao NAO funciona por query string (`?page=N` na URL e ignorado
// pelo app) - o motor (platforms/imobeal.ts) clica no botao "Proxima" e
// espera o primeiro card mudar antes de extrair cada pagina seguinte.
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.
import { createImobealCrawler } from "../platforms/imobeal.js";

export default createImobealCrawler({
  urlListagem: "https://praialarimoveis.com.br/imoveis?modo=venda",
});
