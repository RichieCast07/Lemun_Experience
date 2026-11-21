import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../../db/pool.js";
import { AppError } from "../../lib/errors.js";
import { parse, parseId, phoneSchema } from "../../lib/validate.js";
import { authenticate, requireRole } from "../../middleware/auth.js";

export const clientsRouter = Router();
clientsRouter.use(authenticate);

interface Cliente {
  id: number;
  nombre_completo: string;
  telefono: string;
  creado_en: Date;
}

/** Autocompletar cliente al vender: RP y Admin buscan por teléfono exacto. */
clientsRouter.get("/search", requireRole("ADMIN", "RP"), async (req, res) => {
  const { telefono } = parse(z.object({ telefono: phoneSchema }), req.query);
  const client = await queryOne<Cliente>(
    `SELECT id, nombre_completo, telefono, creado_en FROM clientes WHERE telefono = $1`,
    [telefono]
  );
  if (!client) throw AppError.notFound("Cliente no encontrado");
  res.json(client);
});

// A partir de aquí solo ADMIN
clientsRouter.use(requireRole("ADMIN"));

clientsRouter.get("/", async (req, res) => {
  const { q } = parse(z.object({ q: z.string().trim().max(80).optional() }), req.query);
  const like = q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;

  const rows = await query(
    `SELECT c.id, c.nombre_completo, c.telefono, c.creado_en,
            count(b.id)                          AS boletos,
            COALESCE(sum(b.precio), 0)           AS total_gastado,
            max(b.vendido_en)                    AS ultima_compra
       FROM clientes c
       LEFT JOIN boletos b ON b.cliente_id = c.id
      WHERE ($1::text IS NULL OR c.nombre_completo ILIKE $1 OR c.telefono LIKE $1)
      GROUP BY c.id
      ORDER BY c.creado_en DESC
      LIMIT 500`,
    [like]
  );
  res.json(rows);
});

/** Cartera de clientes en CSV (una fila por boleto). */
clientsRouter.get("/export/csv", async (_req, res) => {
  const rows = await query<Record<string, unknown>>(
    `SELECT c.nombre_completo AS cliente, c.telefono, e.nombre AS evento, b.tipo_boleto AS tipo,
            f.nombre AS fase, u.nombre_completo AS rp, b.precio, b.estado, b.vendido_en
       FROM boletos b
       JOIN clientes c ON c.id = b.cliente_id
       JOIN eventos  e ON e.id = b.evento_id
       JOIN fases    f ON f.id = b.fase_id
       JOIN usuarios u ON u.id = b.rp_id
      ORDER BY b.vendido_en DESC`
  );

  const headers = ["Cliente", "Teléfono", "Evento", "Tipo", "Fase", "RP", "Precio", "Estado", "Fecha de compra"];
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [r.cliente, r.telefono, r.evento, r.tipo, r.fase, r.rp, r.precio, r.estado, (r.vendido_en as Date).toISOString()]
        .map(csvCell)
        .join(",")
    );
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="lumen-clientes-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("﻿" + lines.join("\r\n")); // BOM para que Excel respete los acentos
});

clientsRouter.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const client = await queryOne<Cliente>(`SELECT id, nombre_completo, telefono, creado_en FROM clientes WHERE id = $1`, [id]);
  if (!client) throw AppError.notFound("Cliente no encontrado");

  const boletos = await query(
    `SELECT b.codigo, e.nombre AS evento_nombre, b.tipo_boleto, b.precio, b.estado, b.vendido_en, u.nombre_completo AS rp_nombre
       FROM boletos b JOIN eventos e ON e.id = b.evento_id JOIN usuarios u ON u.id = b.rp_id
      WHERE b.cliente_id = $1 ORDER BY b.vendido_en DESC`,
    [id]
  );
  res.json({ ...client, boletos });
});

const createSchema = z.object({
  nombre_completo: z.string().trim().min(2, "Ingresa el nombre").max(120),
  telefono: phoneSchema,
});

clientsRouter.post("/", async (req, res) => {
  const data = parse(createSchema, req.body);
  const dup = await queryOne(`SELECT 1 FROM clientes WHERE telefono = $1`, [data.telefono]);
  if (dup) throw AppError.conflict("Ya existe un cliente con ese teléfono");

  const client = await queryOne<Cliente>(
    `INSERT INTO clientes (nombre_completo, telefono) VALUES ($1, $2) RETURNING id, nombre_completo, telefono, creado_en`,
    [data.nombre_completo, data.telefono]
  );
  res.status(201).json(client);
});

/** Escapa una celda CSV y neutraliza inyección de fórmulas (=, +, -, @). */
function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
