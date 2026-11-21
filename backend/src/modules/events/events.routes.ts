import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { query, queryOne, withTransaction } from "../../db/pool.js";
import { AppError } from "../../lib/errors.js";
import { isoDateSchema, parse, parseId } from "../../lib/validate.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { getCurrentPhase, getPhasePrices, SALES_GRACE_HOURS } from "./pricing.js";
import { phasesRouter } from "./phases.routes.js";
import { ticketTypesRouter } from "./ticketTypes.routes.js";

export const eventsRouter = Router();
eventsRouter.use(authenticate);

const eventBody = z.object({
  nombre: z.string().trim().min(2, "Ingresa el nombre del evento").max(120),
  descripcion: z.string().trim().max(2000).optional().nullable(),
  fecha_evento: isoDateSchema,
  lugar: z.string().trim().min(2, "Ingresa el lugar").max(200),
  maps_url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "El enlace de mapas debe iniciar con http(s)://")
    .optional()
    .nullable(),
});

const SELECT_EVENT = `
  SELECT e.id, e.nombre, e.codigo_evento, e.descripcion, e.fecha_evento, e.lugar, e.maps_url, e.activo, e.creado_en,
         (SELECT count(*) FROM boletos b WHERE b.evento_id = e.id)                         AS boletos_vendidos,
         (SELECT count(*) FROM boletos b WHERE b.evento_id = e.id AND b.estado = 'USADO')  AS boletos_usados,
         (SELECT row_to_json(f) FROM (
             SELECT id, nombre, precio, fecha_inicio, fecha_fin FROM fases
              WHERE evento_id = e.id AND activa AND now() BETWEEN fecha_inicio AND fecha_fin
              ORDER BY fecha_inicio DESC, id DESC LIMIT 1) f)                               AS fase_vigente
    FROM eventos e`;

eventsRouter.get("/", async (req, res) => {
  const isRp = req.user!.rol === "RP";
  const rows = await query(
    `${SELECT_EVENT}
      WHERE ($1::boolean = FALSE OR (e.activo AND e.fecha_evento > now() - make_interval(hours => $2)))
      ORDER BY e.fecha_evento ASC`,
    [isRp, SALES_GRACE_HOURS]
  );
  res.json(rows);
});

eventsRouter.get("/:id", async (req, res) => {
  const event = await queryOne(`${SELECT_EVENT} WHERE e.id = $1`, [parseId(req.params.id)]);
  if (!event) throw AppError.notFound("Evento no encontrado");
  res.json(event);
});

/** Lo que un RP necesita para vender: fase vigente y tipos de boleto con su precio hoy. */
eventsRouter.get("/:id/sale-options", requireRole("RP", "ADMIN"), async (req, res) => {
  const id = parseId(req.params.id);
  const fase = await getCurrentPhase(id);
  const tipos = fase ? (await getPhasePrices(fase.id)).filter((t) => t.activo) : [];
  res.json({ fase, tipos });
});

eventsRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const data = parse(eventBody, req.body);
  const codigo = `EVT-${randomBytes(4).toString("hex").toUpperCase()}`;

  const created = await withTransaction(async (db) => {
    const row = await queryOne<{ id: number }>(
      `INSERT INTO eventos (nombre, codigo_evento, descripcion, fecha_evento, lugar, maps_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [data.nombre, codigo, data.descripcion || null, data.fecha_evento, data.lugar, data.maps_url || null],
      db
    );
    await query(`INSERT INTO tipos_boleto (evento_id, nombre) VALUES ($1, 'GENERAL')`, [row!.id], db);
    return row!.id;
  });

  res.status(201).json(await queryOne(`${SELECT_EVENT} WHERE e.id = $1`, [created]));
});

eventsRouter.put("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = parseId(req.params.id);
  const data = parse(eventBody, req.body);

  const updated = await queryOne<{ id: number }>(
    `UPDATE eventos SET nombre = $2, descripcion = $3, fecha_evento = $4, lugar = $5, maps_url = $6
      WHERE id = $1 RETURNING id`,
    [id, data.nombre, data.descripcion || null, data.fecha_evento, data.lugar, data.maps_url || null]
  );
  if (!updated) throw AppError.notFound("Evento no encontrado");
  res.json(await queryOne(`${SELECT_EVENT} WHERE e.id = $1`, [id]));
});

eventsRouter.patch("/:id/toggle", requireRole("ADMIN"), async (req, res) => {
  const id = parseId(req.params.id);
  const updated = await queryOne<{ id: number }>(`UPDATE eventos SET activo = NOT activo WHERE id = $1 RETURNING id`, [id]);
  if (!updated) throw AppError.notFound("Evento no encontrado");
  res.json(await queryOne(`${SELECT_EVENT} WHERE e.id = $1`, [id]));
});

eventsRouter.use("/:eventId/ticket-types", ticketTypesRouter);
eventsRouter.use("/:eventId/phases", phasesRouter);
