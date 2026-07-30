import type pg from "pg";
import type { ListingParaInvestigar } from "./types.js";

/**
 * Seleciona ate `limite` anuncios novos (analysis_status = 'pendente',
 * status = 'ativo' - mesmo criterio de apps/api/api/listings/new.ts) que
 * ainda nao tem nenhuma investigacao registrada, dos mais recentes para os
 * mais antigos (regra 4: fila de investigacao).
 */
export async function selecionarFilaDeInvestigacao(
  pool: pg.Pool,
  limite: number
): Promise<ListingParaInvestigar[]> {
  const { rows } = await pool.query<{
    listing_id: string;
    site_id: string;
    site_nome: string;
    codigo_imovel: string | null;
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
    `SELECT
      l.id AS listing_id, l.site_id, s.nome AS site_nome, l.external_id AS codigo_imovel,
      l.url_original, l.url_final, l.titulo, l.descricao, l.bairro,
      l.area_util, l.preco, l.condominio_nome, l.dormitorios, l.suites, l.vagas
     FROM listings l
     JOIN monitored_sites s ON s.id = l.site_id
     WHERE l.analysis_status = 'pendente'
       AND l.status = 'ativo'
       AND NOT EXISTS (
         SELECT 1 FROM listing_investigations i WHERE i.listing_id = l.id
       )
     ORDER BY l.primeira_captura_em DESC
     LIMIT $1`,
    [limite]
  );

  return rows.map((row) => ({
    listingId: row.listing_id,
    siteId: row.site_id,
    siteNome: row.site_nome,
    codigoImovel: row.codigo_imovel,
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
  }));
}
