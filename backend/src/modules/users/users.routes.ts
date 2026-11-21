import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../../db/pool.js";
import { AppError } from "../../lib/errors.js";
import { BCRYPT_ROUNDS, PASSWORD_MAX, weakPasswordReason } from "../../lib/password.js";
import { parse, parseId } from "../../lib/validate.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { ROLES, USER_COLUMNS, type Usuario } from "./users.types.js";

export const usersRouter = Router();

usersRouter.use(authenticate, requireRole("ADMIN"));

const usernameSchema = z
  .string()
  .trim()
  .min(3, "El usuario debe tener al menos 3 caracteres")
  .max(60)
  .regex(/^[a-zA-Z0-9._-]+$/, "Solo letras, números, punto, guion y guion bajo");

// La política completa (largo, claves comunes, usuario dentro de la clave) se aplica en superRefine.
const passwordSchema = z.string().max(PASSWORD_MAX, `La contraseña no puede pasar de ${PASSWORD_MAX} caracteres`);

function checkPassword(data: { password?: string; username?: string }, ctx: z.RefinementCtx) {
  if (data.password === undefined) return;
  const reason = weakPasswordReason(data.password, data.username);
  if (reason) ctx.addIssue({ code: "custom", path: ["password"], message: reason });
}

const createSchema = z
  .object({
    nombre_completo: z.string().trim().min(2, "Ingresa el nombre completo").max(120),
    telefono: z.string().trim().max(20).default(""),
    username: usernameSchema,
    password: passwordSchema,
    rol: z.enum(ROLES),
    comision_porcentaje: z.coerce.number().min(0).max(100).default(10),
  })
  .superRefine(checkPassword);

const updateSchema = z
  .object({
    nombre_completo: z.string().trim().min(2).max(120),
    telefono: z.string().trim().max(20),
    username: usernameSchema,
    password: passwordSchema,
    rol: z.enum(ROLES),
    comision_porcentaje: z.coerce.number().min(0).max(100),
  })
  .partial()
  .superRefine(checkPassword);

usersRouter.get("/", async (req, res) => {
  const rol = req.query.rol ? parse(z.enum(ROLES), String(req.query.rol).toUpperCase()) : null;
  const users = await query<Usuario>(
    `SELECT ${USER_COLUMNS} FROM usuarios
      WHERE ($1::rol_usuario IS NULL OR rol = $1)
      ORDER BY activo DESC, rol, nombre_completo`,
    [rol]
  );
  res.json(users);
});

usersRouter.get("/:id", async (req, res) => {
  const user = await queryOne<Usuario>(`SELECT ${USER_COLUMNS} FROM usuarios WHERE id = $1`, [parseId(req.params.id)]);
  if (!user) throw AppError.notFound("Usuario no encontrado");
  res.json(user);
});

usersRouter.post("/", async (req, res) => {
  const data = parse(createSchema, req.body);
  const hash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  const exists = await queryOne(`SELECT 1 FROM usuarios WHERE lower(username) = lower($1)`, [data.username]);
  if (exists) throw AppError.conflict("Ese nombre de usuario ya está en uso");

  const user = await queryOne<Usuario>(
    `INSERT INTO usuarios (nombre_completo, telefono, username, password_hash, rol, comision_porcentaje)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${USER_COLUMNS}`,
    [data.nombre_completo, data.telefono, data.username, hash, data.rol, data.comision_porcentaje]
  );
  res.status(201).json(user);
});

usersRouter.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const data = parse(updateSchema, req.body);

  if (id === req.user!.id && data.rol && data.rol !== "ADMIN") {
    throw AppError.badRequest("No puedes quitarte a ti mismo el rol de administrador");
  }

  if (data.username) {
    const clash = await queryOne(`SELECT 1 FROM usuarios WHERE lower(username) = lower($1) AND id <> $2`, [
      data.username,
      id,
    ]);
    if (clash) throw AppError.conflict("Ese nombre de usuario ya está en uso");
  }

  // Si cambian la clave sin mandar el usuario, se compara contra el usuario actual de la cuenta.
  if (data.password && !data.username) {
    const current = await queryOne<{ username: string }>(`SELECT username FROM usuarios WHERE id = $1`, [id]);
    const reason = current ? weakPasswordReason(data.password, current.username) : null;
    if (reason) throw AppError.badRequest(reason);
  }

  const hash = data.password ? await bcrypt.hash(data.password, BCRYPT_ROUNDS) : null;

  // Cambiar la clave cierra las sesiones abiertas de esa cuenta y quita cualquier bloqueo.
  const user = await queryOne<Usuario>(
    `UPDATE usuarios SET
        nombre_completo     = COALESCE($2, nombre_completo),
        telefono            = COALESCE($3, telefono),
        username            = COALESCE($4, username),
        password_hash       = COALESCE($5, password_hash),
        rol                 = COALESCE($6::rol_usuario, rol),
        comision_porcentaje = COALESCE($7, comision_porcentaje),
        sesiones_validas_desde = CASE WHEN $5::text IS NULL THEN sesiones_validas_desde ELSE now() END,
        intentos_fallidos      = CASE WHEN $5::text IS NULL THEN intentos_fallidos ELSE 0 END,
        bloqueado_hasta        = CASE WHEN $5::text IS NULL THEN bloqueado_hasta ELSE NULL END
      WHERE id = $1
      RETURNING ${USER_COLUMNS}`,
    [
      id,
      data.nombre_completo ?? null,
      data.telefono ?? null,
      data.username ?? null,
      hash,
      data.rol ?? null,
      data.comision_porcentaje ?? null,
    ]
  );
  if (!user) throw AppError.notFound("Usuario no encontrado");
  res.json(user);
});

usersRouter.patch("/:id/toggle", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === req.user!.id) throw AppError.badRequest("No puedes desactivar tu propia cuenta");

  const user = await queryOne<Usuario>(
    `UPDATE usuarios SET activo = NOT activo WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [id]
  );
  if (!user) throw AppError.notFound("Usuario no encontrado");
  res.json(user);
});
