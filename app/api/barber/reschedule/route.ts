import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { todayTunis, toMinutes } from "@/lib/time";
import { generateSlots, shouldHidePast, dayWindow, type Interval } from "@/lib/slots";
import { sessionBarber, nowHHMMTunis } from "@/lib/dashboard/session";

export const dynamic = "force-dynamic";

// Reporter une réservation (changer nhar / wa9t).
// Règle : chaque hajem ne reporte QUE ses propres réservations — le owner
// aussi (il ne peut pas reporter celles des autres membres).

const timeToMin = (t: string) => toMinutes(String(t).slice(0, 5));

type Row = { id: string; barber: string; date: string; start_time: string; duration_min: number; status: string };

/** Charge la réservation et vérifie qu'elle peut être reportée par `meId`. */
async function loadOwn(id: string, meId: string): Promise<{ b: Row } | { error: NextResponse }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: fail("Réservation invalide", 400) };
  const { data: b, error } = await supabaseAdmin()
    .from("bookings")
    .select("id, barber, date, start_time, duration_min, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!b) return { error: fail("Introuvable", 404) };
  if (b.barber !== meId) return { error: fail("Tu ne peux reporter que tes réservations", 403) };
  if (b.status !== "confirmed") return { error: fail("Réservation déjà clôturée", 409) };
  const today = todayTunis();
  const started = b.date < today || (b.date === today && String(b.start_time).slice(0, 5) <= nowHHMMTunis());
  if (started) return { error: fail("Le rendez-vous a déjà commencé", 409) };
  return { b: b as Row };
}

/** Intervalles occupés du hajem ce jour-là, sans la réservation reportée. */
async function busyFor(b: Row, date: string): Promise<Interval[]> {
  const sb = supabaseAdmin();
  const [bookings, blocked] = await Promise.all([
    sb.from("bookings").select("id, start_time, duration_min").eq("barber", b.barber).eq("date", date).eq("status", "confirmed").neq("id", b.id),
    sb.from("blocked_slots").select("start_time, end_time").eq("barber", b.barber).eq("date", date),
  ]);
  if (bookings.error) throw bookings.error;
  if (blocked.error) throw blocked.error;
  const busy: Interval[] = [];
  for (const x of bookings.data || []) {
    const s = timeToMin(x.start_time as string);
    busy.push({ startMin: s, endMin: s + (x.duration_min as number) });
  }
  for (const x of blocked.data || []) {
    busy.push({ startMin: timeToMin(x.start_time as string), endMin: timeToMin(x.end_time as string) });
  }
  return busy;
}

// GET ?id=<booking>&date=YYYY-MM-DD -> créneaux possibles pour la reporter.
export async function GET(req: NextRequest) {
  const me = sessionBarber(req);
  if (!me) return fail("Non authentifié", 401);
  const sp = new URL(req.url).searchParams;
  const date = sp.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayTunis()) return fail("Date invalide", 400);

  try {
    const r = await loadOwn(sp.get("id") || "", me.id);
    if ("error" in r) return r.error;
    const slots = generateSlots(date, r.b.duration_min, await busyFor(r.b, date), shouldHidePast(date));
    return NextResponse.json({ ok: true, slots });
  } catch (e) {
    console.error("reschedule slots error", e);
    return fail("Erreur serveur", 500);
  }
}

// POST { id, date, time } -> déplace la réservation.
export async function POST(req: NextRequest) {
  const me = sessionBarber(req);
  if (!me) return fail("Non authentifié", 401);

  let body: { id?: unknown; date?: unknown; time?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("Requête invalide", 400);
  }
  const date = typeof body.date === "string" ? body.date : "";
  const time = typeof body.time === "string" ? body.time : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return fail("Date ou heure invalide", 400);

  try {
    const r = await loadOwn(typeof body.id === "string" ? body.id : "", me.id);
    if ("error" in r) return r.error;
    const b = r.b;

    const today = todayTunis();
    if (date < today || (date === today && time <= nowHHMMTunis())) return fail("Ce créneau est déjà passé", 409);
    const win = dayWindow(date);
    const startMin = toMinutes(time);
    if (!win || startMin < win.openMin || startMin + b.duration_min > win.closeMin) {
      return fail("Hors horaires d'ouverture", 400);
    }
    const busy = await busyFor(b, date);
    if (busy.some((x) => startMin < x.endMin && x.startMin < startMin + b.duration_min)) {
      return fail("Ce créneau est déjà pris", 409);
    }

    // La contrainte d'exclusion protège encore contre une réservation simultanée.
    const { error } = await supabaseAdmin()
      .from("bookings")
      .update({ date, start_time: time })
      .eq("id", b.id)
      .eq("status", "confirmed");
    if (error) {
      if (error.code === "23P01") return fail("Ce créneau est déjà pris", 409);
      throw error;
    }
    return NextResponse.json({ ok: true, date, time });
  } catch (e) {
    console.error("reschedule error", e);
    return fail("Erreur serveur", 500);
  }
}

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}
