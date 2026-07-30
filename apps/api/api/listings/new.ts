import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../../../../packages/db/src/client.js";
import { HttpError, requireAuth, withHandler } from "../../src/lib/http.js";

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    throw new HttpError(405, "metodo nao permitido");
  }
  requireAuth(req);

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
      l.id, l.external_id, l.titulo, l.bairro, l.preco, l.url_original, l.url_final,
      l.tipo_imovel, l.condominio_nome, l.endereco,
      l.area_util, l.dormitorios, l.suites, l.vagas,
      l.condominio_identificado_manual, l.endereco_identificado_manual,
      l.primeira_captura_em, l.analysis_status,
      s.id AS site_id, s.nome AS site_nome,
      i.condominio AS ia_condominio, i.endereco AS ia_endereco,
      i.bairro AS ia_bairro, i.cidade AS ia_cidade,
      i.confianca AS ia_confianca, i.status AS ia_status,
      i.evidencias AS ia_evidencias, i.divergencias AS ia_divergencias,
      i.criterio_confirmacao AS ia_criterio_confirmacao, i.criado_em AS ia_criado_em
     FROM listings l
     JOIN monitored_sites s ON s.id = l.site_id
     LEFT JOIN LATERAL (
       SELECT condominio, endereco, bairro, cidade, confianca, status,
              evidencias, divergencias, criterio_confirmacao, criado_em
       FROM listing_investigations li
       WHERE li.listing_id = l.id AND li.status <> 'erro'
       ORDER BY li.criado_em DESC
       LIMIT 1
     ) i ON true
     WHERE l.analysis_status = 'pendente' AND l.status = 'ativo'
     ORDER BY l.primeira_captura_em DESC`
  );

  res.status(200).json({ listings: rows });
});
