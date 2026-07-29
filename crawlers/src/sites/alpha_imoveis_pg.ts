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
// Revalidado ao vivo com essa URL (2 execucoes seguidas, apos o fix de
// rate-limit/paginacao do motor coruja.ts - pausa entre paginas + retry com
// reload): 1400 imoveis em 71 paginas, identico nas duas execucoes. 100%
// com cidade="PRAIA GRANDE - SP", externalId sempre unico (0 duplicados),
// 0 urlOriginal relativa/faltando, precoNull=0. Amostra de bairros:
// Boqueirao, Caicara, Aviacao, Solemar, Forte, Guilhermina, Canto do Forte,
// Ocian, Tude Bastos, Tupi, Vila Assuncao, Melvi, Real, Tupiry, Maracana,
// Mirim (com variacoes de grafia/acentuacao do proprio site - nao
// normalizado aqui).
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.
import { createCorujaCrawler } from "../platforms/coruja.js";

export default createCorujaCrawler({
  urlListagem: "https://alphaimoveispg.com.br/a-venda/praia-grande-sp",
});
