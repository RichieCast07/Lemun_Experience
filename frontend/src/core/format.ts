// Zona horaria con la que se muestran las fechas del negocio.
export const APP_TIMEZONE = "America/Mexico_City";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const moneyRound = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("es-MX");

export const formatMoney = (n: number | string | null | undefined) => money.format(Number(n ?? 0));
export const formatMoneyShort = (n: number | string | null | undefined) => moneyRound.format(Number(n ?? 0));
export const formatInt = (n: number | string | null | undefined) => int.format(Number(n ?? 0));

const dateTime = new Intl.DateTimeFormat("es-MX", {
  timeZone: APP_TIMEZONE, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});
const dateOnly = new Intl.DateTimeFormat("es-MX", { timeZone: APP_TIMEZONE, day: "2-digit", month: "short", year: "numeric" });
const longDate = new Intl.DateTimeFormat("es-MX", {
  timeZone: APP_TIMEZONE, weekday: "long", day: "numeric", month: "long", year: "numeric",
});
const timeOnly = new Intl.DateTimeFormat("es-MX", { timeZone: APP_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });

export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : "—");
export const formatDate = (iso: string | null | undefined) => (iso ? dateOnly.format(new Date(iso)) : "—");
export const formatLongDate = (iso: string | null | undefined) => (iso ? longDate.format(new Date(iso)) : "—");
export const formatTime = (iso: string | null | undefined) => (iso ? timeOnly.format(new Date(iso)) : "—");

/** ISO → valor para <input type="datetime-local"> (hora local del navegador). */
export function toDatetimeLocal(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor de <input type="datetime-local"> → ISO UTC. */
export function fromDatetimeLocal(value: string): string {
  return new Date(value).toISOString();
}

/** Teléfono para mostrar: 5512345678 → 55 1234 5678 */
export function formatPhone(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
  return raw ?? "";
}

export const onlyDigits = (v: string) => v.replace(/\D/g, "");

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
