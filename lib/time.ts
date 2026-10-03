/* Helpers de temps, tout en fuseau Africa/Tunis.
   On évite toute dépendance externe : on s'appuie sur Intl.DateTimeFormat. */

import { SITE } from "@/config/site";

const TZ = SITE.timezone;

/** Parties year/month/day/hour/minute/weekday d'une Date dans le fuseau Tunis. */
function tunisParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value])
  ) as Record<string, string>;
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === "24" ? "00" : parts.hour,
    minute: parts.minute,
    weekday: parts.weekday,
  };
}

/** Date du jour à Tunis au format "YYYY-MM-DD". */
export function todayTunis(): string {
  const p = tunisParts(new Date());
  return `${p.year}-${p.month}-${p.day}`;
}

/** Heure actuelle à Tunis en minutes depuis minuit (pour masquer les créneaux passés). */
export function nowMinutesTunis(): number {
  const p = tunisParts(new Date());
  return parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10);
}

/** Jour de la semaine (0=Dim..6=Sam) pour une date "YYYY-MM-DD".
   Indépendant du fuseau machine car on fixe midi UTC. */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

/** "HH:MM" -> minutes depuis minuit. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** minutes depuis minuit -> "HH:MM". */
export function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Les N prochains jours (à partir d'aujourd'hui Tunis) au format "YYYY-MM-DD". */
export function nextDays(n: number): string[] {
  const out: string[] = [];
  const today = todayTunis();
  const [y, m, d] = today.split("-").map(Number);
  for (let i = 0; i < n; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i, 12));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    out.push(`${yy}-${mm}-${dd}`);
  }
  return out;
}

const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** "YYYY-MM-DD" -> "Mardi 7 octobre" (français). */
export function labelDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = weekdayOf(dateStr);
  return `${JOURS[wd]} ${d} ${MOIS[m - 1]}`;
}

/** "YYYY-MM-DD" -> "7/10" (court, pour les boutons). */
export function labelDateShort(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${d}/${m}`;
}
