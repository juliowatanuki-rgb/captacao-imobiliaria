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

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: credenciais(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

/**
 * Reformatacao unica (nao roda no crawl.yml nem no sheets:sync normal) da
 * planilha ja publicada: move a coluna "primeira captura em" para ser a 1a,
 * aplica formato de data/moeda brasileiro, congela o cabecalho, ativa filtro
 * e oculta as colunas tecnicas de auditoria. Idempotente - todos os indices
 * sao recalculados a partir do cabecalho real da planilha (nunca hardcoded),
 * entao rodar de novo nao move/duplica nada que ja esteja no lugar certo.
 */
async function main() {
  const sheets = await getSheetsClient();
  const spreadsheetId = planilhaId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const aba = meta.data.sheets?.find((s) => s.properties?.title === ABA);
  if (!aba || aba.properties?.sheetId == null) throw new Error(`aba "${ABA}" nao encontrada`);
  const sheetId = aba.properties.sheetId;
  const localeAtual = meta.data.properties?.locale ?? null;

  const cabecalhoResp = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${ABA}!1:1` });
  const cabecalho = cabecalhoResp.data.values?.[0] ?? [];
  if (cabecalho.length === 0) throw new Error("planilha sem cabecalho - rode sheets:sync antes");

  const colunaAResp = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${ABA}!A:A` });
  const totalLinhasAntes = (colunaAResp.data.values?.length ?? 1) - 1; // menos o cabecalho

  const indiceDataAtual = cabecalho.indexOf("primeira captura em");
  if (indiceDataAtual === -1) throw new Error('coluna "primeira captura em" nao encontrada no cabecalho');

  // Simula o efeito do moveDimension no cabecalho (o mesmo rearranjo que a
  // API vai aplicar aos dados) para calcular os indices FINAIS de preco e das
  // colunas tecnicas, sem depender de nenhuma posicao fixa hardcoded.
  const cabecalhoFinal =
    indiceDataAtual === 0
      ? cabecalho
      : [cabecalho[indiceDataAtual], ...cabecalho.slice(0, indiceDataAtual), ...cabecalho.slice(indiceDataAtual + 1)];

  const indicePreco = cabecalhoFinal.indexOf("preco");
  const indiceListingId = cabecalhoFinal.indexOf("listing_id");
  const indiceSiteId = cabecalhoFinal.indexOf("site_id");
  const indiceIdentityKey = cabecalhoFinal.indexOf("identity_key");
  if (indicePreco === -1) throw new Error('coluna "preco" nao encontrada no cabecalho');
  if (indiceListingId === -1 || indiceSiteId === -1 || indiceIdentityKey === -1) {
    throw new Error("colunas tecnicas (listing_id/site_id/identity_key) nao encontradas no cabecalho");
  }
  if (indiceSiteId !== indiceListingId + 1 || indiceIdentityKey !== indiceListingId + 2) {
    throw new Error("listing_id/site_id/identity_key nao estao contiguas e na ordem esperada - abortando por seguranca");
  }

  const requests: any[] = [];

  if (indiceDataAtual !== 0) {
    requests.push({
      moveDimension: {
        source: { sheetId, dimension: "COLUMNS", startIndex: indiceDataAtual, endIndex: indiceDataAtual + 1 },
        destinationIndex: 0,
      },
    });
    console.log(`[reformatar] movendo coluna "primeira captura em" do indice ${indiceDataAtual} para 0`);
  } else {
    console.log('[reformatar] coluna "primeira captura em" ja esta na posicao 0 - nao precisa mover');
  }

  const localeDesejado = "pt_BR";
  if (localeAtual !== localeDesejado) {
    requests.push({
      updateSpreadsheetProperties: {
        properties: { locale: localeDesejado },
        fields: "locale",
      },
    });
    console.log(
      `[reformatar] locale da planilha: "${localeAtual}" -> "${localeDesejado}" (necessario para separador de milhar/decimal no padrao brasileiro)`
    );
  } else {
    console.log(`[reformatar] locale da planilha ja e "${localeDesejado}"`);
  }

  // Data (dd/mm/yyyy) - aplicado a partir da linha 2 SEM limite de linha final,
  // para qualquer linha futura acrescentada pelo sheets:sync ja nascer formatada.
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
      cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "dd/mm/yyyy" } } },
      fields: "userEnteredFormat.numberFormat",
    },
  });

  // Moeda brasileira na coluna de preco - mesma logica de linha aberta. Nao ha
  // hoje nenhuma outra coluna financeira numerica na planilha (condominio e o
  // NOME do condominio - texto - e nao existe coluna de IPTU no modelo atual).
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, startColumnIndex: indicePreco, endColumnIndex: indicePreco + 1 },
      cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: '"R$" #,##0.00' } } },
      fields: "userEnteredFormat.numberFormat",
    },
  });

  // Congela a 1a linha (cabecalho).
  requests.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
      fields: "gridProperties.frozenRowCount",
    },
  });

  // Filtro no cabecalho, cobrindo todas as colunas atuais.
  requests.push({
    setBasicFilter: {
      filter: {
        range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: cabecalhoFinal.length },
      },
    },
  });

  // Oculta as colunas tecnicas de auditoria (listing_id, site_id, identity_key).
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: indiceListingId, endIndex: indiceIdentityKey + 1 },
      properties: { hiddenByUser: true },
      fields: "hiddenByUser",
    },
  });

  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });

  const colunaAResp2 = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${ABA}!A:A` });
  const totalLinhasDepois = (colunaAResp2.data.values?.length ?? 1) - 1;

  const cabecalhoDepoisResp = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${ABA}!1:1` });
  const cabecalhoDepois = cabecalhoDepoisResp.data.values?.[0] ?? [];

  console.log(`[reformatar] linhas de dados antes: ${totalLinhasAntes}`);
  console.log(`[reformatar] linhas de dados depois: ${totalLinhasDepois}`);
  console.log(`[reformatar] nova ordem do cabecalho: ${JSON.stringify(cabecalhoDepois)}`);

  if (totalLinhasDepois !== totalLinhasAntes) {
    console.error("[reformatar] ALERTA: quantidade de linhas mudou - investigar antes de confiar no resultado");
    process.exitCode = 1;
  } else {
    console.log("[reformatar] concluido - quantidade de linhas preservada, sem duplicar nem apagar nenhuma");
  }
}

main().catch((err) => {
  console.error("[reformatar] erro:", err);
  process.exitCode = 1;
});
