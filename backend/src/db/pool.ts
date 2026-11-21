import pg from "pg";
import { env } from "../config/env.js";

// NUMERIC (1700) y BIGINT (20) llegan como string por defecto; los queremos como number.
pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  console.error("[lumen] Error inesperado en el pool de PostgreSQL:", err.message);
});

export type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

/** Ejecuta una consulta y devuelve las filas tipadas. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  db: Queryable = pool
): Promise<T[]> {
  const result = await db.query<T>(sql, params);
  return result.rows;
}

/** Devuelve la primera fila o null. */
export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  db: Queryable = pool
): Promise<T | null> {
  const rows = await query<T>(sql, params, db);
  return rows[0] ?? null;
}

/** Ejecuta `fn` dentro de una transacción (commit si resuelve, rollback si lanza). */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
