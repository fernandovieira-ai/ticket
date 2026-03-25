import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // mais conexões simultâneas (Railway suporta)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000, // falha rápido se o DB estiver inacessível
  keepAlive: true, // mantém conexão TCP ativa — evita reconexões lentas
  keepAliveInitialDelayMillis: 10000,
});

export default pool;

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
