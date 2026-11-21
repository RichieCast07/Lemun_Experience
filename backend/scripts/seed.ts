/**
 * Siembra datos iniciales.
 *   npm run db:seed        → crea el administrador (usa ADMIN_* del .env)
 *   npm run db:seed:demo   → además crea RPs, manager y un evento de ejemplo (solo desarrollo)
 */
import bcrypt from "bcryptjs";
import { env } from "../src/config/env.js";
import { pool, query, queryOne } from "../src/db/pool.js";
import { sellTicket } from "../src/modules/tickets/tickets.service.js";

const withDemo = process.argv.includes("--demo");

async function ensureUser(opts: {
  nombre: string;
  username: string;
  password: string;
  rol: "ADMIN" | "RP" | "MANAGER";
  telefono?: string;
  comision?: number;
}): Promise<number> {
  const existing = await queryOne<{ id: number }>(`SELECT id FROM usuarios WHERE lower(username) = lower($1)`, [
    opts.username,
  ]);
  if (existing) {
    console.log(`  · ${opts.rol.padEnd(7)} ${opts.username} (ya existía)`);
    return existing.id;
  }
  const hash = await bcrypt.hash(opts.password, 10);
  const row = await queryOne<{ id: number }>(
    `INSERT INTO usuarios (nombre_completo, telefono, username, password_hash, rol, comision_porcentaje)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [opts.nombre, opts.telefono ?? "", opts.username, hash, opts.rol, opts.comision ?? 10]
  );
  console.log(`  + ${opts.rol.padEnd(7)} ${opts.username}`);
  return row!.id;
}

async function main() {
  console.log("[lumen] Sembrando datos…");

  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 8) {
    throw new Error("Define ADMIN_PASSWORD (mínimo 8 caracteres) en backend/.env antes de ejecutar el seed.");
  }
  await ensureUser({
    nombre: env.ADMIN_NAME,
    username: env.ADMIN_USERNAME,
    password: env.ADMIN_PASSWORD,
    rol: "ADMIN",
  });

  if (!withDemo) {
    console.log("[lumen] Listo. (Usa `npm run db:seed:demo` para cargar datos de ejemplo.)");
    return;
  }
  if (env.isProd) throw new Error("El seed demo no se puede ejecutar en producción.");

  const demoPassword = "Lumen2026!";
  console.log("[lumen] Datos demo (contraseña de todos: " + demoPassword + ")");
  const rp1 = await ensureUser({ nombre: "Valeria Montes", username: "valeria", password: demoPassword, rol: "RP", telefono: "5512345678", comision: 10 });
  const rp2 = await ensureUser({ nombre: "Diego Ferrer", username: "diego", password: demoPassword, rol: "RP", telefono: "5587654321", comision: 12.5 });
  await ensureUser({ nombre: "Marcos Puerta", username: "marcos", password: demoPassword, rol: "MANAGER", telefono: "5500001111" });

  const hasEvent = await queryOne(`SELECT 1 FROM eventos WHERE codigo_evento = 'EVT-DEMO0001'`);
  if (hasEvent) {
    console.log("  · Evento demo ya existía");
    return;
  }

  const ev = await queryOne<{ id: number }>(
    `INSERT INTO eventos (nombre, codigo_evento, descripcion, fecha_evento, lugar, maps_url)
     VALUES ('Noche Lumen', 'EVT-DEMO0001', 'Una noche de luz, música y encuentro.',
             now() + interval '21 days', 'Faro Central, Puerto Viejo', 'https://maps.google.com')
     RETURNING id`
  );
  const eventId = ev!.id;
  await query(`INSERT INTO tipos_boleto (evento_id, nombre) VALUES ($1, 'GENERAL')`, [eventId]);
  const vip = await queryOne<{ id: number }>(`INSERT INTO tipos_boleto (evento_id, nombre) VALUES ($1, 'VIP') RETURNING id`, [eventId]);

  // Una fase pasada (preventa) y una vigente
  const preventa = await queryOne<{ id: number }>(
    `INSERT INTO fases (evento_id, nombre, precio, fecha_inicio, fecha_fin)
     VALUES ($1, 'Preventa', 250, now() - interval '30 days', now() - interval '2 days') RETURNING id`,
    [eventId]
  );
  const general_f = await queryOne<{ id: number }>(
    `INSERT INTO fases (evento_id, nombre, precio, fecha_inicio, fecha_fin)
     VALUES ($1, 'Venta general', 350, now() - interval '2 days', now() + interval '20 days') RETURNING id`,
    [eventId]
  );
  await query(`INSERT INTO precios_fase (fase_id, tipo_boleto_id, precio) VALUES ($1, $2, 600), ($3, $2, 800)`, [
    preventa!.id, vip!.id, general_f!.id,
  ]);

  const clientes = [
    ["Ana Lucía Ríos", "5511110001", rp1, "GENERAL"],
    ["Bruno Salas", "5511110002", rp1, "VIP"],
    ["Camila Ortega", "5511110003", rp2, "GENERAL"],
    ["Daniel Vega", "5511110004", rp2, "GENERAL"],
    ["Elena Paredes", "5511110005", rp1, "GENERAL"],
  ] as const;
  for (const [nombre, tel, rp, tipo] of clientes) {
    await sellTicket({ sellerId: rp, eventoId: eventId, clienteNombre: nombre, clienteTelefono: tel, tipoBoleto: tipo });
  }
  console.log(`  + Evento "Noche Lumen" con 2 fases, 2 tipos de boleto y ${clientes.length} boletos`);
}

main()
  .catch((err) => {
    console.error("[lumen] Seed falló:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
