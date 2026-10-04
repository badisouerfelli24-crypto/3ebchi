import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { todayTunis } from "@/lib/time";
import { sessionBarber, resolveScope } from "@/lib/dashboard/session";
import { addDays } from "@/lib/dashboard/metrics";

export const dynamic = "force-dynamic";

const COLS =
  "id, ref, barber, service, price, duration_min, date, start_time, client_name, phone, note, status, created_at";

// GET /api/barber/agenda?scope=shop|<barberId>
// Réservations à clôturer (passées sans issue), d'aujourd'hui, à venir et
// récemment clôturées. Les blocages ne sont renvoyés que pour son propre agenda.
export async function GET(req: NextRequest) {
  const me = await sessionBarber(req);
  if (!me) {
    return NextResponse.json({ ok: false, message: "Non authentifié" }, { status: 401 });
  }
  const scope = resolveScope(me, new URL(req.url).searchParams.get("scope"));
  if (!scope) {
    return NextResponse.json({ ok: false, message: "Interdit" }, { status: 403 });
  }

  const today = todayTunis();
  const sb = supabaseAdmin();
  const base = () => {
    const q = sb.from("bookings").select(COLS);
    return scope === "shop" ? q : q.eq("barber", scope);
  };

  try {
    const [toSettle, todays, upcoming, recent, blocked] = await Promise.all([
      base()
        .eq("status", "confirmed")
        .lt("date", today)
        .gte("date", addDays(today, -60))
        .order("date", { ascending: false })
        .order("start_time", { ascending: true }),
      base().eq("date", today).order("start_time", { ascending: true }),
      base()
        .eq("status", "confirmed")
        .gt("date", today)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(300),
      base()
        .neq("status", "confirmed")
        .lt("date", today)
        .gte("date", addDays(today, -14))
        .order("date", { ascending: false })
        .order("start_time", { ascending: false })
        .limit(100),
      scope === me.id
        ? sb
            .from("blocked_slots")
            .select("id, barber, date, start_time, end_time, reason")
            .eq("barber", me.id)
            .gte("date", today)
            .order("date", { ascending: true })
            .order("start_time", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);
    for (const r of [toSettle, todays, upcoming, recent, blocked]) if (r.error) throw r.error;

    return NextResponse.json({
      ok: true,
      scope,
      today,
      toSettle: toSettle.data,
      todays: todays.data,
      upcoming: upcoming.data,
      recent: recent.data,
      blocked: blocked.data,
    });
  } catch (e) {
    console.error("agenda error", e);
    return NextResponse.json({ ok: false, message: "Erreur serveur" }, { status: 500 });
  }
}
