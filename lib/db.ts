import { Pool, PoolClient } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // Railway hobby suporta ~25 conexões; 10 deixa margem
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000, // aguarda mais em cold-starts do Railway
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  allowExitOnIdle: false, // mantém pool vivo entre requests em serverless
});

// Previne crash do processo em erros de pool (conexão perdida em background)
pool.on("error", (err) => {
  console.error("[db] Pool error:", err.message);
});

export default pool;

/** Erros transitórios que valem uma nova tentativa */
const RETRYABLE = [
  "Connection terminated unexpectedly",
  "Connection terminated due to connection timeout",
  "ECONNRESET",
  "ETIMEDOUT",
  "the database system is starting up",
  "too many connections",
];
function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return RETRYABLE.some((s) => msg.includes(s));
}

/**
 * Executa um callback que recebe um PoolClient.
 * Em caso de erro transitório, retenta até 3 vezes com backoff exponencial.
 */
async function withConnection<T>(
  fn: (client: PoolClient) => Promise<T>,
  attempt = 1,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } catch (err) {
    if (isRetryable(err) && attempt <= 3) {
      await new Promise((r) => setTimeout(r, 300 * attempt));
      return withConnection(fn, attempt + 1);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  return withConnection(async (client) => {
    const result = await client.query(sql, params);
    return result.rows as T[];
  });
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Executa múltiplas queries dentro de uma única transação,
 * reduzindo o número de checkouts no pool.
 */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withConnection(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}
