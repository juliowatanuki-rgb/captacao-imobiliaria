import type { VercelRequest, VercelResponse } from "@vercel/node";
import { HttpError, requireAuth, requireRole, withHandler } from "../../src/lib/http.js";

// Repositorio fixo (sistema de uso interno, nao multi-tenant) - so o token
// de acesso e segredo (GITHUB_DISPATCH_TOKEN), configurado nas env vars do
// projeto na Vercel.
const GITHUB_OWNER = "juliowatanuki-rgb";
const GITHUB_REPO = "captacao-imobiliaria";
const WORKFLOW_FILE = "crawl.yml";
const GITHUB_REF = "master";

/**
 * Botao "Sincronizar agora" do painel (secao "performance/confiabilidade" -
 * auditoria de 2026-08-05): dispara o workflow_dispatch do crawl.yml no
 * GitHub Actions, que roda os crawlers de verdade (Playwright, ~40 sites) -
 * inviavel de rodar direto numa function serverless da Vercel (timeout
 * curto demais para uma coleta que leva dezenas de minutos). So admin pode
 * disparar, pra nao gerar coletas duplicadas/concorrentes por engano.
 */
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "POST") {
    throw new HttpError(405, "metodo nao permitido");
  }
  const auth = requireAuth(req);
  requireRole(auth, "admin");

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    throw new HttpError(500, "GITHUB_DISPATCH_TOKEN nao configurado no servidor - ver README secao 'Sincronizacao manual'");
  }

  const resposta = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: GITHUB_REF }),
    }
  );

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new HttpError(502, `GitHub recusou o disparo (HTTP ${resposta.status}): ${corpo.slice(0, 300)}`);
  }

  res.status(202).json({ disparado: true });
});
