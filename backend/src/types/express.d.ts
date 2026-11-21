import type { Rol } from "../modules/users/users.types.js";

export interface AuthUser {
  id: number;
  username: string;
  nombre_completo: string;
  rol: Rol;
  comision_porcentaje: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
