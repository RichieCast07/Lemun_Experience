import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { queryOne } from "../db/pool.js";
import { AppError } from "../lib/errors.js";
import type { Rol } from "../modules/users/users.types.js";

interface TokenPayload {
  sub: string;
  rol: Rol;
}

export function signToken(userId: number, rol: Rol): string {
  return jwt.sign({ rol }, env.JWT_SECRET, {
    subject: String(userId),
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Verifica el JWT y recarga al usuario desde la base:
 * así un usuario desactivado o con rol cambiado pierde acceso de inmediato.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw AppError.unauthorized("Falta el token de acceso");
  }

  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as unknown as TokenPayload;
  } catch {
    throw AppError.unauthorized("Sesión inválida o expirada");
  }

  const user = await queryOne<{
    id: number;
    username: string;
    nombre_completo: string;
    rol: Rol;
    comision_porcentaje: number;
    activo: boolean;
  }>(
    `SELECT id, username, nombre_completo, rol, comision_porcentaje, activo
       FROM usuarios WHERE id = $1`,
    [Number(payload.sub)]
  );

  if (!user || !user.activo) {
    throw AppError.unauthorized("Usuario inexistente o desactivado");
  }

  req.user = {
    id: user.id,
    username: user.username,
    nombre_completo: user.nombre_completo,
    rol: user.rol,
    comision_porcentaje: user.comision_porcentaje,
  };
  next();
}

/** Restringe una ruta a ciertos roles. Debe ir después de `authenticate`. */
export function requireRole(...roles: Rol[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw AppError.unauthorized();
    if (!roles.includes(req.user.rol)) throw AppError.forbidden();
    next();
  };
}
