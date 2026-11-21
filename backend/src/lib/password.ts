/** Coste de bcrypt: sube el tiempo de cada intento de fuerza bruta (los hashes viejos siguen validando). */
export const BCRYPT_ROUNDS = 12;

/**
 * Política de contraseñas según el rol:
 *  - ADMIN: estricta (12+ caracteres, sin claves comunes ni el propio usuario), porque controla todo el sistema.
 *  - RP / MANAGER: más flexible (6+ caracteres, sin claves comunes), porque las usa personal del evento.
 *    El bloqueo de cuenta (5 fallos = 15 min) y el límite de peticiones frenan la fuerza bruta.
 */
export const PASSWORD_MIN_ADMIN = 12;
export const PASSWORD_MIN_OTHER = 6;
export const PASSWORD_MAX = 100;

const COMMON = new Set([
  // cortas y muy típicas (valen para todos los roles)
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "111111",
  "000000",
  "password",
  "password1",
  "qwerty",
  "qwerty123",
  "abc123",
  "admin123",
  "contrasena",
  "contraseña",
  "lumen123",
  // largas (las que más se prueban contra la política de administrador)
  "cambiaestaclave123!", // la del .env.example
  "contrasena123",
  "contrasena1234",
  "contraseña123",
  "contraseña1234",
  "password1234",
  "password12345",
  "passw0rd1234",
  "administrador",
  "administrador123",
  "administrador1234",
  "123456789012",
  "1234567890123",
  "qwertyuiop12",
  "qwertyuiopas",
  "iloveyou1234",
  "lumen2026!",
  "lumen2026!!",
  "lumenlumen12",
]);

/** Devuelve el motivo si la contraseña es débil para ese rol, o null si es aceptable. */
export function weakPasswordReason(password: string, username?: string, rol: string = "ADMIN"): string | null {
  const isAdmin = rol === "ADMIN";
  const min = isAdmin ? PASSWORD_MIN_ADMIN : PASSWORD_MIN_OTHER;
  if (password.length < min) return `La contraseña debe tener al menos ${min} caracteres`;
  if (password.length > PASSWORD_MAX) return `La contraseña no puede pasar de ${PASSWORD_MAX} caracteres`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "Esa contraseña es demasiado común. Elige otra";
  if (new Set(lower).size < 5) return "La contraseña es demasiado repetitiva. Elige otra";
  // Solo para administradores: la contraseña no puede contener el propio usuario.
  if (isAdmin && username && username.length >= 3 && lower.includes(username.toLowerCase())) {
    return "La contraseña no puede contener el nombre de usuario";
  }
  return null;
}
