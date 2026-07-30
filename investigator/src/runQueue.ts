import { chromium } from "playwright";
import { getPool } from "@captacao/db";
import { extrairDetalhePagina } from "./extractDetail.js";
import { investigarComGemini } from "./gemini.js";
import { registrarInvestigacao } from "./persistResult.js";
import { gerarConsultasBusca } from "./searchQueries.js";
import { extrairEvidenciaExterna } from "./searchEvidence.js";
import { selecionarFilaDeInvestigacao } from "./selectQueue.js";
import { buscarResultadosExternos } from "./webSearch.js";

// Prova de conceito (regra 12 do pedido: nao automatizar todos os anuncios
// ainda) - teto rigido de 5 anuncios por execucao, independente do que for
// passado em argv.
const MAX_ANUNCIOS_POC = 5;

/** Uso: npm run investigate:queue -w @captacao/investigator -- [quantidade ate 5] */
async function main() {
  const quantidadeArg = Number.parseInt(process.argv[2] ?? "", 10);
  const quantidade = Number.isFinite(quantidadeArg) && quantidadeArg > 0
    ? Math.min(quantidadeArg, MAX_ANUNCIOS_POC)
    : MAX_ANUNCIOS_POC;

  if (!process.env.GEMINI_API_KEY) {
    console.error("[investigate:queue] GEMINI_API_KEY nao configurada no ambiente - abortando");
    process.exit(1);
  }

  const pool = getPool();
  const fila = await selecionarFilaDeInvestigacao(pool, quantidade);

  if (fila.length === 0) {
    console.log("[investigate:queue] nenhum anuncio pendente sem investigacao encontrado");
    await pool.end();
    return;
  }

  console.log(`[investigate:queue] ${fila.length} anuncio(s) selecionado(s) para investigacao`);

  const browser = await chromium.launch();
  const context = await browser.newContext();

  let sucesso = 0;
  let comErro = 0;

  try {
    for (const listing of fila) {
      const inicio = Date.now();
      console.log(`[investigate:queue] investigando listing ${listing.listingId} (${listing.siteNome}, cod. ${listing.codigoImovel ?? "?"})`);

      try {
        const page = await context.newPage();
        let detalhe;
        try {
          detalhe = await extrairDetalhePagina(page, listing.urlFinal ?? listing.urlOriginal);
        } finally {
          await page.close();
        }

        const consultas = gerarConsultasBusca(listing, detalhe);
        console.log(`[investigate:queue] listing ${listing.listingId}: ${consultas.length} consulta(s) de pesquisa externa`);
        const resultadosBusca = await buscarResultadosExternos(consultas);
        const evidenciasExternas = resultadosBusca.map((r) => extrairEvidenciaExterna(r, listing, detalhe));

        const resultado = await investigarComGemini(listing, detalhe, evidenciasExternas);
        const tempoProcessamentoMs = Date.now() - inicio;

        await registrarInvestigacao(pool, {
          listingId: listing.listingId,
          resultado,
          fotosAnalisadas: detalhe.fotos.length,
          fontesExternasPesquisadas: evidenciasExternas.length,
          tempoProcessamentoMs,
        });

        if (resultado.erro) {
          comErro += 1;
          console.error(`[investigate:queue] listing ${listing.listingId}: erro="${resultado.erro}"`);
        } else {
          sucesso += 1;
          console.log(
            `[investigate:queue] listing ${listing.listingId}: status=${resultado.resultado?.status} confianca=${resultado.resultado?.confianca} fotos=${detalhe.fotos.length} fontes_externas=${evidenciasExternas.length} tempo_ms=${tempoProcessamentoMs}`
          );
        }
      } catch (err) {
        // Isola falha por anuncio (mesmo principio de crawlSite - secao 18):
        // um erro inesperado em um item nao pode impedir os demais.
        comErro += 1;
        const mensagem = err instanceof Error ? err.message : String(err);
        console.error(`[investigate:queue] listing ${listing.listingId}: falha inesperada - ${mensagem}`);
        await registrarInvestigacao(pool, {
          listingId: listing.listingId,
          resultado: {
            resultado: null,
            usage: { totalInputTokens: null, totalOutputTokens: null, totalTokens: null },
            modelo: "desconhecido",
            erro: mensagem,
          },
          fotosAnalisadas: 0,
          fontesExternasPesquisadas: 0,
          tempoProcessamentoMs: Date.now() - inicio,
        }).catch(() => {});
      }
    }
  } finally {
    await context.close();
    await browser.close();
    await pool.end();
  }

  console.log(`[investigate:queue] concluido: ${sucesso} sucesso, ${comErro} com erro, de ${fila.length} total`);
}

main().catch((err) => {
  console.error("[investigate:queue] falhou:", err instanceof Error ? err.message : err);
  process.exit(1);
});
