/* Rate limiting en mémoire (anti-spam basique).
   Suffisant pour un petit salon sur une instance. Pour du multi-instance,
   remplacer par un store partagé (Upstash Redis, table Supabase, etc.). */

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

/** Autorise `limit` actions par `windowMs`. Retourne true si autorisé. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = store.get(key);
  if (!b || now > b.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

/** Extrait une IP depuis les en-têtes (Vercel : x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") || "unknown";
}
