export interface ListingRow {
  id: string; // listing_id (uuid) - vem do snapshot, e o identificador de auditoria/dedup
  site_id: string;
  identity_key: string;
  external_id: string | null;
  site_nome: string;
  // Campos historicos: todos lidos de listing_first_snapshot (imutavel desde
  // a 1a captura) - nunca de `listings` (mutavel), para nenhuma atualizacao
  // posterior de preco/status/descricao/etc alterar o que ja foi exportado.
  titulo: string | null;
  tipo_imovel: string | null;
  bairro: string | null;
  preco: string | null;
  area_util: string | null;
  dormitorios: number | null;
  suites: number | null;
  vagas: number | null;
  condominio_nome: string | null;
  endereco: string | null;
  url_original: string;
  primeira_captura_em: string;
  status_primeira_captura: string;
  reconstruido: boolean;
  // Campos informativos: lidos de `listings`/`listing_investigations` no
  // momento da exportacao (podem ja divergir do que era verdade na 1a
  // captura) - a linha, uma vez gravada na planilha, nunca e reescrita, entao
  // isso e apenas uma foto do estado no instante da exportacao.
  status_atual: string;
  analysis_status: string;
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

export function idCurto(l: ListingRow): string {
  if (l.external_id && l.external_id.trim() !== "") return l.external_id.trim();
  return l.id.slice(0, 8);
}

export function paraNumero(valor: string | number | null): number | "" {
  if (valor === null || valor === "") return "";
  const numero = Number(valor);
  return Number.isNaN(numero) ? "" : numero;
}

export function paraDataIso(valor: string): string {
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor : data.toISOString().slice(0, 10);
}

export function paraLinha(l: ListingRow): (string | number)[] {
  return [
    paraDataIso(l.primeira_captura_em),
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
    l.condominio_nome ?? "",
    l.endereco ?? "",
    l.url_original,
    l.status_primeira_captura,
    l.status_atual,
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
    l.reconstruido ? "sim" : "nao",
    l.id,
    l.site_id,
    l.identity_key,
  ];
}

export const SELECT_PENDENTES = `
  SELECT
    fs.listing_id AS id, fs.site_id, fs.identity_key, fs.external_id, fs.site_nome,
    fs.titulo, fs.tipo_imovel, fs.bairro, fs.preco, fs.area_util,
    fs.dormitorios, fs.suites, fs.vagas,
    fs.condominio_nome, fs.endereco, fs.url_original,
    fs.primeira_captura_em, fs.status_primeira_captura, fs.reconstruido,
    l.status AS status_atual, l.analysis_status,
    i.condominio AS ia_condominio, i.endereco AS ia_endereco,
    i.bairro AS ia_bairro, i.cidade AS ia_cidade,
    i.confianca AS ia_confianca, i.status AS ia_status,
    i.evidencias AS ia_evidencias, i.divergencias AS ia_divergencias,
    i.criterio_confirmacao AS ia_criterio_confirmacao
   FROM listing_first_snapshot fs
   JOIN listings l ON l.id = fs.listing_id
   LEFT JOIN LATERAL (
     SELECT condominio, endereco, bairro, cidade, confianca, status,
            evidencias, divergencias, criterio_confirmacao
     FROM listing_investigations li
     WHERE li.listing_id = fs.listing_id AND li.status <> 'erro'
     ORDER BY li.criado_em DESC
     LIMIT 1
   ) i ON true
   WHERE l.sheets_exportado_em IS NULL
   ORDER BY fs.primeira_captura_em ASC
   LIMIT $1
`;

export interface PoolLike {
  query<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }>;
}

export interface SincronizarDeps {
  pool: PoolLike;
  garantirCabecalho: () => Promise<void>;
  listarListingIdsExistentes: () => Promise<Set<string>>;
  acrescentarLinhas: (linhas: (string | number)[][]) => Promise<void>;
  tamanhoLote?: number;
  log?: (mensagem: string) => void;
}

export interface SincronizarResultado {
  totalExportado: number;
  totalReconciliado: number;
}

/**
 * Loop principal da exportacao continua para o Google Sheets (secao "Google
 * Sheets" do README). Isolado de getPool()/googleapis (injetados via `deps`)
 * para ser testavel sem depender do Neon nem da API do Google.
 *
 * Garantias:
 *  - So le campos historicos de listing_first_snapshot (imutavel) - nunca de
 *    `listings` (mutavel) - regras 2 e 3.
 *  - So considera pendente quem tem sheets_exportado_em NULL - regras 1, 4, 6 e 7.
 *  - Antes de enviar, exclui do lote qualquer listing_id ja presente na
 *    planilha (lido uma vez no inicio da execucao) - isso e o que torna a
 *    sincronizacao a prova de uma falha entre o append() e o UPDATE que marca
 *    sheets_exportado_em: a proxima execucao reconhece a linha como ja
 *    gravada e so reconcilia o Neon, sem duplicar - regra 8.
 */
export async function sincronizarPlanilha(deps: SincronizarDeps): Promise<SincronizarResultado> {
  const { pool, garantirCabecalho, listarListingIdsExistentes, acrescentarLinhas } = deps;
  const tamanhoLote = deps.tamanhoLote ?? 500;
  const log = deps.log ?? (() => {});

  await garantirCabecalho();
  const idsJaNaPlanilha = await listarListingIdsExistentes();

  let totalExportado = 0;
  let totalReconciliado = 0;

  for (;;) {
    const { rows: candidatos } = await pool.query<ListingRow>(SELECT_PENDENTES, [tamanhoLote]);
    if (candidatos.length === 0) break;

    const aExportar = candidatos.filter((r) => !idsJaNaPlanilha.has(r.id));
    const jaPresentes = candidatos.filter((r) => idsJaNaPlanilha.has(r.id));

    if (aExportar.length > 0) {
      const linhas = aExportar.map(paraLinha);
      await acrescentarLinhas(linhas);
      for (const r of aExportar) idsJaNaPlanilha.add(r.id);
    }

    const idsDoLote = candidatos.map((r) => r.id);
    await pool.query("UPDATE listings SET sheets_exportado_em = now() WHERE id = ANY($1::uuid[])", [idsDoLote]);

    totalExportado += aExportar.length;
    totalReconciliado += jaPresentes.length;
    log(
      `[sheets-sync] lote: ${aExportar.length} nova(s) na planilha, ${jaPresentes.length} ja presente(s) (reconciliadas) - total exportado: ${totalExportado}`
    );

    if (candidatos.length < tamanhoLote) break;
  }

  return { totalExportado, totalReconciliado };
}
