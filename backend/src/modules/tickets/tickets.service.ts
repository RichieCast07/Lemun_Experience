import { randomBytes } from "node:crypto";
import { env } from "../../config/env.js";
import { query, queryOne, withTransaction, type Queryable } from "../../db/pool.js";
import { AppError } from "../../lib/errors.js";
import { getCurrentPhase, getPhasePrices, SALES_GRACE_HOURS } from "../events/pricing.js";
import type { Rol } from "../users/users.types.js";

export interface Boleto {
  id: number;
  codigo: string;
  token_publico: string;
  cliente_id: number;
  cliente_nombre: string;
  cliente_telefono: string;
  rp_id: number;
  rp_nombre: string;
  evento_id: number;
  evento_nombre: string;
  codigo_evento: string;
  fecha_evento: Date;
  evento_lugar: string;
  maps_url: string | null;
  fase_id: number;
  fase_nombre: string;
  tipo_boleto: string;
  precio: number;
  comision_rp: number;
  estado: "ACTIVO" | "USADO";
  vendido_en: Date;
  usado_en: Date | null;
  usado_por_nombre: string | null;
  url_publica: string;
}

const TICKET_SELECT = `
  SELECT b.id, b.codigo, b.token_publico,
         b.cliente_id, c.nombre_completo AS cliente_nombre, c.telefono AS cliente_telefono,
         b.rp_id, u.nombre_completo AS rp_nombre,
         b.evento_id, e.nombre AS evento_nombre, e.codigo_evento, e.fecha_evento,
         e.lugar AS evento_lugar, e.maps_url,
         b.fase_id, f.nombre AS fase_nombre,
         b.tipo_boleto, b.precio, b.comision_rp, b.estado,
         b.vendido_en, b.usado_en, mu.nombre_completo AS usado_por_nombre
    FROM boletos b
    JOIN clientes c ON c.id = b.cliente_id
    JOIN usuarios u ON u.id = b.rp_id
    JOIN eventos  e ON e.id = b.evento_id
    JOIN fases    f ON f.id = b.fase_id
    LEFT JOIN usuarios mu ON mu.id = b.usado_por`;

type Row = Omit<Boleto, "url_publica">;

function withPublicUrl(row: Row): Boleto {
  return { ...row, url_publica: `${env.PUBLIC_APP_URL.replace(/\/$/, "")}/t/${row.token_publico}` };
}

/** El MANAGER solo necesita validar accesos: no ve precios, comisiones ni quién vendió. */
export function sanitizeFor(rol: Rol, ticket: Boleto): Boleto {
  if (rol !== "MANAGER") return ticket;
  return { ...ticket, precio: 0, comision_rp: 0, rp_nombre: "", cliente_telefono: "" };
}

export async function getTicketByCode(codigo: string, db?: Queryable): Promise<Boleto | null> {
  const row = await queryOne<Row>(`${TICKET_SELECT} WHERE b.codigo = $1`, [codigo.trim().toUpperCase()], db);
  return row ? withPublicUrl(row) : null;
}

export async function getTicketByToken(token: string): Promise<Boleto | null> {
  const row = await queryOne<Row>(`${TICKET_SELECT} WHERE b.token_publico = $1`, [token]);
  return row ? withPublicUrl(row) : null;
}

export interface TicketFilters {
  evento_id?: number | null;
  rp_id?: number | null;
  estado?: "ACTIVO" | "USADO" | null;
  q?: string | null;
  limit?: number;
  offset?: number;
}

export async function listTickets(filters: TicketFilters): Promise<{ items: Boleto[]; total: number }> {
  const like = filters.q ? `%${filters.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
  const rows = await query<Row & { total_count: number }>(
    `${TICKET_SELECT.replace("SELECT b.id,", "SELECT count(*) OVER() AS total_count, b.id,")}
      WHERE ($1::int IS NULL OR b.evento_id = $1)
        AND ($2::int IS NULL OR b.rp_id = $2)
        AND ($3::estado_boleto IS NULL OR b.estado = $3)
        AND ($4::text IS NULL OR c.nombre_completo ILIKE $4 OR c.telefono LIKE $4 OR b.codigo ILIKE $4)
      ORDER BY b.vendido_en DESC, b.id DESC
      LIMIT $5 OFFSET $6`,
    [
      filters.evento_id ?? null,
      filters.rp_id ?? null,
      filters.estado ?? null,
      like,
      Math.min(filters.limit ?? 100, 500),
      filters.offset ?? 0,
    ]
  );
  return {
    total: rows[0]?.total_count ?? 0,
    items: rows.map(({ total_count: _t, ...row }) => withPublicUrl(row)),
  };
}

export interface SellInput {
  sellerId: number;
  eventoId: number;
  clienteNombre: string;
  clienteTelefono: string;
  tipoBoleto: string;
}

/** Vende un boleto de forma atómica: cliente, precio, comisión y boleto en una sola transacción. */
export async function sellTicket(input: SellInput): Promise<Boleto> {
  return withTransaction(async (db) => {
    const event = await queryOne<{ id: number; codigo_evento: string; activo: boolean; terminado: boolean }>(
      `SELECT id, codigo_evento, activo,
              (fecha_evento < now() - make_interval(hours => $2)) AS terminado
         FROM eventos WHERE id = $1`,
      [input.eventoId, SALES_GRACE_HOURS],
      db
    );
    if (!event) throw AppError.badRequest("El evento seleccionado no existe");
    if (!event.activo) throw AppError.badRequest("El evento está desactivado: no se pueden vender boletos");
    if (event.terminado) throw AppError.badRequest("El evento ya terminó: la venta está cerrada");

    const seller = await queryOne<{ id: number; rol: Rol; activo: boolean; comision_porcentaje: number }>(
      `SELECT id, rol, activo, comision_porcentaje FROM usuarios WHERE id = $1`,
      [input.sellerId],
      db
    );
    if (!seller) throw AppError.badRequest("El vendedor seleccionado no existe");
    if (!seller.activo) throw AppError.forbidden("El vendedor está desactivado");
    if (seller.rol === "MANAGER") throw AppError.badRequest("Un manager no puede vender boletos");

    const fase = await getCurrentPhase(event.id, db);
    if (!fase) {
      throw AppError.badRequest("No hay una fase de venta vigente para este evento. Pide al administrador configurarla.");
    }

    const tipos = await getPhasePrices(fase.id, db);
    const tipo = tipos.find((t) => t.nombre === input.tipoBoleto.trim().toUpperCase() && t.activo);
    if (!tipo) throw AppError.badRequest("El tipo de boleto no existe o no está disponible en este evento");

    const cliente = await queryOne<{ id: number }>(
      `INSERT INTO clientes (nombre_completo, telefono) VALUES ($1, $2)
       ON CONFLICT (telefono) DO UPDATE SET telefono = EXCLUDED.telefono
       RETURNING id`,
      [input.clienteNombre, input.clienteTelefono],
      db
    );

    // La comisión solo aplica a RPs; las ventas del administrador no generan comisión.
    const comision =
      seller.rol === "RP" ? Math.round(tipo.precio * seller.comision_porcentaje) / 100 : 0;

    const codigo = `${event.codigo_evento}-${randomBytes(5).toString("hex").toUpperCase()}`;
    const token = randomBytes(18).toString("base64url");

    const inserted = await queryOne<{ id: number }>(
      `INSERT INTO boletos (codigo, token_publico, cliente_id, rp_id, evento_id, fase_id, tipo_boleto, precio, comision_rp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (cliente_id, evento_id) DO NOTHING
       RETURNING id`,
      [codigo, token, cliente!.id, seller.id, event.id, fase.id, tipo.nombre, tipo.precio, comision],
      db
    );
    if (!inserted) throw AppError.conflict("Este cliente ya tiene un boleto para el evento");

    const row = await queryOne<Row>(`${TICKET_SELECT} WHERE b.id = $1`, [inserted.id], db);
    return withPublicUrl(row!);
  });
}

/**
 * Marca un boleto como USADO en una sola sentencia atómica:
 * dos escaneos simultáneos del mismo QR no pueden ambos tener éxito.
 */
export async function markTicketUsed(codigo: string, userId: number): Promise<Boleto> {
  const code = codigo.trim().toUpperCase();

  const updated = await queryOne<{ id: number }>(
    `UPDATE boletos b SET estado = 'USADO', usado_en = now(), usado_por = $2
       FROM eventos e
      WHERE b.codigo = $1 AND b.estado = 'ACTIVO' AND e.id = b.evento_id AND e.activo
      RETURNING b.id`,
    [code, userId]
  );

  if (!updated) {
    const existing = await getTicketByCode(code);
    if (!existing) throw AppError.notFound("Boleto no encontrado");
    if (existing.estado === "USADO") throw new AppError(409, "Este boleto ya fue utilizado", { ticket: existing });
    throw AppError.badRequest("El evento está desactivado: no se pueden validar accesos");
  }

  return (await getTicketByCode(code))!;
}

export async function deleteTicket(codigo: string): Promise<boolean> {
  const row = await queryOne(`DELETE FROM boletos WHERE codigo = $1 RETURNING id`, [codigo.trim().toUpperCase()]);
  return row !== null;
}

export async function getAccessSummary(eventId: number) {
  const totals = await queryOne<{ total: number; usados: number }>(
    `SELECT count(*) AS total, count(*) FILTER (WHERE estado = 'USADO') AS usados
       FROM boletos WHERE evento_id = $1`,
    [eventId]
  );
  const ultimos = await query<{ codigo: string; cliente_nombre: string; tipo_boleto: string; usado_en: Date }>(
    `SELECT b.codigo, c.nombre_completo AS cliente_nombre, b.tipo_boleto, b.usado_en
       FROM boletos b JOIN clientes c ON c.id = b.cliente_id
      WHERE b.evento_id = $1 AND b.estado = 'USADO'
      ORDER BY b.usado_en DESC LIMIT 8`,
    [eventId]
  );
  const total = totals?.total ?? 0;
  const usados = totals?.usados ?? 0;
  return { total, usados, pendientes: total - usados, ultimos };
}
