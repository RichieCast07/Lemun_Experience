import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { query, queryOne } from "../../db/pool.js";
import { AppError } from "../../lib/errors.js";
import { BCRYPT_ROUNDS } from "../../lib/password.js";
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

// Hash falso (mismo coste que los reales) para igualar el tiempo de respuesta cuando el usuario no existe.
const DUMMY_HASH = bcrypt.hashSync("lumen-dummy-password", BCRYPT_ROUNDS);

// Bloqueo temporal de la cuenta tras varios fallos seguidos (frena la fuerza bruta distribuida).
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

authRouter.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = parse(loginSchema, req.body);

  const row = await queryOne<Usuario & { password_hash: string; bloqueado_hasta: Date | null }>(
    `SELECT ${USER_COLUMNS}, password_hash, bloqueado_hasta FROM usuarios WHERE lower(username) = lower($1)`,
    [username]
  );

  if (row?.bloqueado_hasta && row.bloqueado_hasta.getTime() > Date.now()) {
    throw new AppError(429, "Demasiados intentos fallidos. Intenta de nuevo en unos minutos.");
  }

  const valid = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !valid) {
    if (row) {
      await query(
        `UPDATE usuarios SET
            intentos_fallidos = CASE WHEN intentos_fallidos + 1 >= $2 THEN 0 ELSE intentos_fallidos + 1 END,
            bloqueado_hasta   = CASE WHEN intentos_fallidos + 1 >= $2
                                     THEN now() + make_interval(mins => $3) ELSE bloqueado_hasta END
          WHERE id = $1`,
        [row.id, MAX_FAILED_LOGINS, LOCK_MINUTES]
      );
    }
    throw AppError.unauthorized("Usuario o contraseña incorrectos");
  }
  if (!row.activo) throw AppError.forbidden("Tu cuenta está desactivada. Contacta al administrador.");

  // Login correcto: se borra el conteo de fallos.
  await query(`UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1`, [row.id]);

  const { password_hash: _omit, bloqueado_hasta: _lock, ...user } = row;
  res.json({ token: signToken(row.id, row.rol), user });
});

authRouter.get("/me", authenticate, async (req, res) => {
  const user = await queryOne<Usuario>(`SELECT ${USER_COLUMNS} FROM usuarios WHERE id = $1`, [req.user!.id]);
  if (!user) throw AppError.unauthorized();
  res.json({ user });
});
