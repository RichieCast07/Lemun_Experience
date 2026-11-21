import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { parse, parseId, phoneSchema } from "../../lib/validate.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import {
  deleteTicket,
  getAccessSummary,
  getTicketByCode,
  getTicketByToken,
  listTickets,
  markTicketUsed,
  sanitizeFor,
  sellTicket,
} from "./tickets.service.js";

export const ticketsRouter = Router();

// ── Público: el cliente abre su boleto desde un enlace (sin login) ────
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiadas consultas. Intenta de nuevo en un momento." },
});

ticketsRouter.get("/public/:token", publicLimiter, async (req, res) => {
  const ticket = await getTicketByToken(String(req.params.token));
  if (!ticket) throw AppError.notFound("Boleto no encontrado");

  // Solo lo necesario para mostrar el boleto: nada de precios, teléfono ni RP.
  res.json({
    codigo: ticket.codigo,
    cliente_nombre: ticket.cliente_nombre,
    evento_nombre: ticket.evento_nombre,
    fecha_evento: ticket.fecha_evento,
    evento_lugar: ticket.evento_lugar,
    maps_url: ticket.maps_url,
    tipo_boleto: ticket.tipo_boleto,
    estado: ticket.estado,
  });
});

// ── Autenticado ───────────────────────────────────────────────────────
ticketsRouter.use(authenticate);

const sellSchema = z.object({
  evento_id: z.coerce.number().int().positive("Selecciona un evento"),
  cliente_nombre: z.string().trim().min(2, "Ingresa el nombre del cliente").max(120),
  cliente_telefono: phoneSchema,
  tipo_boleto: z.string().trim().min(1).max(50).default("GENERAL"),
  rp_id: z.coerce.number().int().positive().optional(), // solo lo respeta un ADMIN
});

ticketsRouter.post("/", requireRole("RP", "ADMIN"), async (req, res) => {
  const data = parse(sellSchema, req.body);
  const user = req.user!;
  const sellerId = user.rol === "ADMIN" && data.rp_id ? data.rp_id : user.id;

  const ticket = await sellTicket({
    sellerId,
    eventoId: data.evento_id,
    clienteNombre: data.cliente_nombre,
    clienteTelefono: data.cliente_telefono,
    tipoBoleto: data.tipo_boleto,
  });
  res.status(201).json(ticket);
});

const listSchema = z.object({
  evento_id: z.coerce.number().int().positive().optional(),
  rp_id: z.coerce.number().int().positive().optional(),
  estado: z.enum(["ACTIVO", "USADO"]).optional(),
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Admin: todos los boletos con filtros y paginación. */
ticketsRouter.get("/", requireRole("ADMIN"), async (req, res) => {
  const f = parse(listSchema, req.query);
  res.json(await listTickets({ ...f, q: f.q || null }));
});

/** RP: solo sus propias ventas. */
ticketsRouter.get("/mine", requireRole("RP"), async (req, res) => {
  const f = parse(listSchema, req.query);
  res.json(await listTickets({ ...f, rp_id: req.user!.id, q: f.q || null, limit: f.limit }));
});

/** Manager/Admin: avance de accesos de un evento. */
ticketsRouter.get("/access/:eventId", requireRole("MANAGER", "ADMIN"), async (req, res) => {
  res.json(await getAccessSummary(parseId(req.params.eventId, "evento")));
});

// Consulta/canje por código: tope por usuario (no por IP, porque el staff comparte wifi).
// Un escáner humano no pasa de ~1 boleto por segundo; esto frena a quien intente adivinar códigos.
ticketsRouter.use(
  "/code",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => `user:${req.user?.id ?? "anon"}`,
    message: { error: "Demasiadas consultas de boletos. Espera un momento." },
  })
);

ticketsRouter.get("/code/:codigo", async (req, res) => {
  const user = req.user!;
  const ticket = await getTicketByCode(String(req.params.codigo));
  // Un RP solo puede consultar boletos que él mismo vendió.
  if (!ticket || (user.rol === "RP" && ticket.rp_id !== user.id)) throw AppError.notFound("Boleto no encontrado");
  res.json(sanitizeFor(user.rol, ticket));
});

ticketsRouter.patch("/code/:codigo/use", requireRole("MANAGER", "ADMIN"), async (req, res) => {
  const ticket = await markTicketUsed(String(req.params.codigo), req.user!.id);
  res.json(sanitizeFor(req.user!.rol, ticket));
});

ticketsRouter.delete("/code/:codigo", requireRole("ADMIN"), async (req, res) => {
  const ok = await deleteTicket(String(req.params.codigo));
  if (!ok) throw AppError.notFound("Boleto no encontrado");
  res.status(204).end();
});
