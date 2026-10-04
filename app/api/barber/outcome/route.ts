import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { todayTunis } from "@/lib/time";
import { sessionBarber, nowHHMMTunis } from "@/lib/dashboard/session";
import { readJsonBody, isSameOrigin, UUID_RE } from "@/lib/requestGuards";

export const dynamic = "force-dynamic";

const OUTCOMES = ["done", "cancelled", "no_show", "confirmed"] as const;
type Outcome = (typeof OUTCOMES)[number];

// POST { id, outcome: done | cancelled | no_show | confirmed }
// - done / no_show : seulement une fois l'heure du rendez-vous passée ;
// - cancelled      : à tout moment (libère le créneau) ;
// - confirmed      : annule une issue posée par erreur (si le créneau est encore libre).
export async function POST(req: NextRequest) {
  // Requête venant d'un autre site (formulaire piégé) => refus.
  if (!isSameOrigin(req, { requireOrigin: true })) {
    return NextResponse.json({ ok: false, message: "Requête invalide" }, { status: 403 });
  }
  const me = await sessionBarber(req);
  if (!me) {
    return NextResponse.json({ ok: false, message: "Non authentifié" }, { status: 401 });
  }

  const body = (await readJsonBody(req, 1024)) as { id?: unknown; outcome?: unknown } | null;
  if (!body) {
    return NextResponse.json({ ok: false, message: "Requête invalide" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const outcome = body.outcome as Outcome;
  if (!UUID_RE.test(id) || !OUTCOMES.includes(outcome)) {
    return NextResponse.json({ ok: false, message: "Action invalide" }, { status: 400 });
  }

  try {
    const sb = supabaseAdmin();
    const { data: b, error: findErr } = await sb
      .from("bookings")
      .select("id, barber, date, start_time, status")
      .eq("id", id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!b) return NextResponse.json({ ok: false, message: "Introuvable" }, { status: 404 });

    // Un barbier ne touche QUE ses réservations (sauf le owner).
    if (b.barber !== me.id && !me.sessionIsOwner) {
      return NextResponse.json({ ok: false, message: "Interdit" }, { status: 403 });
    }

    if (outcome === "done" || outcome === "no_show") {
      const today = todayTunis();
      const started =
        b.date < today || (b.date === today && String(b.start_time).slice(0, 5) <= nowHHMMTunis());
      if (!started) {
        return NextResponse.json(
          { ok: false, message: "Le rendez-vous n'a pas encore commencé" },
          { status: 409 }
        );
      }
    }

    const { error: updErr } = await sb
      .from("bookings")
      .update({ status: outcome, outcome_at: outcome === "confirmed" ? null : new Date().toISOString() })
      .eq("id", id);
    if (updErr) {
      // Remettre "en attente" un créneau déjà repris par un autre client.
      if (updErr.code === "23P01") {
        return NextResponse.json(
          { ok: false, message: "Ce créneau a déjà été repris" },
          { status: 409 }
        );
      }
      throw updErr;
    }
    return NextResponse.json({ ok: true, status: outcome });
  } catch (e) {
    console.error("outcome error", e);
    return NextResponse.json({ ok: false, message: "Erreur serveur" }, { status: 500 });
  }
}
