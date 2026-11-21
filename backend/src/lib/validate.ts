import { z } from "zod";
import { AppError } from "./errors.js";

/** Parsea `data` con `schema`; si falla lanza un 400 con el detalle por campo. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      campo: issue.path.join("."),
      mensaje: issue.message,
    }));
    throw AppError.badRequest(details[0]?.mensaje ?? "Datos inválidos", details);
  }
  return result.data;
}

/** Valida un id numérico de ruta (`/:id`). */
export function parseId(value: unknown, label = "id"): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw AppError.badRequest(`${label} inválido`);
  }
  return n;
}

// ── Esquemas reutilizables ───────────────────────────────────

/** Teléfono: se quitan espacios/guiones/paréntesis y debe quedar de 10 a 15 dígitos. */
export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s\-().+]/g, ""))
  .refine((v) => /^\d{10,15}$/.test(v), "El teléfono debe tener entre 10 y 15 dígitos");

export const isoDateSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Fecha inválida")
  .transform((v) => new Date(v));

export const moneySchema = z.coerce
  .number()
  .finite()
  .min(0, "El monto no puede ser negativo")
  .max(10_000_000, "Monto demasiado alto")
  .transform((n) => Math.round(n * 100) / 100);
