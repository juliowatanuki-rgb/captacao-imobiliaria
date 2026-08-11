// Inspecionado ao vivo em 2026-08-11 contra https://bomlugarimoveis.com.br.
// Plataforma real: Microsistec (mesmo motor generico de
// feliciano_imoveis_praia_grande.ts - confirmado via article.box-construction-8
// e link de detalhe /detalhes/imovel/{tipo}/{cidade}/{bairro}/codigo/{codigo}).
// URL de listagem dedicada por cidade (city=9527 = Praia Grande, mesmo id
// usado por feliciano_imoveis_praia_grande.ts), obtida clicando em "Buscar
// Imoveis" sem filtros extras no proprio site:
// https://bomlugarimoveis.com.br/busca/nenhuma/praia-grande-sp?filters=eyJjaXR5IjoiOTUyNyIsIm9yZGVyIjozfQ%3D%3D
import { createMicrosistecCrawler } from "../platforms/microsistec.js";

export default createMicrosistecCrawler({
  urlListagem:
    "https://bomlugarimoveis.com.br/busca/nenhuma/praia-grande-sp?filters=eyJjaXR5IjoiOTUyNyIsIm9yZGVyIjozfQ%3D%3D",
});
