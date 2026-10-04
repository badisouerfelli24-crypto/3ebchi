/* Notifications Web Push (gratuites : service push du navigateur + clés VAPID
   générées par nous, aucun fournisseur payant).
   Qui reçoit une nouvelle réservation :
   - le barbier concerné ;
   - le owner (3EBCHI) pour les réservations de son équipe, sauf s'il a coupé
     les notifications de ce barbier (notification_prefs.muted_team).
   Sans clés VAPID configurées, l'envoi est simplement désactivé. */

import "server-only";
import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase";
import { BARBERS, getBarber } from "@/config/site";
import { labelDate } from "@/lib/time";

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? process.env.VAPID_PUBLIC_KEY
    : null;
}

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const pub = vapidPublicKey();
  if (!pub) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:contact@3ebchi-style.tn",
    pub,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
  return true;
}

/** Owners qui ont coupé les notifications du barbier `barberId`. */
async function ownersMuting(barberId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin()
    .from("notification_prefs")
    .select("barber, muted_team")
    .contains("muted_team", [barberId]);
  if (error) throw error;
  return new Set((data || []).map((r) => r.barber as string));
}

/** Barbiers à prévenir pour une réservation de `barberId`. */
export async function recipientsFor(barberId: string): Promise<string[]> {
  const muting = await ownersMuting(barberId);
  const owners = BARBERS.filter((b) => b.isOwner && b.id !== barberId && !muting.has(b.id));
  return [barberId, ...owners.map((b) => b.id)];
}

type Payload = { title: string; body: string; tag: string; url: string };

async function sendTo(barberIds: string[], payloadFor: (barberId: string) => Payload) {
  if (!configure() || barberIds.length === 0) return;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("push_subscriptions")
    .select("endpoint, barber, p256dh, auth")
    .in("barber", barberIds);
  if (error) throw error;

  await Promise.all(
    (data || []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payloadFor(s.barber as string)),
          { TTL: 60 * 60 * 12, timeout: 5000 }
        );
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // Abonnement expiré / révoqué : on le supprime.
        if (code === 404 || code === 410) {
          await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          console.error("push send error", code ?? e);
        }
      }
    })
  );
}

export type NewBooking = {
  barber: string;
  service: string;
  price: number;
  date: string;
  time: string;
  client: string;
};

export async function notifyNewBooking(b: NewBooking): Promise<void> {
  if (!vapidPublicKey()) return;
  const recipients = await recipientsFor(b.barber);
  const who = getBarber(b.barber)?.name ?? b.barber;
  const when = `${labelDate(b.date)} · ${b.time}`;
  await sendTo(recipients, (to) => ({
    title: to === b.barber ? "Nouvelle réservation 💈" : `Nouvelle réservation · ${who}`,
    body: `${b.client} — ${b.service} (${b.price} DT)\n${when}`,
    tag: `booking-${b.barber}-${b.date}-${b.time}`,
    url: to === b.barber ? "/barber?tab=agenda" : `/barber?tab=agenda&scope=${b.barber}`,
  }));
}

export async function sendTestNotification(barberId: string): Promise<void> {
  await sendTo([barberId], () => ({
    title: "Notifications activées ✅",
    body: "Tu recevras ici chaque nouvelle réservation.",
    tag: "test",
    url: "/barber",
  }));
}
