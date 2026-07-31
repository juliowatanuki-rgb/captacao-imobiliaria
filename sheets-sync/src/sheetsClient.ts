import { google } from "googleapis";

const ABA = "Anuncios";

// Colunas historicas (do snapshot imutavel da 1a captura) + informativas (do
// momento da exportacao) + auditoria (listing_id/site_id/identity_key, ao
// final - podem ficar ocultas na planilha, mas nunca removidas: sao o que
// permite provar sem ambiguidade que uma linha nunca foi duplicada).
const CABECALHO = [
  "primeira captura em",
  "id",
  "imobiliaria",
  "titulo",
  "tipo de imovel",
  "bairro",
  "preco",
  "metragem (m2)",
  "dormitorios",
  "suites",
  "vagas",
  "condominio",
  "endereco",
  "link",
  "status na 1a captura",
  "status atual (no momento da exportacao)",
  "status da analise (no momento da exportacao)",
  "condominio sugerido pela IA",
  "endereco sugerido pela IA",
  "bairro sugerido pela IA",
  "cidade sugerida pela IA",
  "status da investigacao IA",
  "confianca da IA (%)",
  "criterio de confirmacao da IA",
  "evidencias da IA",
  "divergencias da IA",
  "snapshot reconstruido (anuncio anterior a criacao do historico)",
  "listing_id",
  "site_id",
  "identity_key",
];

// Coluna A e sempre o "id" curto (visivel para a corretora); a auditoria
// confiavel para dedup e a coluna listing_id (uuid), que fica no fim da linha.
const INDICE_COLUNA_LISTING_ID = CABECALHO.indexOf("listing_id");

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

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: credenciais(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

/** Garante que a aba exista e tenha o cabecalho na primeira linha - so escreve o cabecalho se a aba estiver vazia (nunca sobrescreve dados). */
export async function garantirCabecalho(): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = planilhaId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existe = meta.data.sheets?.some((s) => s.properties?.title === ABA);
  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: ABA } } }] },
    });
  }

  const primeiraLinha = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${ABA}!A1:A1`,
  });
  if (!primeiraLinha.data.values || primeiraLinha.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${ABA}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [CABECALHO] },
    });
  }
}

/**
 * Le a planilha inteira e retorna o conjunto de listing_id ja presentes
 * (coluna de auditoria no fim da linha - ver CABECALHO). Isso e o que torna a
 * sincronizacao a prova de falha parcial: se o processo cair depois do
 * append() e antes do UPDATE que marca sheets_exportado_em no Neon, a proxima
 * execucao volta a selecionar essas mesmas linhas do banco, mas este conjunto
 * as reconhece como ja gravadas e evita duplicar na planilha.
 */
export async function listarListingIdsExistentes(): Promise<Set<string>> {
  const sheets = await getSheetsClient();
  const spreadsheetId = planilhaId();

  const coluna = colunaLetra(INDICE_COLUNA_LISTING_ID);
  const resposta = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${ABA}!${coluna}2:${coluna}`,
  });

  const valores = resposta.data.values ?? [];
  const ids = new Set<string>();
  for (const linha of valores) {
    const valor = linha[0];
    if (typeof valor === "string" && valor.trim() !== "") ids.add(valor.trim());
  }
  return ids;
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

/** Acrescenta linhas ao final da aba - nunca apaga nem reescreve linhas existentes. */
export async function acrescentarLinhas(linhas: (string | number)[][]): Promise<void> {
  if (linhas.length === 0) return;
  const sheets = await getSheetsClient();
  const spreadsheetId = planilhaId();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${ABA}!A:A`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: linhas },
  });
}

export const _internal = { CABECALHO, INDICE_COLUNA_LISTING_ID, colunaLetra };
