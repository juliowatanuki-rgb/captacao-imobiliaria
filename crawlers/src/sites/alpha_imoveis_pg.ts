// Inspecionado ao vivo em 2026-07-28 contra https://alphaimoveispg.com.br.
// Plataforma real: Coruja Sistemas (confirma o chute do seed - rodape "Site
// feito por Coruja Sistemas" e imagens em d1cvze3955gobs.cloudfront.net,
// mesmo motor de m2m_imoveis/tempone_imoveis_pg/dema_imoveis).
//
// A urlListagem generica ("/a-venda", sem filtro de cidade) retorna o
// inventario da rede inteira (1583 imoveis, o 1o card da 1a pagina ja era um
// terreno em "Cotia" - fora de Praia Grande). Trocada para a URL dedicada por
// cidade (mesmo padrao dos outros sites Coruja):
// https://alphaimoveispg.com.br/a-venda/praia-grande-sp
// Revalidado ao vivo com essa URL: ~420 imoveis em ~22 paginas (20 por
// pagina), 100% com cidade="PRAIA GRANDE - SP", externalId sempre unico (0
// duplicados), 0 urlOriginal relativa/faltando, precoNull=0, areaNull=7
// (imoveis sem area informada no card, ex: terrenos). Amostra de bairros:
// Boqueirao, Caicara, Aviacao, Solemar, Forte, Guilhermina, Canto do Forte,
// Ocian, Tude Bastos, Tupi, Vila Assuncao, Melvi, Real, Tupiry, Maracana,
// Mirim (com variacoes de grafia/acentuacao do proprio site - nao
// normalizado aqui).
// ATENCAO: essa contagem foi medida ANTES de descobrir uma instabilidade de
// paginacao no motor coruja.ts (reexecucoes sucessivas contra m2m_imoveis
// encontravam mais paginas/imoveis do que a anterior - 320 -> 420 -> 600 -,
// corrigido com um retry-se-vazio em coruja.ts, mas a causa raiz - talvez o
// site reordene/pagine de forma nao 100% deterministica sob carga - nao foi
// totalmente investigada). Revalidar (2 execucoes seguidas, comparando o
// total) antes da 1a varredura real contra o Neon.
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.
import { createCorujaCrawler } from "../platforms/coruja.js";

export default createCorujaCrawler({
  urlListagem: "https://alphaimoveispg.com.br/a-venda/praia-grande-sp",
});
