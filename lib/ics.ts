/* Génération d'un fichier .ics (Add to calendar) pour une réservation.
   On utilise l'heure locale Tunis avec TZID Africa/Tunis. */

import { SITE } from "@/config/site";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** date "YYYY-MM-DD" + time "HH:MM" -> "YYYYMMDDTHHMMSS" (heure locale). */
function toIcsLocal(dateStr: string, hhmm: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`;
}

function addMinutes(dateStr: string, hhmm: string, minutes: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, hh, mm));
  base.setUTCMinutes(base.getUTCMinutes() + minutes);
  return `${base.getUTCFullYear()}${pad(base.getUTCMonth() + 1)}${pad(
    base.getUTCDate()
  )}T${pad(base.getUTCHours())}${pad(base.getUTCMinutes())}00`;
}

export function buildIcs(opts: {
  date: string;
  startTime: string;
  durationMin: number;
  barber: string;
  service: string;
}): string {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@3ebchistyle`;
  const dtStart = toIcsLocal(opts.date, opts.startTime);
  const dtEnd = addMinutes(opts.date, opts.startTime, opts.durationMin);
  const stamp =
    new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//3ebchi style//Booking//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${SITE.timezone}:${dtStart}`,
    `DTEND;TZID=${SITE.timezone}:${dtEnd}`,
    `SUMMARY:${escapeIcs(`${SITE.name} ${SITE.emoji} — ${opts.service} (${opts.barber})`)}`,
    `DESCRIPTION:${escapeIcs(`${opts.service} m3a ${opts.barber}. ${SITE.subline}`)}`,
    `LOCATION:${escapeIcs(SITE.city)}`,
    `URL:${SITE.mapsUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
