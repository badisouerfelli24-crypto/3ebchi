/* Session + portée (scope) pour les routes du dashboard hajem.
   - Un barbier ne voit QUE ses propres réservations.
   - Le owner (3EBCHI) peut voir "shop" (toute la boutique) ou n'importe quel
     barbier, chacun séparément. */

import "server-only";
import type { NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { getBarber, isOwner, BARBERS, type Barber } from "@/config/site";

export function sessionBarber(req: NextRequest): Barber | null {
  const id = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  return id ? getBarber(id) ?? null : null;
}

/** Portée demandée -> "shop" | id barbier, ou null si interdite. */
export function resolveScope(me: Barber, requested: string | null): string | null {
  const s = requested || me.id;
  if (s === me.id) return s;
  if (!isOwner(me.id)) return null;
  if (s === "shop" || BARBERS.some((b) => b.id === s)) return s;
  return null;
}

/** Heure actuelle à Tunis "HH:MM". */
export function nowHHMMTunis(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Tunis",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .replace(/^24/, "00");
}
