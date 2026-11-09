// Validado manualmente contra https://aetherna.emp.br em 2026-07-29.
// Plataforma Coruja Sistemas. O filtro oficial da cidade leva a
// /a-venda/praia-grande-sp; o caminho antigo /imoveis/a-venda/... retornava
// uma pagina de "Imovel nao encontrado". Validado com o formulario GET do site.
import { createCorujaCrawler } from "../platforms/coruja.js";

export default createCorujaCrawler({
  urlListagem: "https://www.aetherna.emp.br/a-venda/praia-grande-sp",
});
