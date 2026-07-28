// Inspecionado ao vivo em 2026-07-28 contra https://temponeimoveispg.com.br.
// Plataforma real: Coruja Sistemas (confirma o chute do seed; mesmo motor de
// m2m_imoveis e dema_imoveis - rodape "Site feito por Coruja Sistemas",
// imagens em d1cvze3955gobs.cloudfront.net, cards <section class="property-
// card-search">).
//
// O site cobre varias cidades do litoral (Itanhaem, Mongagua, Peruibe, Praia
// Grande, Sao Paulo, Sao Vicente). Assim como em igor_braga_imoveis, existe
// uma URL dedicada por cidade acessivel pelo filtro "Cidade" do formulario de
// busca (form action /busca?city=praia+grande redireciona para a URL limpa
// abaixo): https://temponeimoveispg.com.br/a-venda/praia-grande-sp
// Validado ao vivo em 2026-07-28: 460 imoveis (24 paginas, 20/pagina, ultima
// pagina vazia encerra a paginacao), 100% com externalId (REF: TMPxxxx) e
// urlOriginal, 100% com preco. Cidade sempre alguma variacao de escrita de
// "Praia Grande" feita pelo proprio site ("PRAIA GRANDE - SP", "PRAIA GRANDE
// - SAO PAULO", "PRAIA GRANDE - SÃO PAULO") - nenhum imovel de outra cidade
// encontrado nas paginas percorridas.
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.
import { createCorujaCrawler } from "../platforms/coruja.js";

export default createCorujaCrawler({
  urlListagem: "https://temponeimoveispg.com.br/a-venda/praia-grande-sp",
});
