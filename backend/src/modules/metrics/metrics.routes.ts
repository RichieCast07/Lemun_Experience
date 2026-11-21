import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { query, queryOne } from "../../db/pool.js";
import { parse, parseId } from "../../lib/validate.js";
import { authenticate, requireRole } from "../../middleware/auth.js";

export const metricsRouter = Router();
metricsRouter.use(authenticate);

const eventFilter = z.object({ evento_id: z.coerce.number().int().positive().optional() });

/** Totales generales (opcionalmente de un solo evento). */
metricsRouter.get("/summary", requireRole("ADMIN"), async (req, res) => {
  const { evento_id } = parse(eventFilter, req.query);
  const sales = await queryOne(
    `SELECT count(*)                                  AS boletos,
            COALESCE(sum(precio), 0)                  AS ingresos,
            COALESCE(sum(comision_rp), 0)             AS comisiones,
            count(*) FILTER (WHERE estado = 'USADO')  AS usados,
            count(DISTINCT cliente_id)                AS clientes
       FROM boletos WHERE ($1::int IS NULL OR evento_id = $1)`,
    [evento_id ?? null]
  );
  const counts = await queryOne(
    `SELECT (SELECT count(*) FROM eventos  WHERE activo)                 AS eventos_activos,
            (SELECT count(*) FROM usuarios WHERE rol = 'RP' AND activo)  AS rps_activos`
  );
  res.json({ ...sales, ...counts });
});

/** Ranking de RPs (incluye a quienes aún no venden). */
metricsRouter.get("/rps", requireRole("ADMIN"), async (req, res) => {
  const { evento_id } = parse(eventFilter, req.query);
  const rows = await query(
    `SELECT u.id, u.nombre_completo, u.username, u.activo, u.comision_porcentaje,
            count(b.id)                  AS boletos,
            COALESCE(sum(b.precio), 0)      AS ingresos,
            COALESCE(sum(b.comision_rp), 0) AS comision,
            count(b.id) FILTER (WHERE b.estado = 'USADO') AS usados
       FROM usuarios u
       LEFT JOIN boletos b ON b.rp_id = u.id AND ($1::int IS NULL OR b.evento_id = $1)
      WHERE u.rol = 'RP'
      GROUP BY u.id
      ORDER BY ingresos DESC, u.nombre_completo`,
    [evento_id ?? null]
  );

  // Desglose por RP: qué tipo de boleto vendió, en qué fase y de qué evento.
  const breakdown = await query<{
    rp_id: number;
    tipo: string;
    fase: string;
    evento: string;
    boletos: number;
    ingresos: number;
  }>(
    `SELECT b.rp_id, b.tipo_boleto AS tipo, f.nombre AS fase, e.nombre AS evento,
            count(*) AS boletos, COALESCE(sum(b.precio), 0) AS ingresos
       FROM boletos b
       JOIN fases   f ON f.id = b.fase_id
       JOIN eventos e ON e.id = b.evento_id
      WHERE b.rp_id IS NOT NULL AND ($1::int IS NULL OR b.evento_id = $1)
      GROUP BY b.rp_id, b.tipo_boleto, f.id, e.id
      ORDER BY e.fecha_evento DESC, f.fecha_inicio, b.tipo_boleto`,
    [evento_id ?? null]
  );
  const byRp = new Map<number, typeof breakdown>();
  for (const row of breakdown) {
    const list = byRp.get(row.rp_id) ?? [];
    list.push(row);
    byRp.set(row.rp_id, list);
  }

  res.json(
    rows.map((r) => ({
      ...r,
      desglose: (byRp.get((r as { id: number }).id) ?? []).map(({ rp_id: _omit, ...d }) => d),
    }))
  );
});

/** Detalle de un evento: totales, por fase y por tipo de boleto. */
metricsRouter.get("/events/:id", requireRole("ADMIN"), async (req, res) => {
  const id = parseId(req.params.id);

  const resumen = await queryOne(
    `SELECT count(*) AS boletos, COALESCE(sum(precio), 0) AS ingresos, COALESCE(sum(comision_rp), 0) AS comisiones,
            count(*) FILTER (WHERE estado = 'USADO') AS usados
       FROM boletos WHERE evento_id = $1`,
    [id]
  );
  const porFase = await query(
    `SELECT f.id, f.nombre, f.precio, f.activa, count(b.id) AS boletos, COALESCE(sum(b.precio), 0) AS ingresos
       FROM fases f LEFT JOIN boletos b ON b.fase_id = f.id
      WHERE f.evento_id = $1 GROUP BY f.id ORDER BY f.fecha_inicio, f.id`,
    [id]
  );
  const porTipo = await query(
    `SELECT tipo_boleto AS nombre, count(*) AS boletos, COALESCE(sum(precio), 0) AS ingresos
       FROM boletos WHERE evento_id = $1 GROUP BY tipo_boleto ORDER BY ingresos DESC`,
    [id]
  );
  res.json({ resumen, por_fase: porFase, por_tipo: porTipo });
});

/** Serie diaria de ventas (días sin ventas aparecen en cero). */
metricsRouter.get("/sales-by-day", requireRole("ADMIN"), async (req, res) => {
  const { evento_id, days } = parse(eventFilter.extend({ days: z.coerce.number().int().min(7).max(180).default(30) }), req.query);
  const rows = await query(
    `WITH dias AS (
        SELECT d::date AS dia
          FROM generate_series(
                 (now() AT TIME ZONE $3)::date - ($2::int - 1),
                 (now() AT TIME ZONE $3)::date,
                 interval '1 day') AS d
     )
     SELECT to_char(dias.dia, 'YYYY-MM-DD') AS dia,
            count(b.id) AS boletos,
            COALESCE(sum(b.precio), 0) AS ingresos
       FROM dias
       LEFT JOIN boletos b
         ON (b.vendido_en AT TIME ZONE $3)::date = dias.dia
        AND ($1::int IS NULL OR b.evento_id = $1)
      GROUP BY dias.dia ORDER BY dias.dia`,
    [evento_id ?? null, days, env.APP_TIMEZONE]
  );
  res.json(rows);
});

/** Panel personal del RP. */
metricsRouter.get("/me", requireRole("RP"), async (req, res) => {
  const me = req.user!.id;
  const resumen = await queryOne(
    `SELECT count(*) AS boletos, COALESCE(sum(precio), 0) AS ingresos, COALESCE(sum(comision_rp), 0) AS comision,
            count(*) FILTER (WHERE estado = 'USADO') AS usados
       FROM boletos WHERE rp_id = $1`,
    [me]
  );
  const porEvento = await query(
    `SELECT e.id, e.nombre, count(b.id) AS boletos, COALESCE(sum(b.precio), 0) AS ingresos,
            COALESCE(sum(b.comision_rp), 0) AS comision
       FROM boletos b JOIN eventos e ON e.id = b.evento_id
      WHERE b.rp_id = $1 GROUP BY e.id ORDER BY max(b.vendido_en) DESC`,
    [me]
  );
  res.json({ resumen, por_evento: porEvento, comision_porcentaje: req.user!.comision_porcentaje });
});
