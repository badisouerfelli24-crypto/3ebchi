import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { rateLimit, clientIp, clientKey } from "@/lib/rateLimit";
import { readJsonBody, isSameOrigin } from "@/lib/requestGuards";
import { validateBooking } from "@/lib/bookingRules";
import { SECURITY } from "@/lib/securityConfig";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  // Requête d'un autre site (formulaire piégé) => refus. Les clients sans Origin
  // (scripts) restent soumis aux mêmes règles et limites ci-dessous.
  if (!isSameOrigin(req, { requireOrigin: false })) {
    return json({ ok: false, code: "VALIDATION", message: "Requête invalide" }, 403);
  }
  const body = await readJsonBody(req, 4 * 1024);
  if (!body) return json({ ok: false, code: "VALIDATION", message: "Requête invalide" }, 400);

  // Honeypot : un bot remplit souvent tous les champs cachés (rien n'est enregistré).
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return json({ ok: true, id: "ignored", ref: "3B-" + Math.random().toString(36).slice(2, 8).toUpperCase() });
  }

  // Filtre mémoire bon marché (par instance) ; la vraie limite est en base.
  if (!rateLimit(`book:${clientIp(req.headers)}`, 20, 10 * 60 * 1000)) {
    return json({ ok: false, code: "RATE_LIMIT", message: "Trop de tentatives" }, 429);
  }

  const v = validateBooking(body);
  if (!v.ok) return json({ ok: false, code: "VALIDATION", message: v.message }, 400);
  const b = v.value;

  try {
    const { data, error } = await supabaseAdmin().rpc("create_booking_v2", {
      p_barber: b.barber.id,
      // prix, durée et nom viennent de config/site.ts (jamais du navigateur)
      p_service: b.service.name,
      p_price: b.service.price,
      p_duration_min: b.service.durationMin,
      p_date: b.date,
      p_start_time: b.time,
      p_client_name: b.name,
      p_phone: b.phone,
      p_note: b.note,
      p_request_key: b.requestKey,
      p_rate_key: clientKey(req.headers, "book"),
      p_rate_max: SECURITY.bookingIpMax(),
      p_rate_window_secs: SECURITY.bookingIpWindowSecs(),
      p_phone_max_active: SECURITY.bookingMaxActivePerPhone(),
    });
    if (error || !data) {
      console.error("book rpc error", error?.code || "no data");
      return json({ ok: false, code: "SERVER", message: "Erreur serveur" }, 500);
    }
    const r = data as { ok: boolean; code?: string; id?: string; ref?: string };
    if (r.ok) return json({ ok: true, id: r.id, ref: r.ref });

    switch (r.code) {
      case "SLOT_TAKEN":
        return json({ ok: false, code: "SLOT_TAKEN", message: "Créneau déjà pris" }, 409);
      case "RATE_LIMIT":
      case "PHONE_LIMIT":
        // même affichage que la limite existante ("Barcha réservations…")
        return json({ ok: false, code: "RATE_LIMIT", message: "Trop de tentatives" }, 429);
      case "IDEMPOTENCY_MISMATCH":
        return json({ ok: false, code: "VALIDATION", message: "Requête invalide" }, 409);
      default:
        return json({ ok: false, code: "VALIDATION", message: "Requête invalide" }, 400);
    }
  } catch (e) {
    console.error("book error", e instanceof Error ? e.name : "unknown");
    return json({ ok: false, code: "SERVER", message: "Erreur serveur" }, 500);
  }
}
