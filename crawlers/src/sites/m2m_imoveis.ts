// Inspecionado ao vivo em 2026-07-28 contra https://m2mimoveis.com.br.
// Plataforma real: Coruja Sistemas (confirma o chute do seed).
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.
import { createCorujaCrawler } from "../platforms/coruja.js";

export default createCorujaCrawler({
  urlListagem: "https://m2mimoveis.com.br/a-venda",
});
