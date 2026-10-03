import { NextRequest, NextResponse } from "next/server";
import { getBarber } from "@/config/site";
import {
  verifyPin,
  createSessionToken,
  SESSION_COOKIE,
  isLockedOut,
  recordFailure,
  clearFailures,
} from "@/lib/auth";
import { clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { barber?: string; pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Requête invalide" }, { status: 400 });
  }

  const barberId = String(body.barber || "");
  const pin = String(body.pin || "");
  const barber = getBarber(barberId);

  if (!barber) {
    return NextResponse.json({ ok: false, message: "Barber inconnu" }, { status: 400 });
  }

  const ip = clientIp(req.headers);
  const lockKey = `login:${ip}:${barberId}`;

  const locked = isLockedOut(lockKey);
  if (locked > 0) {
    return NextResponse.json(
      { ok: false, locked: true, message: `Trop d'essais. 3awed ba3d ${Math.ceil(locked / 60)} min.` },
      { status: 429 }
    );
  }

  const ok = await verifyPin(barberId, pin);
  if (!ok) {
    recordFailure(lockKey);
    return NextResponse.json(
      { ok: false, message: "PIN ghalet 😤" },
      { status: 401 }
    );
  }

  clearFailures(lockKey);
  const token = createSessionToken(barberId);
  const res = NextResponse.json({
    ok: true,
    barber: { id: barber.id, name: barber.name, isOwner: !!barber.isOwner },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
