import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "@captacao/db";
import { HttpError, requireAuth, withHandler } from "../../src/lib/http.js";

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    throw new HttpError(405, "metodo nao permitido");
  }
  requireAuth(req);

  const { id } = req.query;
  if (typeof id !== "string") {
    throw new HttpError(400, "id invalido");
  }

  const pool = getPool();
  const { rows: crawlRunRows } = await pool.query(
    `SELECT id, inicio_em, fim_em, status,
      sites_previstos, sites_sucesso, sites_alerta, sites_erro,
      total_anuncios_encontrados, total_anuncios_novos, total_anuncios_atualizados, mensagem
     FROM crawl_runs WHERE id = $1`,
    [id]
  );
  const crawlRun = crawlRunRows[0];
  if (!crawlRun) {
    throw new HttpError(404, "execucao nao encontrada");
  }

  const { rows: siteRuns } = await pool.query(
    `SELECT scr.id, scr.site_id, s.nome AS site_nome, scr.inicio_em, scr.fim_em, scr.status,
      scr.paginas_visitadas, scr.anuncios_encontrados, scr.anuncios_novos,
      scr.anuncios_existentes, scr.anuncios_atualizados, scr.anuncios_ausentes,
      scr.mensagem_erro, scr.detalhe_tecnico
     FROM site_crawl_runs scr
     JOIN monitored_sites s ON s.id = scr.site_id
     WHERE scr.crawl_run_id = $1
     ORDER BY scr.inicio_em ASC`,
    [id]
  );

  res.status(200).json({ crawlRun, siteRuns });
});
