import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "@captacao/db";
import { HttpError, requireAuth, withHandler } from "../../src/lib/http.js";

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    throw new HttpError(405, "metodo nao permitido");
  }
  requireAuth(req);

  const { rows } = await getPool().query(
    `SELECT id, nome, url_base, url_listagem, plataforma, ativo, is_agregador, observacoes
     FROM monitored_sites
     ORDER BY nome ASC`
  );

  res.status(200).json({ sites: rows });
});
