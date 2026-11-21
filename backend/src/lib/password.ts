/** Coste de bcrypt: sube el tiempo de cada intento de fuerza bruta (los hashes viejos siguen validando). */
export const BCRYPT_ROUNDS = 12;

/** Política de contraseñas: largo mínimo, nada de claves típicas y nada de usar el propio usuario. */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 100;

const COMMON = new Set([
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

/** Devuelve el motivo si la contraseña es débil, o null si es aceptable. */
export function weakPasswordReason(password: string, username?: string): string | null {
  if (password.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`;
  if (password.length > PASSWORD_MAX) return `La contraseña no puede pasar de ${PASSWORD_MAX} caracteres`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "Esa contraseña es demasiado común. Elige otra";
  if (new Set(lower).size < 5) return "La contraseña es demasiado repetitiva. Elige otra";
  if (username && username.length >= 3 && lower.includes(username.toLowerCase())) {
    return "La contraseña no puede contener el nombre de usuario";
  }
  return null;
}
