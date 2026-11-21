/**
 * Crea la base de datos (si no existe) y aplica database/schema.sql.
 * Es idempotente: puedes correrlo las veces que quieras.
 *   npm run db:init
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { env } from "../src/config/env.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, "../../database/schema.sql");

async function main() {
  const target = new URL(env.DATABASE_URL);
  const dbName = decodeURIComponent(target.pathname.replace(/^\//, ""));
  if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
    throw new Error(`Nombre de base de datos no válido: "${dbName}" (usa letras, números y guion bajo)`);
  }

  // 1) Conectar a la base de mantenimiento para crear la base si falta
  const admin = new URL(env.DATABASE_URL);
  admin.pathname = "/postgres";
  const adminClient = new pg.Client({ connectionString: admin.toString() });
  try {
    await adminClient.connect();
    const exists = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (exists.rowCount === 0) {
      // En Windows el clúster suele nacer en WIN1252; para forzar UTF8 hay que partir de template0.
      try {
        await adminClient.query(`CREATE DATABASE "${dbName}" ENCODING 'UTF8' TEMPLATE template0`);
      } catch (err) {
        console.warn(
          `[lumen] No se pudo crear la base en UTF8 (${err instanceof Error ? err.message : err}). Usando la codificación por defecto.`
        );
        await adminClient.query(`CREATE DATABASE "${dbName}"`);
      }
      console.log(`[lumen] Base de datos "${dbName}" creada.`);
    } else {
      console.log(`[lumen] Base de datos "${dbName}" ya existe.`);
    }
  } catch (err) {
    // Hostings gestionados (Railway, etc.) ya traen la base creada y a veces no dejan entrar a "postgres".
    console.warn(
      `[lumen] No se pudo revisar/crear la base (${err instanceof Error ? err.message : err}). Se asume que "${dbName}" ya existe.`
    );
  } finally {
    await adminClient.end().catch(() => undefined);
  }

  // 2) Aplicar el esquema
  const sql = await readFile(schemaPath, "utf8");
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(sql);
    console.log("[lumen] Esquema aplicado correctamente.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[lumen] No se pudo inicializar la base de datos:", err instanceof Error ? err.message : err);
  process.exit(1);
});
