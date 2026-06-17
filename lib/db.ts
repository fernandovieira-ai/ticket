import { Pool, PoolClient } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
  // 30s antes de descartar idle — Railway derruba TCP idle após ~30-60s,
  // então dar margem evita reutilizar conexões que já foram fechadas pelo proxy.
  idleTimeoutMillis: 30000,
  // 15s para obter conexão do pool — mais tolerante a picos de carga.
  connectionTimeoutMillis: 15000,
  keepAlive: true,
  // Envia primeiro keepalive probe após 10s de inatividade (antes do proxy do
  // Railway fechar a TCP connection silenciosamente).
  keepAliveInitialDelayMillis: 10000,
  allowExitOnIdle: false,
  // Limita qualquer query a 10s — evita spinner infinito na página
  options: "--statement_timeout=10000",
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
 *
 * IMPORTANTE: ao chamar client.release(err), o pg *destrói* a conexão
 * em vez de devolvê-la ao pool — evita reutilizar conexões mortas.
 *
 * O pool.connect() também é guardado: se a conexão cair antes de ser
 * entregue (Railway derruba TCP idle), o retry é acionado igualmente.
 */
async function withConnection<T>(
  fn: (client: PoolClient) => Promise<T>,
  attempt = 1,
): Promise<T> {
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (err) {
    if (isRetryable(err) && attempt <= 3) {
      await new Promise((r) => setTimeout(r, 300 * attempt));
      return withConnection(fn, attempt + 1);
    }
    throw err;
  }
  try {
    const result = await fn(client);
    client.release(); // conexão boa → devolve ao pool
    return result;
  } catch (err) {
    // Destrói a conexão problemática em vez de reciclá-la
    client.release(err instanceof Error ? err : new Error(String(err)));
    if (isRetryable(err) && attempt <= 3) {
      await new Promise((r) => setTimeout(r, 300 * attempt));
      return withConnection(fn, attempt + 1);
    }
    throw err;
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
