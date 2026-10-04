import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { readJsonBody, isSameOrigin, UUID_RE } from "@/lib/requestGuards";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

// Marque une réservation 'done' ou 'cancelled'.
// Annuler libère automatiquement le créneau (status != 'confirmed').
// Une seule requête atomique : ownership + statut actuel + transition.
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req, { requireOrigin: true })) {
    return NextResponse.json({ ok: false, message: "Requête invalide" }, { status: 403, headers: NO_STORE });
  }
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, message: "Non authentifié" }, { status: 401, headers: NO_STORE });
  }

  const body = await readJsonBody(req, 1024);
  const id = typeof body?.id === "string" ? body.id : "";
  const action = typeof body?.action === "string" ? body.action : "";
  if (!UUID_RE.test(id) || !["done", "cancel"].includes(action)) {
    return NextResponse.json({ ok: false, message: "Action invalide" }, { status: 400, headers: NO_STORE });
  }
  const newStatus = action === "done" ? "done" : "cancelled";

  try {
    const { data, error } = await supabaseAdmin().rpc("set_booking_status", {
      p_id: id,
      p_actor: session.barberId,
      // Un barbier ne touche QUE ses réservations (sauf le propriétaire).
      p_actor_is_owner: session.isOwner,
      p_status: newStatus,
    });
    if (error) throw error;
    if (!(data as { ok: boolean })?.ok) {
      // Introuvable, pas à toi, ou déjà traitée : même réponse (pas d'oracle).
      return NextResponse.json({ ok: false, message: "Introuvable" }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    console.error("action error", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ ok: false, message: "Erreur serveur" }, { status: 500, headers: NO_STORE });
  }
}
