// El calendario de verdad: la partida empieza en una fecha (la de hoy, al crearla) y cada día de juego
// es un día del calendario. De ahí salen el día de la semana, el mes, la estación y las fiestas.
// Puro: sin mundo ni estado (las cuentas, en UTC, para que el cambio de hora no descuadre nada).

export interface GameDate {
  y: number;
  /** Mes, de 1 a 12. */
  m: number;
  /** Día del mes. */
  d: number;
  /** Día de la semana: 0 = lunes ... 6 = domingo. */
  wd: number;
  /** Estación: 0 primavera, 1 verano, 2 otoño, 3 invierno. */
  season: number;
}

const DAY_MS = 86_400_000;
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «2026-11-17» de hoy (fecha local del móvil). */
export function todayISO(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** ¿Es una fecha «AAAA-MM-DD» válida? */
export function isISODate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return new Date(t).toISOString().slice(0, 10) === s;
}

const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** Estación de una fecha (las de los astrónomos, redondeadas: 21/3, 21/6, 23/9 y 21/12). */
export function seasonOf(m: number, d: number): number {
  const md = m * 100 + d;
  if (md >= 321 && md < 621) return 0;
  if (md >= 621 && md < 923) return 1;
  if (md >= 923 && md < 1221) return 2;
  return 3;
}

/** La fecha del día `day` (1 = el día en que empezó la partida). */
export function dateOfDay(start: string, day: number): GameDate {
  const t = new Date(utc(start) + (day - 1) * DAY_MS);
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, d = t.getUTCDate();
  return { y, m, d, wd: (t.getUTCDay() + 6) % 7, season: seasonOf(m, d) };
}

/** El día de juego de una fecha (puede ser anterior a la partida: entonces sale 0 o negativo). */
export function dayOfDate(start: string, y: number, m: number, d: number): number {
  return Math.round((Date.UTC(y, m - 1, d) - utc(start)) / DAY_MS) + 1;
}

/** Fecha de inicio para que el día `day` caiga en `today` (al pasar una partida antigua al calendario de verdad). */
export function startFor(today: string, day: number): string {
  return new Date(utc(today) - (day - 1) * DAY_MS).toISOString().slice(0, 10);
}

/** Domingo de Resurrección (algoritmo de Butcher, calendario gregoriano). */
export function easter(y: number): { m: number; d: number } {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return { m: month, d: day };
}

/** Desplaza una fecha `n` días. */
export function addDays(y: number, m: number, d: number, n: number): { y: number; m: number; d: number } {
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** El sábado de Carnaval (el del desfile): 50 días antes de Pascua. */
export function carnivalOf(y: number): { m: number; d: number } {
  const e = easter(y);
  const c = addDays(y, e.m, e.d, -50);
  return { m: c.m, d: c.d };
}

/** Último domingo de mayo (elecciones). */
export function electionDayOf(y: number): number {
  for (let d = 31; d > 24; d--) if ((new Date(Date.UTC(y, 4, d)).getUTCDay() + 6) % 7 === 6) return d;
  return 31;
}

/** «17 nov». */
export function shortDate(g: GameDate): string {
  return `${g.d} ${MONTHS_SHORT[g.m - 1]}`;
}

/** «17 de noviembre». */
export function longDate(g: GameDate): string {
  return `${g.d} de ${MONTHS[g.m - 1]}`;
}
