// Validado manualmente contra https://www.msainvestimentoimobiliario.com.br
// em 2026-07-29. Plataforma real: Kenlo (mesmo CDN static-sites.kenlo.io e
// mesma estrutura de card "a.card-with-buttons" documentada em
// platforms/kenlo.ts), NAO "Kenlo" generico da planilha - o site na verdade
// opera sob a marca "Kadri Imoveis" (dominio kadriimoveis.com.br redireciona
// para este mesmo dominio/conteudo). urlListagem valida com 12+ cards
// carregados na 1a pagina.
import { createKenloCrawler } from "../platforms/kenlo.js";

export default createKenloCrawler({
  urlListagem: "https://www.msainvestimentoimobiliario.com.br/imoveis/a-venda/praia-grande",
});
