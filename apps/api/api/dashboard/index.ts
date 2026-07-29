import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../../../../packages/db/src/client.js";
import { HttpError, requireAuth, withHandler } from "../../src/lib/http.js";

const DIA_EM_MS = 24 * 60 * 60 * 1000;

function parseDateParam(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    throw new HttpError(405, "metodo nao permitido");
  }
  requireAuth(req);

  const agora = new Date();
  const to = parseDateParam(req.query.to) ?? agora;
  const from = parseDateParam(req.query.from) ?? new Date(to.getTime() - 30 * DIA_EM_MS);

  const [ultimaSincronizacaoResult, sitesResult, captacaoPorDiaResult, rankingResult] =
    await Promise.all([
      getPool().query(
        `SELECT id, inicio_em, fim_em, status
         FROM crawl_runs
         ORDER BY inicio_em DESC
         LIMIT 1`
      ),
      getPool().query(
        `SELECT ms.id AS site_id, ms.nome AS site_nome, scr.status, scr.fim_em, scr.mensagem_erro
         FROM monitored_sites ms
         LEFT JOIN LATERAL (
           SELECT status, fim_em, mensagem_erro
           FROM site_crawl_runs
           WHERE site_id = ms.id
           ORDER BY inicio_em DESC
           LIMIT 1
         ) scr ON true
         WHERE ms.ativo = true
         ORDER BY ms.nome ASC`
      ),
      getPool().query(
        `SELECT date_trunc('day', primeira_captura_em)::date AS dia, COUNT(*)::int AS total
         FROM listings
         WHERE primeira_captura_em >= $1 AND primeira_captura_em < $2
         GROUP BY 1
         ORDER BY 1`,
        [from, to]
      ),
      getPool().query(
        `SELECT ms.nome AS site_nome, COUNT(l.id)::int AS total
         FROM listings l
         JOIN monitored_sites ms ON ms.id = l.site_id
         WHERE l.primeira_captura_em >= $1 AND l.primeira_captura_em < $2
         GROUP BY ms.nome
         ORDER BY total DESC
         LIMIT 10`,
        [from, to]
      ),
    ]);

  res.status(200).json({
    ultimaSincronizacao: ultimaSincronizacaoResult.rows[0] ?? null,
    sites: sitesResult.rows,
    captacaoPorDia: captacaoPorDiaResult.rows,
    ranking: rankingResult.rows,
  });
});
