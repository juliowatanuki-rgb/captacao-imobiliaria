import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface SiteSeed {
  id: string;
  nome: string;
  urlBase: string;
  urlListagem: string;
  plataforma: string | null;
  ativo: boolean;
  isAgregador: boolean;
  observacoes: string | null;
}

async function main() {
  const path = join(__dirname, "..", "sites.seed.json");
  const sites: SiteSeed[] = JSON.parse(readFileSync(path, "utf8"));
  const pool = getPool();

  for (const site of sites) {
    await pool.query(
      `INSERT INTO monitored_sites
        (id, nome, url_base, url_listagem, plataforma, ativo, is_agregador, observacoes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
        nome = EXCLUDED.nome,
        url_base = EXCLUDED.url_base,
        url_listagem = EXCLUDED.url_listagem,
        plataforma = EXCLUDED.plataforma,
        ativo = EXCLUDED.ativo,
        is_agregador = EXCLUDED.is_agregador,
        observacoes = EXCLUDED.observacoes`,
      [
        site.id,
        site.nome,
        site.urlBase,
        site.urlListagem,
        site.plataforma,
        site.ativo,
        site.isAgregador,
        site.observacoes,
      ]
    );
    console.log(`[seed:sites] upsert: ${site.id}`);
  }

  await pool.end();
  console.log(`[seed:sites] concluido (${sites.length} sites)`);
}

main().catch((err) => {
  console.error("[seed:sites] falhou:", err);
  process.exit(1);
});
