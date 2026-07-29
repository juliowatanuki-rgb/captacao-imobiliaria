// Validado manualmente contra https://aetherna.emp.br em 2026-07-29.
// Plataforma real: Coruja Sistemas (meta author "Coruja Sistemas", mesma
// estrutura de card "section.property-card-search" documentada em
// platforms/coruja.ts), NAO "Union Softwares" como chutado na planilha
// original. URL exibe "MARIO J. DA S. NETO CONSULTOR" como razao social por
// tras da marca Aetherna - mesmo site, sem duplicidade. 1363 imoveis
// declarados na listagem filtrada por Praia Grande.
import { createCorujaCrawler } from "../platforms/coruja.js";

export default createCorujaCrawler({
  urlListagem: "https://aetherna.emp.br/a-venda/praia-grande-sp",
});
