import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { BARBERS } from "@/config/site";
import { todayTunis } from "@/lib/time";
import { sessionBarber, resolveScope, nowHHMMTunis } from "@/lib/dashboard/session";
import { buildStats, type Row } from "@/lib/dashboard/metrics";

export const dynamic = "force-dynamic";

const PAGE = 1000; // limite de lignes par requête PostgREST

// GET /api/barber/stats?scope=shop|<barberId>
export async function GET(req: NextRequest) {
  const me = sessionBarber(req);
  if (!me) {
    return NextResponse.json({ ok: false, message: "Non authentifié" }, { status: 401 });
  }
  const scope = resolveScope(me, new URL(req.url).searchParams.get("scope"));
  if (!scope) {
    return NextResponse.json({ ok: false, message: "Interdit" }, { status: 403 });
  }

  try {
    const sb = supabaseAdmin();
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = sb
        .from("bookings")
        .select("barber, date, start_time, status, price")
        .order("date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (scope !== "shop") q = q.eq("barber", scope);
      const { data, error } = await q;
      if (error) throw error;
      rows.push(...((data || []) as Row[]));
      if (!data || data.length < PAGE) break;
    }

    const stats = buildStats(rows, {
      scope,
      today: todayTunis(),
      nowHHMM: nowHHMMTunis(),
      barberIds: scope === "shop" ? BARBERS.map((b) => b.id) : null,
    });
    return NextResponse.json({ ok: true, ...stats });
  } catch (e) {
    console.error("stats error", e);
    return NextResponse.json({ ok: false, message: "Erreur serveur" }, { status: 500 });
  }
}
