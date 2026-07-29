// Inspecionado ao vivo em 2026-07-29 contra https://allprimeimoveis.com.br.
// Plataforma real: Praedium (rodape com "powered by praedium.com.br"), NAO
// "Castel Digital" como chutado no seed - reaproveita o motor generico
// existente em crawlers/src/platforms/praedium.ts, sem necessidade de motor
// novo.
//
// A URL "/imoveis/a-venda/praia-grande-sp" ja e a listagem dedicada da
// cidade. Validado ao vivo em 2026-07-29 (1a execucao completa, sem bloqueio):
// 880 imoveis, 45 paginas (20/pagina), 100% cidade="Praia Grande", 0
// semExternalId/semUrl, amostra com bairros variados (Aviacao, Guilhermina,
// Canto do Forte, Boqueirao).
//
// Execucoes completas seguintes (2a e 3a, esta ultima ja com o fix de pausa
// entre paginas + retry-com-reload aplicado em praedium.ts) retornaram HTTP
// 405 "Human Verification" - bloqueio anti-bot do proprio site acionado pelo
// volume de requisicoes da 1a validacao, NAO um bug de paginacao do crawler.
// Recomenda-se revalidar apos um periodo de cooldown antes de considerar a
// estabilidade 100% confirmada (nao contornar a verificacao anti-bot).
// Crawler ainda NAO executado contra o Neon de producao.
import { createPraediumCrawler } from "../platforms/praedium.js";

export default createPraediumCrawler({
  urlListagem: "https://allprimeimoveis.com.br/imoveis/a-venda/praia-grande-sp",
});
