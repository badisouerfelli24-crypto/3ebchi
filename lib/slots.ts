/* Logique de créneaux (créneaux de 30 min par défaut), fuseau Tunis.
   Un service plus long qu'un créneau occupe plusieurs créneaux consécutifs. */

import { HOURS, SLOT_MINUTES } from "@/config/site";
import { toMinutes, toHHMM, weekdayOf, todayTunis, nowMinutesTunis } from "@/lib/time";

export type Interval = { startMin: number; endMin: number };

export type Slot = {
  time: string; // "HH:MM"
  available: boolean;
  reason?: "Ma3mour" | "closed";
};

/** Horaires d'un jour donné ("YYYY-MM-DD"), ou null si fermé. */
export function dayWindow(dateStr: string): { openMin: number; closeMin: number } | null {
  const wd = weekdayOf(dateStr);
  const h = HOURS.find((x) => x.day === wd);
  if (!h || h.closed || !h.open || !h.close) return null;
  return { openMin: toMinutes(h.open), closeMin: toMinutes(h.close) };
}

export function isClosedDay(dateStr: string): boolean {
  return dayWindow(dateStr) === null;
}

/** Deux intervalles se chevauchent-ils ? */
function overlaps(a: Interval, b: Interval): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

/**
 * Génère les créneaux disponibles pour un service d'une durée donnée.
 * @param dateStr       jour cible "YYYY-MM-DD"
 * @param serviceMinutes durée du service choisi (min)
 * @param busy          intervalles déjà pris (réservations + blocages) pour CE barbier
 * @param hidePast      true pour le jour courant (masque les heures passées)
 */
export function generateSlots(
  dateStr: string,
  serviceMinutes: number,
  busy: Interval[],
  hidePast: boolean
): Slot[] {
  const win = dayWindow(dateStr);
  if (!win) return [];

  const needSlots = Math.max(1, Math.ceil(serviceMinutes / SLOT_MINUTES));
  const span = needSlots * SLOT_MINUTES;
  const nowMin = nowMinutesTunis();

  const slots: Slot[] = [];
  for (let start = win.openMin; start + SLOT_MINUTES <= win.closeMin; start += SLOT_MINUTES) {
    const end = start + span;

    // Le service dépasse la fermeture -> pas proposable
    if (end > win.closeMin) {
      continue;
    }

    // Jour courant : masquer les heures déjà passées
    if (hidePast && start <= nowMin) {
      continue;
    }

    const candidate: Interval = { startMin: start, endMin: end };
    const taken = busy.some((b) => overlaps(candidate, b));

    slots.push({
      time: toHHMM(start),
      available: !taken,
      reason: taken ? "Ma3mour" : undefined,
    });
  }
  return slots;
}

/** Faut-il masquer le passé pour cette date ? (vrai si c'est aujourd'hui) */
export function shouldHidePast(dateStr: string): boolean {
  return dateStr === todayTunis();
}
