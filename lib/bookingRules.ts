/* Règles de réservation CÔTÉ SERVEUR (source d'autorité), construites sur les
   mêmes fonctions que l'interface (config/site.ts, lib/slots.ts, lib/time.ts) :
   aucune nouvelle règle métier n'est inventée.
   - date réelle (pas de 30 février), dans la fenêtre BOOKING_WINDOW_DAYS
     proposée par le formulaire, jour ouvert ;
   - heure HH:MM réelle, exactement un créneau que generateSlots() proposerait
     (grille, ouverture/fermeture, fin du service, heures passées aujourd'hui) ;
   - prix/durée/nom du service pris dans la configuration, jamais du client. */

import { BOOKING_WINDOW_DAYS, getBarber, getService, type Barber, type Service } from "@/config/site";
import { generateSlots, shouldHidePast, isClosedDay } from "@/lib/slots";
import { nextDays } from "@/lib/time";
import { normalizeTunisianPhone, isValidName, sanitizeNote } from "@/lib/validation";
import { UUID_RE } from "@/lib/requestGuards";

/** "YYYY-MM-DD" strict : rejette 2027-02-30, 2026-13-01, etc. */
export function parseIsoDate(s: unknown): string | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? s : null;
}

/** "HH:MM" strict (00:00–23:59). */
export function parseHHMM(s: unknown): string | null {
  if (typeof s !== "string" || !/^\d{2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(":").map(Number);
  return h <= 23 && m <= 59 ? s : null;
}

/** Jours réservables : exactement ceux proposés par le formulaire. */
export function bookableDays(): string[] {
  return nextDays(BOOKING_WINDOW_DAYS).filter((d) => !isClosedDay(d));
}

/** Date valide pour consulter les disponibilités (même fenêtre que la réservation). */
export function isBookableDate(date: string): boolean {
  return bookableDays().includes(date);
}

/** Le créneau est-il un de ceux que l'interface proposerait (hors occupation) ? */
export function isOfferedSlot(date: string, time: string, service: Service): boolean {
  return generateSlots(date, service.durationMin, [], shouldHidePast(date)).some((s) => s.time === time);
}

export type ValidBooking = {
  barber: Barber;
  service: Service;
  date: string;
  time: string;
  name: string;
  phone: string;
  note: string;
  requestKey: string | null;
};

function cleanText(s: string): string {
  // retire les caractères de contrôle (garde les retours à la ligne de la note)
  return s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim();
}

/** Valide un corps de requête de réservation. Messages = textes déjà existants. */
export function validateBooking(body: Record<string, unknown>): { ok: true; value: ValidBooking } | { ok: false; message: string } {
  const str = (k: string, max: number) => {
    const v = body[k];
    return typeof v === "string" && v.length <= max ? v : null;
  };
  const barber = getBarber(str("barber", 32) || "");
  if (!barber) return { ok: false, message: "Barber inconnu" };
  const service = getService(str("service", 64) || "");
  if (!service) return { ok: false, message: "Service inconnu" };

  const date = parseIsoDate(body.date);
  if (!date) return { ok: false, message: "Date invalide" };
  const time = parseHHMM(body.time);
  if (!time) return { ok: false, message: "Heure invalide" };

  const rawName = str("name", 200);
  const name = rawName === null ? "" : cleanText(rawName).replace(/\s+/g, " ");
  if (!isValidName(name)) return { ok: false, message: "Nom invalide" };
  const rawPhone = str("phone", 32);
  const phone = rawPhone === null ? null : normalizeTunisianPhone(rawPhone);
  if (!phone) return { ok: false, message: "Numéro invalide" };
  const rawNote = body.note === undefined || body.note === null ? "" : str("note", 2000);
  if (rawNote === null) return { ok: false, message: "Requête invalide" };
  const note = sanitizeNote(cleanText(rawNote));

  let requestKey: string | null = null;
  if (body.requestKey !== undefined && body.requestKey !== null) {
    if (typeof body.requestKey !== "string" || !UUID_RE.test(body.requestKey)) return { ok: false, message: "Requête invalide" };
    requestKey = body.requestKey.toLowerCase();
  }

  if (!bookableDays().includes(date)) {
    return { ok: false, message: isClosedDay(date) ? "Salon fermé ce jour" : "Date invalide" };
  }
  if (!isOfferedSlot(date, time, service)) return { ok: false, message: "Hors horaires d'ouverture" };

  return { ok: true, value: { barber, service, date, time, name, phone, note, requestKey } };
}
