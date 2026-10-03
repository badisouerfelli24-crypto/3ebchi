import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { getBarber, isOwner } from "@/config/site";

export const dynamic = "force-dynamic";

// Marque une réservation 'done' ou 'cancelled'.
// Annuler libère automatiquement le créneau (status != 'confirmed').
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionBarber = verifySessionToken(token);
  if (!sessionBarber || !getBarber(sessionBarber)) {
    return NextResponse.json({ ok: false, message: "Non authentifié" }, { status: 401 });
  }

  let body: { id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Requête invalide" }, { status: 400 });
  }

  const id = String(body.id || "");
  const action = String(body.action || "");
  if (!id || !["done", "cancel"].includes(action)) {
    return NextResponse.json({ ok: false, message: "Action invalide" }, { status: 400 });
  }
  const newStatus = action === "done" ? "done" : "cancelled";

  try {
    const sb = supabaseAdmin();

    // Récupère la réservation pour vérifier la propriété.
    const { data: booking, error: findErr } = await sb
      .from("bookings")
      .select("id, barber")
      .eq("id", id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!booking) {
      return NextResponse.json({ ok: false, message: "Introuvable" }, { status: 404 });
    }

    // Un barbier ne touche QUE ses réservations (sauf le owner).
    if (booking.barber !== sessionBarber && !isOwner(sessionBarber)) {
      return NextResponse.json({ ok: false, message: "Interdit" }, { status: 403 });
    }

    const { error: updErr } = await sb
      .from("bookings")
      .update({ status: newStatus })
      .eq("id", id);
    if (updErr) throw updErr;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("action error", e);
    return NextResponse.json({ ok: false, message: "Erreur serveur" }, { status: 500 });
  }
}
