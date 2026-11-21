import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
}

// Express reconoce un manejador de errores por tener 4 parámetros.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    return;
  }

  // JSON mal formado
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "El cuerpo de la petición no es JSON válido" });
    return;
  }

  // Violaciones de integridad de PostgreSQL
  const pgCode = (err as { code?: string } | null)?.code;
  if (pgCode === "23505") {
    res.status(409).json({ error: "Ya existe un registro con esos datos" });
    return;
  }
  if (pgCode === "23503") {
    res.status(409).json({ error: "El registro está relacionado con otros datos y no se puede modificar así" });
    return;
  }
  if (pgCode === "23514") {
    res.status(400).json({ error: "Los datos no cumplen las reglas de validación" });
    return;
  }

  console.error("[lumen] Error no controlado:", err);
  res.status(500).json({
    error: "Error interno del servidor",
    ...(env.isProd ? {} : { detalle: err instanceof Error ? err.message : String(err) }),
  });
}
