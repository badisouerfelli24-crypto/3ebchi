import { NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBarber, getService } from "@/config/site";
import { normalizeTunisianPhone, isValidName, sanitizeNote } from "@/lib/validation";
import { isClosedDay, dayWindow } from "@/lib/slots";
import { todayTunis, toMinutes } from "@/lib/time";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { notifyNewBooking } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: "VALIDATION", message: "Requête invalide" }, { status: 400 });
  }

  // Honeypot : un bot remplit souvent tous les champs cachés.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    // on fait semblant d'accepter (rien n'est enregistré)
    return NextResponse.json({ ok: true, id: "ignored", ref: "3B-" + Math.random().toString(36).slice(2, 8).toUpperCase() });
  }

  // Rate limit : max 5 réservations / 10 min / IP
  const ip = clientIp(req.headers);
  if (!rateLimit(`book:${ip}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMIT", message: "Trop de tentatives" },
      { status: 429 }
    );
  }

  const barberId = String(body.barber || "");
  const serviceId = String(body.service || "");
  const date = String(body.date || "");
  const time = String(body.time || "");
  const name = String(body.name || "");
  const phoneRaw = String(body.phone || "");
  const note = sanitizeNote(typeof body.note === "string" ? body.note : "");

  // --- Validations ---
  const barber = getBarber(barberId);
  const service = getService(serviceId);
  const phone = normalizeTunisianPhone(phoneRaw);

  if (!barber) return bad("Barber inconnu");
  if (!service) return bad("Service inconnu");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("Date invalide");
  if (!/^\d{2}:\d{2}$/.test(time)) return bad("Heure invalide");
  if (!isValidName(name)) return bad("Nom invalide");
  if (!phone) return bad("Numéro invalide");
  if (date < todayTunis()) return bad("Date dans le passé");
  if (isClosedDay(date)) return bad("Salon fermé ce jour");

  // Le créneau doit tomber dans les horaires d'ouverture
  const win = dayWindow(date);
  const startMin = toMinutes(time);
  if (!win || startMin < win.openMin || startMin + service.durationMin > win.closeMin) {
    return bad("Hors horaires d'ouverture");
  }

  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb.rpc("create_booking", {
      p_barber: barber.id,
      p_service: service.name,
      p_price: service.price,
      p_duration_min: service.durationMin,
      p_date: date,
      p_start_time: time,
      p_client_name: name.trim(),
      p_phone: phone,
      p_note: note,
    });

    if (error) {
      // 'SLOT_TAKEN' levé par la fonction (conflit / créneau bloqué)
      const msg = `${error.message || ""}`;
      if (msg.includes("SLOT_TAKEN")) {
        return NextResponse.json(
          { ok: false, code: "SLOT_TAKEN", message: "Créneau déjà pris" },
          { status: 409 }
        );
      }
      console.error("book rpc error", error);
      return NextResponse.json(
        { ok: false, code: "SERVER", message: "Erreur serveur" },
        { status: 500 }
      );
    }

    const row = data as { id?: string; ref?: string } | null;

    // Notification push au barbier (et au owner), après la réponse au client :
    // un échec d'envoi ne doit jamais faire échouer la réservation.
    after(() =>
      notifyNewBooking({
        barber: barber.id,
        service: service.name,
        price: service.price,
        date,
        time,
        client: name.trim(),
      }).catch((e) => console.error("notify error", e))
    );

    return NextResponse.json({ ok: true, id: row?.id, ref: row?.ref });
  } catch (e) {
    console.error("book error", e);
    return NextResponse.json(
      { ok: false, code: "SERVER", message: "Erreur serveur" },
      { status: 500 }
    );
  }
}

function bad(message: string) {
  return NextResponse.json({ ok: false, code: "VALIDATION", message }, { status: 400 });
}
