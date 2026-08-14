import type pg from "pg";

const LOCK_NAME = "captacao-imobiliaria:crawl";

export interface CrawlLock {
  release(): Promise<void>;
  isHealthy(): boolean;
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
    let healthy = true;
    const heartbeat = setInterval(() => {
      client.query("SELECT 1").catch(() => {
        healthy = false;
      });
    }, 20_000);
    heartbeat.unref?.();
    client.on("error", () => {
      healthy = false;
    });
    return {
      isHealthy() {
        return healthy && !released;
      },
      async release() {
        if (released) return;
        released = true;
        clearInterval(heartbeat);
        try {
          await client.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_NAME]);
        } catch {
          // Se a conexao ja caiu, o Postgres liberou o advisory lock ao
          // encerrar a sessao.
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
