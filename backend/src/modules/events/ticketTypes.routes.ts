import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../../db/pool.js";
import { AppError } from "../../lib/errors.js";
import { parse, parseId } from "../../lib/validate.js";
import { requireRole } from "../../middleware/auth.js";

// Se monta en /events/:eventId/ticket-types (authenticate ya se aplicó en el router padre).
export const ticketTypesRouter = Router({ mergeParams: true });

const nameSchema = z
  .string()
  .trim()
  .min(1, "Ingresa el nombre del tipo de boleto")
  .max(50)
  .transform((v) => v.toUpperCase());

ticketTypesRouter.get("/", async (req, res) => {
  const eventId = parseId((req.params as Record<string, string>).eventId, "evento");
  const onlyActive = req.user!.rol === "RP";
  const rows = await query(
    `SELECT id, evento_id, nombre, activo, creado_en FROM tipos_boleto
      WHERE evento_id = $1 AND ($2::boolean = FALSE OR activo)
      ORDER BY id`,
    [eventId, onlyActive]
  );
  res.json(rows);
});

ticketTypesRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const eventId = parseId(req.params.eventId, "evento");
  const { nombre } = parse(z.object({ nombre: nameSchema }), req.body);

  const event = await queryOne(`SELECT 1 FROM eventos WHERE id = $1`, [eventId]);
  if (!event) throw AppError.notFound("Evento no encontrado");

  const dup = await queryOne(`SELECT 1 FROM tipos_boleto WHERE evento_id = $1 AND nombre = $2`, [eventId, nombre]);
  if (dup) throw AppError.conflict("Ese tipo de boleto ya existe en el evento");

  const row = await queryOne(
    `INSERT INTO tipos_boleto (evento_id, nombre) VALUES ($1, $2)
     RETURNING id, evento_id, nombre, activo, creado_en`,
    [eventId, nombre]
  );
  res.status(201).json(row);
});

ticketTypesRouter.put("/:typeId", requireRole("ADMIN"), async (req, res) => {
  const eventId = parseId(req.params.eventId, "evento");
  const typeId = parseId(req.params.typeId, "tipo");
  const data = parse(z.object({ nombre: nameSchema.optional(), activo: z.boolean().optional() }), req.body);

  if (data.nombre) {
    const dup = await queryOne(`SELECT 1 FROM tipos_boleto WHERE evento_id = $1 AND nombre = $2 AND id <> $3`, [
      eventId,
      data.nombre,
      typeId,
    ]);
    if (dup) throw AppError.conflict("Ese tipo de boleto ya existe en el evento");
  }

  const row = await queryOne(
    `UPDATE tipos_boleto SET nombre = COALESCE($3, nombre), activo = COALESCE($4, activo)
      WHERE id = $1 AND evento_id = $2
      RETURNING id, evento_id, nombre, activo, creado_en`,
    [typeId, eventId, data.nombre ?? null, data.activo ?? null]
  );
  if (!row) throw AppError.notFound("Tipo de boleto no encontrado");
  res.json(row);
});
