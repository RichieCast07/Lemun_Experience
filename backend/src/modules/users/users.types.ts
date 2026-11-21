export const ROLES = ["ADMIN", "RP", "MANAGER"] as const;
export type Rol = (typeof ROLES)[number];

export interface Usuario {
  id: number;
  nombre_completo: string;
  telefono: string;
  username: string;
  rol: Rol;
  comision_porcentaje: number;
  activo: boolean;
  creado_en: Date;
}

/** Columnas públicas (jamás incluye password_hash). */
export const USER_COLUMNS = `id, nombre_completo, telefono, username, rol, comision_porcentaje, activo, creado_en`;
