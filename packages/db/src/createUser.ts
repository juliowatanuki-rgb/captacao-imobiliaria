import bcrypt from "bcryptjs";
import { getPool } from "./client.js";

/** Uso: npm run create:user -w @captacao/db -- <email> <senha> <nome> <admin|corretora> */
async function main() {
  const [email, password, nome, role] = process.argv.slice(2);
  if (!email || !password || !nome || (role !== "admin" && role !== "corretora")) {
    console.error("Uso: create:user <email> <senha> <nome> <admin|corretora>");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const pool = getPool();

  await pool.query(
    `INSERT INTO users (email, password_hash, nome, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, nome = EXCLUDED.nome, role = EXCLUDED.role`,
    [email.toLowerCase().trim(), passwordHash, nome, role]
  );

  await pool.end();
  console.log(`[create:user] usuario ${email} (${role}) criado/atualizado`);
}

main().catch((err) => {
  console.error("[create:user] falhou:", err);
  process.exit(1);
});
