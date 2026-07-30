// Script de validacao manual do PROCESSO de investigacao (regra 11 do ajuste
// pedido pelo usuario em 2026-07-30) - roda a extracao de detalhe/fotos e a
// etapa de pesquisa externa contra um anuncio real conhecido, e imprime tudo
// para inspecao manual.
//
// NAO chama a Gemini API e NAO grava nada no Neon (so leitura, so para achar
// os dados reais do anuncio na tabela `listings`) - a resposta de referencia
// usada para validar o resultado NAO fica em lugar nenhum deste arquivo nem
// do banco, e comparada manualmente fora do codigo.
//
// Uso: DATABASE_URL=... npx tsx scripts/validarAnuncioConhecido.ts <url_original>
import { chromium } from "playwright";
import { getPool } from "@captacao/db";
import { extrairDetalhePagina } from "../src/extractDetail.js";
import { montarPromptTexto } from "../src/prompt.js";
import { extrairEvidenciaExterna } from "../src/searchEvidence.js";
import { gerarConsultasBusca } from "../src/searchQueries.js";
import type { ListingParaInvestigar } from "../src/types.js";
import { buscarResultadosExternos } from "../src/webSearch.js";

async function main() {
  const urlOriginal = process.argv[2];
  if (!urlOriginal) {
    console.error("Uso: npx tsx scripts/validarAnuncioConhecido.ts <url_original>");
    process.exit(1);
  }

  const pool = getPool();
  const { rows } = await pool.query<{
    id: string;
    site_id: string;
    site_nome: string;
    external_id: string | null;
    url_original: string;
    url_final: string | null;
    titulo: string | null;
    descricao: string | null;
    bairro: string | null;
    area_util: string | null;
    preco: string | null;
    condominio_nome: string | null;
    dormitorios: number | null;
    suites: number | null;
    vagas: number | null;
  }>(
    `SELECT l.id, l.site_id, s.nome AS site_nome, l.external_id, l.url_original, l.url_final,
            l.titulo, l.descricao, l.bairro, l.area_util, l.preco, l.condominio_nome,
            l.dormitorios, l.suites, l.vagas
     FROM listings l JOIN monitored_sites s ON s.id = l.site_id
     WHERE l.url_original = $1`,
    [urlOriginal]
  );

  if (rows.length === 0) {
    console.error(`Nenhum listing encontrado com url_original = ${urlOriginal}`);
    await pool.end();
    process.exit(1);
  }

  const row = rows[0];
  const listing: ListingParaInvestigar = {
    listingId: row.id,
    siteId: row.site_id,
    siteNome: row.site_nome,
    codigoImovel: row.external_id,
    urlOriginal: row.url_original,
    urlFinal: row.url_final,
    titulo: row.titulo,
    descricao: row.descricao,
    bairro: row.bairro,
    areaUtil: row.area_util !== null ? Number(row.area_util) : null,
    preco: row.preco !== null ? Number(row.preco) : null,
    condominioNome: row.condominio_nome,
    dormitorios: row.dormitorios,
    suites: row.suites,
    vagas: row.vagas,
  };

  console.log("=== DADOS DO LISTING (lido do Neon, so leitura) ===");
  console.log(JSON.stringify(listing, null, 2));

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("\n=== EXTRAINDO PAGINA DE DETALHE ===");
  const detalhe = await extrairDetalhePagina(page, listing.urlFinal ?? listing.urlOriginal);
  console.log(`fotos encontradas: ${detalhe.fotos.length}`);
  detalhe.fotos.forEach((f, i) => console.log(`  foto ${i + 1}: categoria=${f.categoriaProvavel ?? "?"} url=${f.url}`));
  console.log(`condominio (texto extraido): ${detalhe.condominioValorTexto ?? "nao encontrado"}`);
  console.log(`iptu (texto extraido): ${detalhe.iptuValorTexto ?? "nao encontrado"}`);
  if (detalhe.erro) console.log(`erro na extracao: ${detalhe.erro}`);

  await page.close();
  await context.close();
  await browser.close();

  console.log("\n=== CONSULTAS DE PESQUISA EXTERNA GERADAS ===");
  const consultas = gerarConsultasBusca(listing, detalhe);
  consultas.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

  console.log("\n=== RESULTADOS DA PESQUISA EXTERNA (DuckDuckGo HTML) ===");
  const resultadosBusca = await buscarResultadosExternos(consultas);
  const evidencias = resultadosBusca.map((r) => extrairEvidenciaExterna(r, listing, detalhe));
  evidencias.forEach((ev, i) => {
    console.log(`\n--- fonte ${i + 1} ---`);
    console.log(`consulta: ${ev.resultado.consulta}`);
    console.log(`titulo: ${ev.resultado.titulo}`);
    console.log(`url: ${ev.resultado.url}`);
    console.log(`trecho: ${ev.resultado.trecho}`);
    console.log(`possivel condominio: ${ev.possivelCondominio ?? "-"}`);
    console.log(`possivel endereco: ${ev.possivelEndereco ?? "-"}`);
    console.log(`campos coincidentes: ${ev.camposCoincidentes.join(", ") || "-"}`);
  });

  console.log("\n=== PROMPT COMPLETO QUE SERIA ENVIADO AO GEMINI (nao enviado - so exibido) ===");
  console.log(montarPromptTexto(listing, detalhe, evidencias));

  console.log("\n(Este script NAO chamou a Gemini API e NAO gravou nada no Neon.)");

  await pool.end();
}

main().catch((err) => {
  console.error("falhou:", err instanceof Error ? err.message : err);
  process.exit(1);
});
