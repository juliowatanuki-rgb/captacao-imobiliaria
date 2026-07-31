import { google } from "googleapis";

const ABA = "Anuncios";

function credenciais() {
  const json = process.env.GOOGLE_SHEETS_CREDENTIALS_JSON;
  if (!json) throw new Error("GOOGLE_SHEETS_CREDENTIALS_JSON nao configurada");
  return JSON.parse(json);
}

function planilhaId(): string {
  const id = process.env.GOOGLE_SHEETS_ID;
  if (!id) throw new Error("GOOGLE_SHEETS_ID nao configurada");
  return id;
}

/**
 * Script de verificacao (nao roda no crawl.yml nem no sync normal): confere,
 * direto na planilha ja publicada, que a coluna listing_id (auditoria, ao
 * final da linha) nao tem nenhum valor duplicado e reporta o total de linhas
 * e de valores unicos. Usado para validar a 1a sincronizacao antes de
 * confirmar o resultado ao usuario.
 */
async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: credenciais(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = planilhaId();

  const cabecalho = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${ABA}!1:1` });
  const colunas = cabecalho.data.values?.[0] ?? [];
  const indiceListingId = colunas.indexOf("listing_id");
  if (indiceListingId === -1) throw new Error("coluna listing_id nao encontrada no cabecalho da aba");

  const letra = colunaLetra(indiceListingId);
  const resposta = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${ABA}!${letra}2:${letra}` });
  const valores = (resposta.data.values ?? []).map((l) => l[0]).filter((v) => typeof v === "string" && v.trim() !== "");

  const contagem = new Map<string, number>();
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  const duplicados = [...contagem.entries()].filter(([, n]) => n > 1);

  console.log(`[verificar] total de linhas com listing_id: ${valores.length}`);
  console.log(`[verificar] listing_id unicos: ${contagem.size}`);
  console.log(`[verificar] listing_id duplicados: ${duplicados.length}`);
  if (duplicados.length > 0) {
    console.log("[verificar] exemplos de duplicados:", duplicados.slice(0, 10));
    process.exitCode = 1;
  }

  const indiceReconstruido = colunas.indexOf("snapshot reconstruido (anuncio anterior a criacao do historico)");
  if (indiceReconstruido === -1) throw new Error("coluna 'snapshot reconstruido' nao encontrada no cabecalho da aba");
  const letraReconstruido = colunaLetra(indiceReconstruido);
  const respostaReconstruido = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${ABA}!${letraReconstruido}2:${letraReconstruido}`,
  });
  const valoresReconstruido = (respostaReconstruido.data.values ?? []).map((l) => l[0]);
  const sim = valoresReconstruido.filter((v) => v === "sim").length;
  const nao = valoresReconstruido.filter((v) => v === "nao").length;
  const outro = valoresReconstruido.length - sim - nao;
  console.log(`[verificar] snapshot reconstruido = "sim": ${sim}`);
  console.log(`[verificar] snapshot reconstruido = "nao": ${nao}`);
  if (outro > 0) {
    console.log(`[verificar] valores inesperados na coluna reconstruido: ${outro}`);
    process.exitCode = 1;
  }
}

function colunaLetra(indiceZeroBased: number): string {
  let n = indiceZeroBased + 1;
  let letra = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

main().catch((err) => {
  console.error("[verificar] erro:", err);
  process.exitCode = 1;
});
