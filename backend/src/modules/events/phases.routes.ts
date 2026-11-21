import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../../db/pool.js";
import { AppError } from "../../lib/errors.js";
import { isoDateSchema, moneySchema, parse, parseId } from "../../lib/validate.js";
import { requireRole } from "../../middleware/auth.js";
import { getPhasePrices } from "./pricing.js";

// Se monta en /events/:eventId/phases (authenticate ya se aplicó en el router padre).
export const phasesRouter = Router({ mergeParams: true });

const phaseBody = z
  .object({
    nombre: z.string().trim().min(2, "Ingresa el nombre de la fase").max(80),
    precio: moneySchema,
    fecha_inicio: isoDateSchema,
    fecha_fin: isoDateSchema,
  })
  .refine((d) => d.fecha_fin > d.fecha_inicio, {
    message: "La fecha de fin debe ser posterior al inicio",
    path: ["fecha_fin"],
  });

const PHASE_COLUMNS = `id, evento_id, nombre, precio, fecha_inicio, fecha_fin, activa`;

async function withPrices<T extends { id: number }>(phase: T) {
  return { ...phase, precios: await getPhasePrices(phase.id) };
}

phasesRouter.get("/", requireRole("ADMIN", "RP", "MANAGER"), async (req, res) => {
  const eventId = parseId(req.params.eventId, "evento");
  const phases = await query<{ id: number }>(
    `SELECT ${PHASE_COLUMNS},
            (activa AND now() BETWEEN fecha_inicio AND fecha_fin) AS vigente,
            (SELECT count(*) FROM boletos b WHERE b.fase_id = fases.id) AS boletos_vendidos
       FROM fases WHERE evento_id = $1 ORDER BY fecha_inicio, id`,
    [eventId]
  );
  res.json(await Promise.all(phases.map(withPrices)));
});

phasesRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const eventId = parseId(req.params.eventId, "evento");
  const data = parse(phaseBody, req.body);

  const event = await queryOne(`SELECT 1 FROM eventos WHERE id = $1`, [eventId]);
  if (!event) throw AppError.notFound("Evento no encontrado");

  const phase = await queryOne<{ id: number }>(
    `INSERT INTO fases (evento_id, nombre, precio, fecha_inicio, fecha_fin)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${PHASE_COLUMNS}`,
    [eventId, data.nombre, data.precio, data.fecha_inicio, data.fecha_fin]
  );
  res.status(201).json(await withPrices(phase!));
});

phasesRouter.put("/:phaseId", requireRole("ADMIN"), async (req, res) => {
  const eventId = parseId(req.params.eventId, "evento");
  const phaseId = parseId(req.params.phaseId, "fase");
  const data = parse(phaseBody, req.body);

  const phase = await queryOne<{ id: number }>(
    `UPDATE fases SET nombre = $3, precio = $4, fecha_inicio = $5, fecha_fin = $6
      WHERE id = $1 AND evento_id = $2 RETURNING ${PHASE_COLUMNS}`,
    [phaseId, eventId, data.nombre, data.precio, data.fecha_inicio, data.fecha_fin]
  );
  if (!phase) throw AppError.notFound("Fase no encontrada");
  res.json(await withPrices(phase));
});

phasesRouter.patch("/:phaseId/toggle", requireRole("ADMIN"), async (req, res) => {
  const eventId = parseId(req.params.eventId, "evento");
  const phaseId = parseId(req.params.phaseId, "fase");
  const phase = await queryOne<{ id: number }>(
    `UPDATE fases SET activa = NOT activa WHERE id = $1 AND evento_id = $2 RETURNING ${PHASE_COLUMNS}`,
    [phaseId, eventId]
  );
  if (!phase) throw AppError.notFound("Fase no encontrada");
  res.json(await withPrices(phase));
});

phasesRouter.delete("/:phaseId", requireRole("ADMIN"), async (req, res) => {
  const eventId = parseId(req.params.eventId, "evento");
  const phaseId = parseId(req.params.phaseId, "fase");

  const used = await queryOne<{ total: number }>(`SELECT count(*) AS total FROM boletos WHERE fase_id = $1`, [phaseId]);
  if ((used?.total ?? 0) > 0) {
    throw AppError.conflict("La fase ya tiene boletos vendidos. Desactívala en lugar de eliminarla.");
  }

  const deleted = await queryOne(`DELETE FROM fases WHERE id = $1 AND evento_id = $2 RETURNING id`, [phaseId, eventId]);
  if (!deleted) throw AppError.notFound("Fase no encontrada");
  res.status(204).end();
});

// ── Precio por tipo de boleto dentro de la fase ──────────────

phasesRouter.put("/:phaseId/prices/:typeId", requireRole("ADMIN"), async (req, res) => {
  const eventId = parseId(req.params.eventId, "evento");
  const phaseId = parseId(req.params.phaseId, "fase");
  const typeId = parseId(req.params.typeId, "tipo");
  const { precio } = parse(z.object({ precio: moneySchema }), req.body);

  const valid = await queryOne(
    `SELECT 1 FROM fases f JOIN tipos_boleto t ON t.evento_id = f.evento_id
      WHERE f.id = $1 AND f.evento_id = $2 AND t.id = $3`,
    [phaseId, eventId, typeId]
  );
  if (!valid) throw AppError.notFound("Fase o tipo de boleto no encontrado");

  await query(
    `INSERT INTO precios_fase (fase_id, tipo_boleto_id, precio) VALUES ($1, $2, $3)
     ON CONFLICT (fase_id, tipo_boleto_id) DO UPDATE SET precio = EXCLUDED.precio`,
    [phaseId, typeId, precio]
  );
  res.json(await getPhasePrices(phaseId));
});

/** Quita el precio personalizado: el tipo vuelve a usar el precio base de la fase. */
phasesRouter.delete("/:phaseId/prices/:typeId", requireRole("ADMIN"), async (req, res) => {
  const eventId = parseId(req.params.eventId, "evento");
  const phaseId = parseId(req.params.phaseId, "fase");
  const typeId = parseId(req.params.typeId, "tipo");

  const valid = await queryOne(`SELECT 1 FROM fases WHERE id = $1 AND evento_id = $2`, [phaseId, eventId]);
  if (!valid) throw AppError.notFound("Fase no encontrada");

  await query(`DELETE FROM precios_fase WHERE fase_id = $1 AND tipo_boleto_id = $2`, [phaseId, typeId]);
  res.json(await getPhasePrices(phaseId));
});
