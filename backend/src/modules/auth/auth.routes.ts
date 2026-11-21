import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { queryOne } from "../../db/pool.js";
import { AppError } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { authenticate, signToken } from "../../middleware/auth.js";
import { USER_COLUMNS, type Usuario } from "../users/users.types.js";

export const authRouter = Router();

// Solo cuentan los intentos FALLIDOS: en un evento todo el staff comparte la misma IP (wifi),
// así que los inicios de sesión correctos no deben agotar el cupo.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiados intentos de acceso. Intenta de nuevo en unos minutos." },
});

const loginSchema = z.object({
  username: z.string().trim().min(1, "Ingresa tu usuario"),
  password: z.string().min(1, "Ingresa tu contraseña"),
});

// Hash falso para igualar el tiempo de respuesta cuando el usuario no existe.
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8.n7Cw1UcHqkbN0cHk5oZK1UZ1YtK2";

authRouter.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = parse(loginSchema, req.body);

  const row = await queryOne<Usuario & { password_hash: string }>(
    `SELECT ${USER_COLUMNS}, password_hash FROM usuarios WHERE lower(username) = lower($1)`,
    [username]
  );

  const valid = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !valid) throw AppError.unauthorized("Usuario o contraseña incorrectos");
  if (!row.activo) throw AppError.forbidden("Tu cuenta está desactivada. Contacta al administrador.");

  const { password_hash: _omit, ...user } = row;
  res.json({ token: signToken(row.id, row.rol), user });
});

authRouter.get("/me", authenticate, async (req, res) => {
  const user = await queryOne<Usuario>(`SELECT ${USER_COLUMNS} FROM usuarios WHERE id = $1`, [req.user!.id]);
  if (!user) throw AppError.unauthorized();
  res.json({ user });
});
