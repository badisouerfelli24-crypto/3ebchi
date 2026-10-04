import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { BARBERS, isOwner } from "@/config/site";
import { sessionBarber } from "@/lib/dashboard/session";

export const dynamic = "force-dynamic";

// GET /api/barber/feed?since=<ISO>
// Nouvelles réservations reçues depuis `since`, pour les alertes dans l'app
// (toast + son) quand le dashboard est ouvert. Mêmes destinataires que le push :
// les siennes, plus celles de l'équipe pour le owner (sauf barbiers coupés).
export async function GET(req: NextRequest) {
  const me = sessionBarber(req);
  if (!me) return NextResponse.json({ ok: false, message: "Non authentifié" }, { status: 401 });

  const now = new Date().toISOString();
  const sinceRaw = new URL(req.url).searchParams.get("since") || "";
  const since = Date.parse(sinceRaw);
  // Premier appel (ou date invalide / trop ancienne) : on renvoie juste le curseur.
  if (!Number.isFinite(since) || Date.now() - since > 24 * 3600 * 1000) {
    return NextResponse.json({ ok: true, now, items: [] });
  }

  try {
    const sb = supabaseAdmin();
    let barbers = [me.id];
    if (isOwner(me.id)) {
      const { data, error } = await sb
        .from("notification_prefs")
        .select("muted_team")
        .eq("barber", me.id)
        .maybeSingle();
      if (error) throw error;
      const muted = new Set((data?.muted_team as string[] | undefined) ?? []);
      barbers = BARBERS.map((b) => b.id).filter((id) => id === me.id || !muted.has(id));
    }

    const { data, error } = await sb
      .from("bookings")
      .select("id, barber, service, price, date, start_time, client_name, created_at")
      .in("barber", barbers)
      .gt("created_at", new Date(since).toISOString())
      .lte("created_at", now)
      .order("created_at", { ascending: true })
      .limit(20);
    if (error) throw error;
    return NextResponse.json({ ok: true, now, items: data || [] });
  } catch (e) {
    console.error("feed error", e);
    return NextResponse.json({ ok: false, message: "Erreur serveur" }, { status: 500 });
  }
}
