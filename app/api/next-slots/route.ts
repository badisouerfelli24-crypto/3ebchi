import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { BARBERS, SLOT_MINUTES } from "@/config/site";
import { generateSlots, shouldHidePast, type Interval } from "@/lib/slots";
import { nextDays, toMinutes } from "@/lib/time";

export const dynamic = "force-dynamic";

const DAYS_AHEAD = 7; // on cherche les prochaines places sur 7 jours
const PER_HAJEM = 3; // nombre de créneaux affichés par hajem

/** Prochains créneaux libres (service de base, 1 créneau) pour chaque hajem.
 *  Utilisé par le widget "Live" du hero. Ne renvoie aucune donnée client. */
export async function GET() {
  try {
    const days = nextDays(DAYS_AHEAD);
    const sb = supabaseAdmin();
    const [bk, bl] = await Promise.all([
      sb
        .from("bookings")
        .select("barber, date, start_time, duration_min")
        .gte("date", days[0])
        .lte("date", days[days.length - 1])
        .eq("status", "confirmed"),
      sb
        .from("blocked_slots")
        .select("barber, date, start_time, end_time")
        .gte("date", days[0])
        .lte("date", days[days.length - 1]),
    ]);
    if (bk.error) throw bk.error;
    if (bl.error) throw bl.error;

    const busy = new Map<string, Interval[]>(); // clé "barber|date"
    const push = (k: string, iv: Interval) => {
      if (!busy.has(k)) busy.set(k, []);
      busy.get(k)!.push(iv);
    };
    for (const b of bk.data || []) {
      const s = toMinutes(String(b.start_time).slice(0, 5));
      push(`${b.barber}|${b.date}`, { startMin: s, endMin: s + Number(b.duration_min) });
    }
    for (const b of bl.data || []) {
      push(`${b.barber}|${b.date}`, {
        startMin: toMinutes(String(b.start_time).slice(0, 5)),
        endMin: toMinutes(String(b.end_time).slice(0, 5)),
      });
    }

    const result = BARBERS.map((h) => {
      const slots: { date: string; time: string }[] = [];
      for (const d of days) {
        if (slots.length >= PER_HAJEM) break;
        const free = generateSlots(d, SLOT_MINUTES, busy.get(`${h.id}|${d}`) || [], shouldHidePast(d)).filter(
          (s) => s.available
        );
        for (const s of free) {
          if (slots.length >= PER_HAJEM) break;
          slots.push({ date: d, time: s.time });
        }
      }
      return { barber: h.id, slots };
    });

    return NextResponse.json({ hajema: result, at: new Date().toISOString() });
  } catch (e) {
    console.error("next-slots error", e);
    return NextResponse.json({ message: "Erreur serveur" }, { status: 500 });
  }
}
