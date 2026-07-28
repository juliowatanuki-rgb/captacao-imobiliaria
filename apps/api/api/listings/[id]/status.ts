import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "@captacao/db";
import type { AnalysisStatus, ListingEventType } from "@captacao/shared";
import { HttpError, requireAuth, withHandler } from "../../../src/lib/http.js";

const STATUS_TO_EVENT: Record<Exclude<AnalysisStatus, "pendente">, ListingEventType> = {
  analisado: "marked_analyzed",
  descartado: "marked_discarded",
  selecionado_para_captacao: "marked_selected_for_capture",
};

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "PATCH") {
    throw new HttpError(405, "metodo nao permitido");
  }
  const user = requireAuth(req);

  const { id } = req.query;
  if (typeof id !== "string") {
    throw new HttpError(400, "id invalido");
  }

  const { status } = (req.body ?? {}) as { status?: string };
  if (!status || !(status in STATUS_TO_EVENT)) {
    throw new HttpError(400, "status invalido. use: analisado, descartado ou selecionado_para_captacao");
  }
  const analysisStatus = status as Exclude<AnalysisStatus, "pendente">;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updateResult = await client.query(
      `UPDATE listings SET analysis_status = $2 WHERE id = $1`,
      [id, analysisStatus]
    );
    if (updateResult.rowCount === 0) {
      throw new HttpError(404, "anuncio nao encontrado");
    }
    await client.query(
      `INSERT INTO listing_events (listing_id, tipo, criado_por) VALUES ($1, $2, $3)`,
      [id, STATUS_TO_EVENT[analysisStatus], user.sub]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  res.status(200).json({ ok: true });
});
