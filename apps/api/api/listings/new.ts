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
      l.id, l.titulo, l.bairro, l.preco, l.url_original, l.url_final,
      l.tipo_imovel, l.condominio_nome, l.endereco,
      l.primeira_captura_em, l.analysis_status,
      s.id AS site_id, s.nome AS site_nome
     FROM listings l
     JOIN monitored_sites s ON s.id = l.site_id
     WHERE l.analysis_status = 'pendente' AND l.status = 'ativo'
     ORDER BY l.primeira_captura_em DESC`
  );

  res.status(200).json({ listings: rows });
});
