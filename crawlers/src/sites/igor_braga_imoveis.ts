// Inspecionado ao vivo em 2026-07-28 contra https://www.igorbraga.com.br.
// Plataforma real: Castel Digital (confirma o chute do seed).
// Atencao: o inventario parece ser de rede/nacional (~5571 imoveis), nao so
// de Praia Grande - validar se ha como restringir por cidade antes da 1a
// varredura real.
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.
import { createCastelDigitalCrawler } from "../platforms/castel_digital.js";

export default createCastelDigitalCrawler({
  urlListagem: "https://www.igorbraga.com.br/venda/",
});
