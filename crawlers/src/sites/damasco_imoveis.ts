// Inspecionado ao vivo em 2026-07-29 contra https://www.damascoimoveis.com.br.
// Plataforma real: Arbo Imoveis (o seed original tinha "Kenlo" como chute,
// nao confirmado - identificada pelo CDN static.arboimoveis.com.br nas fotos
// e pela API interna api-site.arboimoveis.com.br).
//
// A home e a URL raiz do site mostram imoveis de varias cidades da regiao do
// ABC/Sao Paulo (Santo Andre, Sao Caetano do Sul, Sao Roque, Ibiuna) - a
// imobiliaria atua em multiplas regioes, nao so Praia Grande. Existe uma URL
// dedicada por cidade (padrao /imoveis/a-venda/{cidade-slug}-sp):
// https://www.damascoimoveis.com.br/imoveis/a-venda/praia-grande-sp
// Validada com essa URL: 15 imoveis (o proprio site mostra "15 Imoveis" no
// texto da pagina). 14 com cidade="Praia Grande", 1 excecao com
// cidade="Santos" (AP28874_DAMA, bairro Boqueirao) - o site inclui esse
// resultado por proximidade geografica (ordenacao "mais_proximos"), nao por
// erro de filtro; o campo cidade do ScrapedListing reflete isso corretamente
// para filtragem posterior.
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.
import { createArboImoveisCrawler } from "../platforms/arbo_imoveis.js";

export default createArboImoveisCrawler({
  urlListagem: "https://www.damascoimoveis.com.br/imoveis/a-venda/praia-grande-sp",
});
