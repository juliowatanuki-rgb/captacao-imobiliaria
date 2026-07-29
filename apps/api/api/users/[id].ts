import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../../../../packages/db/src/client.js";
import type { UserRole } from "@captacao/shared";
import { hashPassword } from "../../src/lib/auth.js";
import { HttpError, requireAuth, requireRole, withHandler } from "../../src/lib/http.js";

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "PATCH") {
    throw new HttpError(405, "metodo nao permitido");
  }
  const auth = requireAuth(req);
  requireRole(auth, "admin");

  const { id } = req.query;
  if (typeof id !== "string") {
    throw new HttpError(400, "id invalido");
  }

  const { nome, email, telefone, role, ativo, senha } = (req.body ?? {}) as {
    nome?: string;
    email?: string;
    telefone?: string | null;
    role?: UserRole;
    ativo?: boolean;
    senha?: string;
  };

  if (role !== undefined && role !== "admin" && role !== "corretora") {
    throw new HttpError(400, "role invalido - use admin ou corretora");
  }
  if (senha !== undefined && senha.length < 6) {
    throw new HttpError(400, "senha deve ter no minimo 6 caracteres");
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  function addSet(coluna: string, valor: unknown) {
    values.push(valor);
    sets.push(`${coluna} = $${values.length}`);
  }

  if (nome !== undefined) addSet("nome", nome);
  if (email !== undefined) addSet("email", email.toLowerCase().trim());
  if (telefone !== undefined) addSet("telefone", telefone);
  if (role !== undefined) addSet("role", role);
  if (ativo !== undefined) addSet("ativo", ativo);
  if (senha !== undefined) addSet("password_hash", await hashPassword(senha));

  if (sets.length === 0) {
    throw new HttpError(400, "nenhum campo para atualizar");
  }

  values.push(id);
  try {
    const { rows } = await getPool().query(
      `UPDATE users SET ${sets.join(", ")} WHERE id = $${values.length}
       RETURNING id, nome, email, telefone, role, ativo, criado_em`,
      values
    );
    if (rows.length === 0) {
      throw new HttpError(404, "usuario nao encontrado");
    }
    res.status(200).json({ user: rows[0] });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
      throw new HttpError(409, "ja existe um usuario com esse email");
    }
    throw err;
  }
});
