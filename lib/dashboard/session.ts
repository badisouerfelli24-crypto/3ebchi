/* Session + portée (scope) pour les routes du dashboard hajem.
   - La session est vérifiée CÔTÉ SERVEUR à chaque requête (lib/auth.ts :
     jeton opaque, révocable, expiration, compte actif, mot de passe inchangé).
   - Un barbier ne voit QUE ses propres réservations.
   - Le owner (3EBCHI) peut voir "shop" (toute la boutique) ou n'importe quel
     barbier, chacun séparément. Le rôle owner vient de la session (base ET
     config/site.ts), jamais du navigateur. */

import "server-only";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getBarber, BARBERS, type Barber } from "@/config/site";

export type SessionBarber = Barber & { sessionIsOwner: boolean };

export async function sessionBarber(req: NextRequest): Promise<SessionBarber | null> {
  const s = await getSession(req);
  if (!s) return null;
  const b = getBarber(s.barberId);
  return b ? { ...b, sessionIsOwner: s.isOwner } : null;
}

/** Portée demandée -> "shop" | id barbier, ou null si interdite. */
export function resolveScope(me: SessionBarber, requested: string | null): string | null {
  const s = requested || me.id;
  if (s === me.id) return s;
  if (!me.sessionIsOwner) return null;
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
