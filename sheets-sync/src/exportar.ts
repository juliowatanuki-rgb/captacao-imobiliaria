import { getPool } from "@captacao/db";
import { acrescentarLinhas, garantirCabecalho } from "./sheetsClient.js";

const TAMANHO_LOTE = 500;

interface ListingRow {
  id: string;
  external_id: string | null;
  titulo: string | null;
  bairro: string | null;
  preco: string | null;
  url_original: string;
  url_final: string | null;
  tipo_imovel: string | null;
  condominio_nome: string | null;
  endereco: string | null;
  area_util: string | null;
  dormitorios: number | null;
  suites: number | null;
  vagas: number | null;
  condominio_identificado_manual: string | null;
  endereco_identificado_manual: string | null;
  primeira_captura_em: string;
  analysis_status: string;
  status: string;
  site_nome: string;
  ia_condominio: string | null;
  ia_endereco: string | null;
  ia_bairro: string | null;
  ia_cidade: string | null;
  ia_confianca: number | null;
  ia_status: string | null;
  ia_evidencias: string[] | null;
  ia_divergencias: string[] | null;
  ia_criterio_confirmacao: string | null;
}

function idCurto(l: ListingRow): string {
  if (l.external_id && l.external_id.trim() !== "") return l.external_id.trim();
  return l.id.slice(0, 8);
}

function paraNumero(valor: string | number | null): number | "" {
  if (valor === null || valor === "") return "";
  const numero = Number(valor);
  return Number.isNaN(numero) ? "" : numero;
}

function paraDataIso(valor: string): string {
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor : data.toISOString().slice(0, 10);
}

function paraLinha(l: ListingRow): (string | number)[] {
  return [
    idCurto(l),
    l.site_nome,
    l.titulo ?? "",
    l.tipo_imovel ?? "",
    l.bairro ?? "",
    paraNumero(l.preco),
    paraNumero(l.area_util),
    paraNumero(l.dormitorios),
    paraNumero(l.suites),
    paraNumero(l.vagas),
    l.condominio_identificado_manual ?? l.condominio_nome ?? "",
    l.endereco_identificado_manual ?? l.endereco ?? "",
    l.url_final ?? l.url_original,
    paraDataIso(l.primeira_captura_em),
    l.status,
    l.analysis_status,
    l.ia_condominio ?? "",
    l.ia_endereco ?? "",
    l.ia_bairro ?? "",
    l.ia_cidade ?? "",
    l.ia_status ?? "",
    paraNumero(l.ia_confianca),
    l.ia_criterio_confirmacao ?? "",
    (l.ia_evidencias ?? []).join(" | "),
    (l.ia_divergencias ?? []).join(" | "),
  ];
}

async function main() {
  await garantirCabecalho();
  const pool = getPool();
  let totalExportado = 0;

  for (;;) {
    const { rows } = await pool.query<ListingRow>(
      `SELECT
        l.id, l.external_id, l.titulo, l.bairro, l.preco, l.url_original, l.url_final,
        l.tipo_imovel, l.condominio_nome, l.endereco,
        l.area_util, l.dormitorios, l.suites, l.vagas,
        l.condominio_identificado_manual, l.endereco_identificado_manual,
        l.primeira_captura_em, l.analysis_status, l.status,
        s.nome AS site_nome,
        i.condominio AS ia_condominio, i.endereco AS ia_endereco,
        i.bairro AS ia_bairro, i.cidade AS ia_cidade,
        i.confianca AS ia_confianca, i.status AS ia_status,
        i.evidencias AS ia_evidencias, i.divergencias AS ia_divergencias,
        i.criterio_confirmacao AS ia_criterio_confirmacao
       FROM listings l
       JOIN monitored_sites s ON s.id = l.site_id
       LEFT JOIN LATERAL (
         SELECT condominio, endereco, bairro, cidade, confianca, status,
                evidencias, divergencias, criterio_confirmacao
         FROM listing_investigations li
         WHERE li.listing_id = l.id AND li.status <> 'erro'
         ORDER BY li.criado_em DESC
         LIMIT 1
       ) i ON true
       WHERE l.sheets_exportado_em IS NULL
       ORDER BY l.primeira_captura_em ASC
       LIMIT $1`,
      [TAMANHO_LOTE]
    );

    if (rows.length === 0) break;

    const linhas = rows.map(paraLinha);
    await acrescentarLinhas(linhas);

    const ids = rows.map((r) => r.id);
    await pool.query("UPDATE listings SET sheets_exportado_em = now() WHERE id = ANY($1::uuid[])", [ids]);

    totalExportado += rows.length;
    console.log(`[sheets-sync] exportadas ${rows.length} linhas (total: ${totalExportado})`);

    if (rows.length < TAMANHO_LOTE) break;
  }

  console.log(`[sheets-sync] concluido - ${totalExportado} anuncio(s) novo(s) na planilha`);
  await pool.end();
}

main().catch((err) => {
  console.error("[sheets-sync] erro:", err);
  process.exitCode = 1;
});
