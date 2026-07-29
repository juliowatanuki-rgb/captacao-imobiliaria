import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../../../../packages/db/src/client.js";
import type { UserRole } from "@captacao/shared";
import { hashPassword } from "../../src/lib/auth.js";
import { HttpError, requireAuth, requireRole, withHandler } from "../../src/lib/http.js";

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const auth = requireAuth(req);
  requireRole(auth, "admin");

  if (req.method === "GET") {
    const { rows } = await getPool().query(
      `SELECT id, nome, email, telefone, role, ativo, criado_em
       FROM users
       ORDER BY nome ASC`
    );
    res.status(200).json({ users: rows });
    return;
  }

  if (req.method === "POST") {
    const { nome, email, telefone, role, senha } = (req.body ?? {}) as {
      nome?: string;
      email?: string;
      telefone?: string;
      role?: UserRole;
      senha?: string;
    };
    if (!nome || !email || !senha || (role !== "admin" && role !== "corretora")) {
      throw new HttpError(400, "nome, email, senha e role (admin|corretora) sao obrigatorios");
    }
    if (senha.length < 6) {
      throw new HttpError(400, "senha deve ter no minimo 6 caracteres");
    }

    const passwordHash = await hashPassword(senha);
    try {
      const { rows } = await getPool().query(
        `INSERT INTO users (email, password_hash, nome, telefone, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, nome, email, telefone, role, ativo, criado_em`,
        [email.toLowerCase().trim(), passwordHash, nome, telefone ?? null, role]
      );
      res.status(201).json({ user: rows[0] });
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
        throw new HttpError(409, "ja existe um usuario com esse email");
      }
      throw err;
    }
    return;
  }

  throw new HttpError(405, "metodo nao permitido");
});
