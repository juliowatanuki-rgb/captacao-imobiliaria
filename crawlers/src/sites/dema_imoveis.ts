// Inspecionado ao vivo em 2026-07-28 contra https://demaimoveispg.com.br.
// Plataforma real: Coruja Sistemas - NAO Union Softwares como chutado no
// seed. Mesmo motor generico de m2m_imoveis e tempone_imoveis_pg: rodape
// "Site feito por Coruja Sistemas", imagens em d1cvze3955gobs.cloudfront.net,
// cards <section class="property-card-search">. O layout/menu do site e
// identico ao de tempone_imoveis_pg (mesmo template do fornecedor Coruja
// Sistemas).
//
// O site cobre varias cidades (Cubatao, Guaruja, Itanhaem, Praia Grande,
// Santos, Sao Paulo, Sao Vicente etc). Assim como em igor_braga_imoveis e
// tempone_imoveis_pg, existe uma URL dedicada por cidade:
// https://demaimoveispg.com.br/a-venda/praia-grande-sp
// Validado ao vivo em 2026-07-28: 400 imoveis (21 paginas, 20/pagina),
// 100% com externalId (REF: LETxxx) e urlOriginal, 100% com preco, cidade
// sempre "PRAIA GRANDE - SP" em todas as paginas percorridas.
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.
import { createCorujaCrawler } from "../platforms/coruja.js";

export default createCorujaCrawler({
  urlListagem: "https://demaimoveispg.com.br/a-venda/praia-grande-sp",
});
