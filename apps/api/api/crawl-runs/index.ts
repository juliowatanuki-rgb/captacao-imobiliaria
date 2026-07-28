import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../../../../packages/db/src/client.js";
import { HttpError, requireAuth, withHandler } from "../../src/lib/http.js";

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    throw new HttpError(405, "metodo nao permitido");
  }
  requireAuth(req);

  const { rows } = await getPool().query(
    `SELECT id, inicio_em, fim_em, status,
      sites_previstos, sites_sucesso, sites_alerta, sites_erro,
      total_anuncios_encontrados, total_anuncios_novos, total_anuncios_atualizados
     FROM crawl_runs
     ORDER BY inicio_em DESC
     LIMIT 50`
  );

  res.status(200).json({ crawlRuns: rows });
});
