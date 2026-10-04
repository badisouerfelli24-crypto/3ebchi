import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { readJsonBody, isSameOrigin, UUID_RE } from "@/lib/requestGuards";
import { parseIsoDate, parseHHMM } from "@/lib/bookingRules";
import { nextDays } from "@/lib/time";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const BLOCK_HORIZON_DAYS = 90; // une absence peut être posée plus loin que la fenêtre de réservation

// Crée un blocage (pause / absence) pour le barbier connecté.
// Body : { date, fullDay?: boolean, start_time?, end_time?, reason? }
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req, { requireOrigin: true })) {
    return NextResponse.json({ ok: false, message: "Requête invalide" }, { status: 403, headers: NO_STORE });
  }
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, message: "Non authentifié" }, { status: 401, headers: NO_STORE });
  }

  const body = await readJsonBody(req, 2 * 1024);
  if (!body) {
    return NextResponse.json({ ok: false, message: "Requête invalide" }, { status: 400, headers: NO_STORE });
  }

  const date = parseIsoDate(body.date);
  if (!date || !nextDays(BLOCK_HORIZON_DAYS).includes(date)) {
    return NextResponse.json({ ok: false, message: "Date invalide" }, { status: 400, headers: NO_STORE });
  }

  let start = "00:00";
  let end = "23:59";
  if (!body.fullDay) {
    const s = parseHHMM(body.start_time);
    const e = parseHHMM(body.end_time);
    if (!s || !e || e <= s) {
      return NextResponse.json({ ok: false, message: "Plage horaire invalide" }, { status: 400, headers: NO_STORE });
    }
    start = s;
    end = e;
  }
  const reason = typeof body.reason === "string" ? body.reason.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 120) : "";

  try {
    // Même verrou par barbier que la réservation : plus de course réservation/absence.
    const { error } = await supabaseAdmin().rpc("create_block", {
      p_barber: session.barberId,
      p_date: date,
      p_start: start,
      p_end: end,
      p_reason: reason,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    console.error("block error", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ ok: false, message: "Erreur serveur" }, { status: 500, headers: NO_STORE });
  }
}

// Supprime un blocage : DELETE ?id=...
// Le barbier supprime ses blocages ; le propriétaire peut supprimer ceux qu'il voit
// en vue "Tous" (avant, le bouton existait mais l'action échouait silencieusement).
export async function DELETE(req: NextRequest) {
  if (!isSameOrigin(req, { requireOrigin: true })) {
    return NextResponse.json({ ok: false, message: "Requête invalide" }, { status: 403, headers: NO_STORE });
  }
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, message: "Non authentifié" }, { status: 401, headers: NO_STORE });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, message: "id manquant" }, { status: 400, headers: NO_STORE });
  }

  try {
    const { data, error } = await supabaseAdmin().rpc("delete_block", {
      p_id: id,
      p_actor: session.barberId,
      p_actor_is_owner: session.isOwner,
    });
    if (error) throw error;
    if (!(data as { ok: boolean })?.ok) {
      return NextResponse.json({ ok: false, message: "Introuvable" }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    console.error("unblock error", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ ok: false, message: "Erreur serveur" }, { status: 500, headers: NO_STORE });
  }
}
