// Validado manualmente contra https://www.casaparisimoveis.com.br em 2026-07-28.
import { createImoviewCrawler } from "../platforms/imoview.js";

export default createImoviewCrawler({
  urlListagem:
    "https://www.casaparisimoveis.com.br/venda/imovel/praia-grande/todos-os-bairros/todos-os-condominios/todas-as-opcoes",
});
