// Inspecionado ao vivo em 2026-07-28 contra https://praialarimoveis.com.br.
// Plataforma real: site Next.js sob medida (front-end proprio, classes
// "pl-card" etc.) sobre um backend/CDN de imagens chamado "Imobeal"
// (imobeal-api.onrender.com, socket.io com tenant=praialar). O seed
// original tinha "Sub 100 Sistemas" como chute, nao confirmado - nao bateu
// com nenhuma plataforma ja conhecida.
//
// Diferente de group_house_fort/Imobzi, este site e mono-cidade: todos os
// 997 imoveis observados vieram como "Praia Grande - {Bairro}" (nenhuma
// outra cidade encontrada), entao nao ha necessidade de filtro de cidade.
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
