import type pg from "pg";

const LOCK_NAME = "captacao-imobiliaria:crawl";

export interface CrawlLock {
  release(): Promise<void>;
}

/**
 * Garante que apenas uma coleta (diaria ou manual) altere o Neon por vez.
 * O advisory lock fica preso na mesma conexao ate release(), por isso o
 * client nao deve ser devolvido ao pool antes da liberacao.
 */
export async function tryAcquireCrawlLock(pool: pg.Pool): Promise<CrawlLock | null> {
  const client = await pool.connect();
  try {
    const result = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
      [LOCK_NAME]
    );

    if (!result.rows[0]?.acquired) {
      client.release();
      return null;
    }

    let released = false;
    return {
      async release() {
        if (released) return;
        released = true;
        try {
          await client.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_NAME]);
        } finally {
          client.release();
        }
      },
    };
  } catch (error) {
    client.release();
    throw error;
  }
}
