import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "@captacao/db";
import { HttpError, requireAuth, withHandler } from "../../../src/lib/http.js";

interface NotesBody {
  observacoes?: string | null;
  condominioIdentificadoManual?: string | null;
  enderecoIdentificadoManual?: string | null;
}

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "PATCH") {
    throw new HttpError(405, "metodo nao permitido");
  }
  requireAuth(req);

  const { id } = req.query;
  if (typeof id !== "string") {
    throw new HttpError(400, "id invalido");
  }

  const body = (req.body ?? {}) as NotesBody;

  const result = await getPool().query(
    `UPDATE listings SET
      observacoes_corretora = COALESCE($2, observacoes_corretora),
      condominio_identificado_manual = COALESCE($3, condominio_identificado_manual),
      endereco_identificado_manual = COALESCE($4, endereco_identificado_manual)
     WHERE id = $1`,
    [
      id,
      body.observacoes ?? null,
      body.condominioIdentificadoManual ?? null,
      body.enderecoIdentificadoManual ?? null,
    ]
  );

  if (result.rowCount === 0) {
    throw new HttpError(404, "anuncio nao encontrado");
  }

  res.status(200).json({ ok: true });
});
