import { query, queryOne, type Queryable } from "../../db/pool.js";

/** Los RPs dejan de ver (y vender) un evento 12 h después de su inicio. */
export const SALES_GRACE_HOURS = 12;

export interface FaseVigente {
  id: number;
  evento_id: number;
  nombre: string;
  precio: number;
  fecha_inicio: Date;
  fecha_fin: Date;
}

/**
 * Fase de venta vigente: activa y con la fecha actual dentro de su rango.
 * Si hubiera traslape, gana la que empezó más recientemente.
 */
export function getCurrentPhase(eventId: number, db?: Queryable): Promise<FaseVigente | null> {
  return queryOne<FaseVigente>(
    `SELECT id, evento_id, nombre, precio, fecha_inicio, fecha_fin
       FROM fases
      WHERE evento_id = $1 AND activa AND now() BETWEEN fecha_inicio AND fecha_fin
      ORDER BY fecha_inicio DESC, id DESC
      LIMIT 1`,
    [eventId],
    db
  );
}

export interface PrecioTipo {
  tipo_boleto_id: number;
  nombre: string;
  activo: boolean;
  precio: number;
  personalizado: boolean;
}

/** Precio efectivo de cada tipo de boleto en una fase (override o precio base de la fase). */
export function getPhasePrices(phaseId: number, db?: Queryable): Promise<PrecioTipo[]> {
  return query<PrecioTipo>(
    `SELECT t.id AS tipo_boleto_id, t.nombre, t.activo,
            COALESCE(pf.precio, f.precio) AS precio,
            (pf.precio IS NOT NULL)       AS personalizado
       FROM fases f
       JOIN tipos_boleto t ON t.evento_id = f.evento_id
       LEFT JOIN precios_fase pf ON pf.fase_id = f.id AND pf.tipo_boleto_id = t.id
      WHERE f.id = $1
      ORDER BY t.id`,
    [phaseId],
    db
  );
}
