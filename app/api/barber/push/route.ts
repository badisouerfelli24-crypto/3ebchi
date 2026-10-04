import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { BARBERS, isOwner } from "@/config/site";
import { sessionBarber } from "@/lib/dashboard/session";
import { vapidPublicKey, sendTestNotification } from "@/lib/push";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// GET : clé publique VAPID (null = push non configuré) + préférences.
export async function GET(req: NextRequest) {
  const me = sessionBarber(req);
  if (!me) return NextResponse.json({ ok: false, message: "Non authentifié" }, { status: 401 });
  try {
    const { data, error } = await supabaseAdmin()
      .from("notification_prefs")
      .select("muted_team")
      .eq("barber", me.id)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({
      ok: true,
      publicKey: vapidPublicKey(),
      mutedTeam: (data?.muted_team as string[] | undefined) ?? [],
    });
  } catch (e) {
    console.error("push prefs error", e);
    return NextResponse.json({ ok: false, message: "Erreur serveur" }, { status: 500 });
  }
}

type Body = {
  action?: unknown;
  subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  endpoint?: unknown;
  mutedTeam?: unknown;
};

const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

// POST { action: "subscribe" | "unsubscribe" | "test" | "mute", ... }
export async function POST(req: NextRequest) {
  const me = sessionBarber(req);
  if (!me) return NextResponse.json({ ok: false, message: "Non authentifié" }, { status: 401 });
  if (!rateLimit(`push:${me.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ ok: false, message: "Trop de tentatives" }, { status: 429 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Requête invalide" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  try {
    switch (body.action) {
      case "subscribe": {
        const endpoint = str(body.subscription?.endpoint, 1000);
        const p256dh = str(body.subscription?.keys?.p256dh, 200);
        const auth = str(body.subscription?.keys?.auth, 100);
        // Clé publique P-256 non compressée (65 octets) et secret d'auth (16 octets).
        const bytes = (s: string | null) => (s && /^[A-Za-z0-9_-]+={0,2}$/.test(s) ? Buffer.from(s, "base64url").length : 0);
        if (!endpoint || !endpoint.startsWith("https://") || bytes(p256dh) !== 65 || bytes(auth) < 16) {
          return NextResponse.json({ ok: false, message: "Abonnement invalide" }, { status: 400 });
        }
        // Un appareil n'appartient qu'à un barbier à la fois (upsert sur endpoint).
        const { error } = await sb
          .from("push_subscriptions")
          .upsert({ endpoint, p256dh, auth, barber: me.id }, { onConflict: "endpoint" });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "unsubscribe": {
        const endpoint = str(body.endpoint, 1000);
        if (!endpoint) return NextResponse.json({ ok: false, message: "endpoint manquant" }, { status: 400 });
        const { error } = await sb
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", endpoint)
          .eq("barber", me.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "test": {
        await sendTestNotification(me.id);
        return NextResponse.json({ ok: true });
      }
      case "mute": {
        // Réservé au owner : couper les notifications de membres de l'équipe.
        if (!isOwner(me.id)) {
          return NextResponse.json({ ok: false, message: "Interdit" }, { status: 403 });
        }
        const team = BARBERS.filter((b) => b.id !== me.id).map((b) => b.id);
        const muted = Array.isArray(body.mutedTeam)
          ? [...new Set(body.mutedTeam.filter((x): x is string => typeof x === "string" && team.includes(x)))]
          : null;
        if (!muted) return NextResponse.json({ ok: false, message: "Liste invalide" }, { status: 400 });
        const { error } = await sb
          .from("notification_prefs")
          .upsert({ barber: me.id, muted_team: muted, updated_at: new Date().toISOString() });
        if (error) throw error;
        return NextResponse.json({ ok: true, mutedTeam: muted });
      }
      default:
        return NextResponse.json({ ok: false, message: "Action invalide" }, { status: 400 });
    }
  } catch (e) {
    console.error("push error", e);
    return NextResponse.json({ ok: false, message: "Erreur serveur" }, { status: 500 });
  }
}
