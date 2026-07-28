// Inspecionado ao vivo em 2026-07-28 contra https://www.igorbraga.com.br.
// Plataforma real: Castel Digital (confirma o chute do seed).
//
// O inventario de "/venda/" e da rede inteira (~5571 imoveis nacionais), nao
// so de Praia Grande. O site tem uma URL dedicada por cidade
// ("/venda/{estado-slug}/{cidade-slug}/") acessivel pelo link "Praia Grande"
// no menu/rodape da home - usa o mesmo padrao de paginacao por path
// (/pagina/N) do motor generico. Validado ao vivo em 2026-07-28:
// https://www.igorbraga.com.br/venda/sao-paulo/praia-grande/ retorna 5.563
// imoveis (232 paginas, 24/pagina, ultima pagina com 19), 100% com
// cidade="Praia Grande" no card (.cidade) em todas as paginas percorridas -
// nenhum imovel de outra cidade encontrado.
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.
import { createCastelDigitalCrawler } from "../platforms/castel_digital.js";

export default createCastelDigitalCrawler({
  urlListagem: "https://www.igorbraga.com.br/venda/sao-paulo/praia-grande/",
});
