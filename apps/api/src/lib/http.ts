import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { UserRole } from "@captacao/shared";
import { verifyToken, type JwtPayload } from "./auth.js";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function applyCors(res: VercelResponse) {
  const origin = process.env.WEB_ORIGIN ?? "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

/** Envolve um handler de rota com CORS, tratamento de erros e metodo OPTIONS. */
export function withHandler(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    applyCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error("[api] erro nao tratado:", err);
      res.status(500).json({ error: "erro interno" });
    }
  };
}

/** Extrai e valida o JWT do header Authorization. Lanca HttpError 401 se ausente/invalido. */
export function requireAuth(req: VercelRequest): JwtPayload {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new HttpError(401, "token ausente");
  }
  const token = header.slice("Bearer ".length);
  try {
    return verifyToken(token);
  } catch {
    throw new HttpError(401, "token invalido ou expirado");
  }
}

export function requireRole(payload: JwtPayload, ...roles: UserRole[]): void {
  if (!roles.includes(payload.role)) {
    throw new HttpError(403, "acesso nao autorizado para este perfil");
  }
}
