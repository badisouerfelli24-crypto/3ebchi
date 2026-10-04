import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getBarber, BARBERS } from "@/config/site";
import { todayTunis, nextDays } from "@/lib/time";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, private" };

export async function GET(req: NextRequest) {
  // Session vérifiée en base à chaque requête (révocation immédiate).
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, message: "Non authentifié" }, { status: 401, headers: NO_STORE });
  }
  const sessionBarber = session.barberId;
  const me = getBarber(sessionBarber)!;

  const { searchParams } = new URL(req.url);
  // "Tous les hajema" : réservé au propriétaire (rôle relu en base à chaque requête).
  const wantAll = searchParams.get("all") === "1" && session.isOwner;

  try {
    const sb = supabaseAdmin();
    const today = todayTunis();

    // Réservations : d'aujourd'hui et à venir, triées.
    let q = sb
      .from("bookings")
      .select("id, ref, barber, service, price, duration_min, date, start_time, client_name, phone, note, status")
      .gte("date", today)
      .neq("status", "cancelled")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    if (!wantAll) q = q.eq("barber", sessionBarber);

    const bookingsRes = await q;
    if (bookingsRes.error) throw bookingsRes.error;

    // Blocages à venir
    let qb = sb
      .from("blocked_slots")
      .select("id, barber, date, start_time, end_time, reason")
      .gte("date", today)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });
    if (!wantAll) qb = qb.eq("barber", sessionBarber);
    const blockedRes = await qb;
    if (blockedRes.error) throw blockedRes.error;

    // Stats (owner uniquement)
    let stats = null;
    if (session.isOwner) {
      const weekDays = nextDays(7);
      const weekStart = weekDays[0];
      const weekEnd = weekDays[weekDays.length - 1];
      const statsRes = await sb
        .from("bookings")
        .select("barber, date, status")
        .gte("date", weekStart)
        .lte("date", weekEnd)
        .neq("status", "cancelled");
      if (statsRes.error) throw statsRes.error;

      const rows = statsRes.data || [];
      const perBarber: Record<string, number> = {};
      let todayCount = 0;
      for (const r of rows) {
        perBarber[r.barber as string] = (perBarber[r.barber as string] || 0) + 1;
        if (r.date === today) todayCount++;
      }
      stats = {
        today: todayCount,
        week: rows.length,
        perBarber: BARBERS.map((b) => ({
          id: b.id,
          name: b.name,
          count: perBarber[b.id] || 0,
        })),
      };
    }

    return NextResponse.json(
      {
        ok: true,
        me: { id: me.id, name: me.name, isOwner: session.isOwner },
        viewingAll: wantAll,
        bookings: bookingsRes.data || [],
        blocked: blockedRes.data || [],
        stats,
      },
      { headers: NO_STORE }
    );
  } catch (e) {
    console.error("bookings error", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ ok: false, message: "Erreur serveur" }, { status: 500, headers: NO_STORE });
  }
}
