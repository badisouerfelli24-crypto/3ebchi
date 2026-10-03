import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { getBarber } from "@/config/site";

export const dynamic = "force-dynamic";

// Crée un blocage (pause / absence) pour le barbier connecté.
// Body : { date, fullDay?: boolean, start_time?, end_time?, reason? }
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionBarber = verifySessionToken(token);
  if (!sessionBarber || !getBarber(sessionBarber)) {
    return NextResponse.json({ ok: false, message: "Non authentifié" }, { status: 401 });
  }

  let body: {
    date?: string;
    fullDay?: boolean;
    start_time?: string;
    end_time?: string;
    reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Requête invalide" }, { status: 400 });
  }

  const date = String(body.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, message: "Date invalide" }, { status: 400 });
  }

  let start = "00:00";
  let end = "23:59";
  if (!body.fullDay) {
    start = String(body.start_time || "");
    end = String(body.end_time || "");
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start) {
      return NextResponse.json({ ok: false, message: "Plage horaire invalide" }, { status: 400 });
    }
  }

  try {
    const sb = supabaseAdmin();
    const { error } = await sb.from("blocked_slots").insert({
      barber: sessionBarber,
      date,
      start_time: start,
      end_time: end,
      reason: String(body.reason || "").slice(0, 120),
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("block error", e);
    return NextResponse.json({ ok: false, message: "Erreur serveur" }, { status: 500 });
  }
}

// Supprime un blocage : DELETE ?id=...
export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionBarber = verifySessionToken(token);
  if (!sessionBarber || !getBarber(sessionBarber)) {
    return NextResponse.json({ ok: false, message: "Non authentifié" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "";
  if (!id) {
    return NextResponse.json({ ok: false, message: "id manquant" }, { status: 400 });
  }

  try {
    const sb = supabaseAdmin();
    // On ne supprime que ses propres blocages.
    const { error } = await sb
      .from("blocked_slots")
      .delete()
      .eq("id", id)
      .eq("barber", sessionBarber);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("unblock error", e);
    return NextResponse.json({ ok: false, message: "Erreur serveur" }, { status: 500 });
  }
}
