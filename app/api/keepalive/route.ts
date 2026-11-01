import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/* Appelé une fois par jour par Vercel Cron (voir vercel.json).
   Supabase (plan gratuit) met le projet en pause après quelques jours sans
   activité : la base devient injoignable, la connexion répond « PIN ghalet »
   et les réservations échouent. Une petite lecture quotidienne l'en empêche.
   Ne renvoie aucune donnée. Si CRON_SECRET est défini sur Vercel, seul l'appel
   planifié (Authorization: Bearer <CRON_SECRET>) est accepté. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const { error } = await supabaseAdmin().from("barbers").select("id", { count: "exact", head: true });
  return NextResponse.json({ ok: !error }, { status: error ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
