import { NextRequest, NextResponse } from "next/server";
import { getBarber } from "@/config/site";
import { attemptLogin, setSessionCookie } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { readJsonBody, isSameOrigin } from "@/lib/requestGuards";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req, { requireOrigin: true })) {
    return NextResponse.json({ ok: false, message: "Requête invalide" }, { status: 403, headers: NO_STORE });
  }
  // Bornes AVANT tout travail coûteux.
  const body = await readJsonBody(req, 2 * 1024);
  if (!body) {
    return NextResponse.json({ ok: false, message: "Requête invalide" }, { status: 400, headers: NO_STORE });
  }
  // Filtre mémoire bon marché par instance (la limite qui compte est en base).
  if (!rateLimit(`login:${clientIp(req.headers)}`, 30, 60 * 1000)) {
    return NextResponse.json({ ok: false, locked: true, message: "Trop d'essais. 3awed ba3d 1 min." }, { status: 429, headers: NO_STORE });
  }

  const barberId = typeof body.barber === "string" && body.barber.length <= 32 ? body.barber : "";
  const result = await attemptLogin(req, barberId, body.password);

  if (result.kind === "locked") {
    return NextResponse.json(
      { ok: false, locked: true, message: `Trop d'essais. 3awed ba3d ${Math.ceil(result.retryAfter / 60)} min.` },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(result.retryAfter) } }
    );
  }
  if (result.kind === "unavailable") {
    // Limiteur/base indisponible : on refuse plutôt que d'autoriser des essais illimités.
    return NextResponse.json({ ok: false, message: "Mochkla réseau" }, { status: 503, headers: NO_STORE });
  }
  if (result.kind === "invalid") {
    // Même réponse pour : compte inconnu, mauvais mot de passe, compte sans mot de passe/désactivé.
    return NextResponse.json({ ok: false, message: "Mot de passe ghalet 😤" }, { status: 401, headers: NO_STORE });
  }

  const barber = getBarber(barberId)!;
  const res = NextResponse.json(
    { ok: true, barber: { id: barber.id, name: barber.name, isOwner: !!barber.isOwner } },
    { headers: NO_STORE }
  );
  setSessionCookie(res, result.token);
  return res;
}
