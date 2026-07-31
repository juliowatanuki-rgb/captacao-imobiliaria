import { google } from "googleapis";

const ABA = "Anuncios";
const CABECALHO = [
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
  "primeira captura em",
  "status do anuncio",
  "status da analise",
  "condominio sugerido pela IA",
  "endereco sugerido pela IA",
  "bairro sugerido pela IA",
  "cidade sugerida pela IA",
  "status da investigacao IA",
  "confianca da IA (%)",
  "criterio de confirmacao da IA",
  "evidencias da IA",
  "divergencias da IA",
];

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
