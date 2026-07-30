// Inspecionado ao vivo em 2026-07-30 contra https://www.novageracaoimoveispraia.com.br.
// Plataforma real: Kenlo (logo alt="Kenlo" no header, mesmo CDN
// static-sites.kenlo.io de platforms/kenlo.ts) - reaproveita o motor generico.
import { createKenloCrawler } from "../platforms/kenlo.js";

export default createKenloCrawler({
  urlListagem: "https://www.novageracaoimoveispraia.com.br/imoveis/a-venda/praia-grande",
});
