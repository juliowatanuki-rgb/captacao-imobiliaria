// Inspecionado ao vivo em 2026-07-28 contra
// https://felicianoassociadosimoveis.com.br. Plataforma real: Microsistec
// ("site para imobiliaria desenvolvido por Microsistec", fotos hospedadas em
// vault.imob.online) - NAO e Castel Digital como chutado no seed. Motor novo
// criado em crawlers/src/platforms/microsistec.ts.
//
// O site responde 403 Forbidden para o User-Agent padrao do Playwright
// (contornado no motor com page.setExtraHTTPHeaders).
//
// A urlListagem generica ("/busca/nenhuma/qualquer-cidade", filtro de cidade
// nulo) retorna 624 imoveis, dos quais 3 eram de outras cidades (1 Pedro de
// Toledo, 2 Sao Vicente). Trocada para a URL dedicada por cidade (achada pelo
// link "Praia Grande" do proprio site, que redireciona para um filtro com
// city=9527): https://felicianoassociadosimoveis.com.br/busca/nenhuma/praia-grande-sp?filters=eyJjaXR5IjoiOTUyNyIsInRvdXJfMzYwX3VybCI6bnVsbCwibWF4X3ByaWNlIjpudWxsLCJvcmRlciI6IjMifQ%3D%3D
// Revalidado ao vivo com essa URL: ~621 imoveis em ~43 paginas (15 por
// pagina, ultima com 6), 100% com cidade="Praia Grande", externalId sempre
// unico (0 duplicados), 0 urlOriginal relativa/faltando, precoNull=0,
// areaNull=0, dormNull=2 (imoveis sem quartos informado, ex: terrenos/kitnets
// atipicos). Amostra de bairros: Canto do Forte, Ocian, Boqueirao, Real,
// Aviacao, Tupi, Guilhermina, Caicara, Balneario Maracana, Florida, Mirim,
// Solemar, Tupiry, Melvi, Vila Caicara.
// ATENCAO: essa contagem foi medida ANTES de descobrir uma instabilidade de
// paginacao no motor coruja.ts (ver comentario em alpha_imoveis_pg.ts) - o
// motor microsistec.ts ja recebeu o mesmo retry-se-vazio preventivamente,
// mas nao foi reconfirmado com 2 execucoes seguidas. Revalidar antes da 1a
// varredura real contra o Neon.
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.
import { createMicrosistecCrawler } from "../platforms/microsistec.js";

export default createMicrosistecCrawler({
  urlListagem:
    "https://felicianoassociadosimoveis.com.br/busca/nenhuma/praia-grande-sp?filters=eyJjaXR5IjoiOTUyNyIsInRvdXJfMzYwX3VybCI6bnVsbCwibWF4X3ByaWNlIjpudWxsLCJvcmRlciI6IjMifQ%3D%3D",
});
