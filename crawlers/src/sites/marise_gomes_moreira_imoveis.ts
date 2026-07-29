// Validado manualmente contra https://www.mgmsolucoesimobiliaria.com.br em
// 2026-07-29. Plataforma real: Coruja Sistemas (meta author "Coruja
// Sistemas", mesma estrutura de card "section.property-card-search"
// documentada em platforms/coruja.ts, mesmo hash de app.js que
// aetherna_empreendimentos e debora_santos_imoveis - provavelmente mesma
// rede/parceria de anuncios), NAO "Tecimob" como chutado na planilha
// original. 1737 imoveis declarados na listagem filtrada por Praia Grande.
import { createCorujaCrawler } from "../platforms/coruja.js";

export default createCorujaCrawler({
  urlListagem: "https://www.mgmsolucoesimobiliaria.com.br/a-venda/praia-grande-sp",
});
