import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../../../../packages/db/src/client.js";
import { signToken, verifyPassword } from "../../src/lib/auth.js";
import { HttpError, withHandler } from "../../src/lib/http.js";

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  nome: string;
  role: "admin" | "corretora";
  ativo: boolean;
}

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "POST") {
    throw new HttpError(405, "metodo nao permitido");
  }

  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  if (!email || !password) {
    throw new HttpError(400, "email e senha sao obrigatorios");
  }

  const pool = getPool();
  const { rows } = await pool.query<UserRow>(
    `SELECT id, email, password_hash, nome, role, ativo FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );

  const user = rows[0];
  if (!user) {
    throw new HttpError(401, "credenciais invalidas");
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    throw new HttpError(401, "credenciais invalidas");
  }

  if (!user.ativo) {
    throw new HttpError(403, "usuario desativado - fale com o administrador");
  }

  const token = signToken({
    sub: user.id,
    email: user.email,
    nome: user.nome,
    role: user.role,
  });

  res.status(200).json({
    token,
    user: { id: user.id, email: user.email, nome: user.nome, role: user.role },
  });
});
