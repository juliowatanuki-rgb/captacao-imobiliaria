// Inspecionado ao vivo em 2026-07-29 contra https://www.moradanapraia.com.br.
// Plataforma real: Nido (identificada pelo link de login "app.nidoadm.com.br"
// no header e pelo link "nido.com.br" no rodape - motor novo criado em
// crawlers/src/platforms/nido.ts; o chute do seed era "Kenlo", nao confirmado
// e incorreto).
//
// A URL "/imoveis/venda/sp/praia-grande" ja e a listagem dedicada da cidade
// (nao existe inventario "geral" misturado no site - toda a navegacao de venda
// passa por segmentos /sp/praia-grande). Validado ao vivo em 2026-07-29: 1737
// imoveis, 37 paginas com conteudo (48/pagina, ultima com 9) + 1 pagina extra
// vazia que encerra a paginacao, 100% cidade="Praia Grande", 0 externalId
// duplicado. Estavel em 2 execucoes completas seguidas (1737 nas duas).
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.
import { createNidoCrawler } from "../platforms/nido.js";

export default createNidoCrawler({
  urlListagem: "https://www.moradanapraia.com.br/imoveis/venda/sp/praia-grande",
});
