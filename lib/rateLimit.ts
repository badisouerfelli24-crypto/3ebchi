/* Aides "adresse client" + petit filtre en mémoire.
   - La protection qui compte (connexion, réservations) est en BASE (table
     rate_limits, partagée par toutes les instances) : voir lib/auth.ts et
     app/api/book/route.ts. Ce filtre mémoire n'est qu'une première barrière
     bon marché par instance, borné en taille.
   - Adresse : sur Vercel, l'en-tête x-forwarded-for / x-real-ip est écrasé par
     la plateforme (doc Vercel "Request headers" : "we currently overwrite the
     X-Forwarded-For header … to prevent IP spoofing"). Ailleurs, les en-têtes
     ne sont crus que si TRUST_PROXY_HEADERS=1 (tests / proxy maîtrisé). */

import "server-only";
import crypto from "crypto";

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();
const MAX_KEYS = 5000;

/** Autorise `limit` actions par `windowMs` (par instance). */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (store.size > MAX_KEYS) {
    for (const [k, b] of store) if (now > b.resetAt) store.delete(k);
    if (store.size > MAX_KEYS) store.clear();
  }
  const b = store.get(key);
  if (!b || now > b.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

function trustedIp(headers: Headers): string | null {
  const trust = process.env.VERCEL === "1" || process.env.TRUST_PROXY_HEADERS === "1";
  if (!trust) return null;
  const raw = (headers.get("x-real-ip") || headers.get("x-forwarded-for")?.split(",")[0] || "").trim();
  if (!raw || raw.length > 64 || !/^[0-9a-fA-F:.]+$/.test(raw)) return null;
  if (raw.includes(":")) {
    // IPv6 : regroupe par /64 (un attaquant dispose souvent d'un /64 entier)
    const parts = raw.split("::")[0].split(":").slice(0, 4);
    return parts.join(":") + "::/64";
  }
  return raw;
}

/** Clé d'adresse HMAC (aucune IP brute n'est stockée en base). */
export function clientKey(headers: Headers, purpose: "login" | "book"): string {
  const ip = trustedIp(headers) || "unknown";
  const secret = process.env.SESSION_SECRET || "";
  const h = crypto.createHmac("sha256", secret).update(`${purpose}|${ip}`).digest("hex").slice(0, 32);
  return `${purpose}:ip:${h}`;
}

/** Valeur courte pour le filtre mémoire (même source que clientKey). */
export function clientIp(headers: Headers): string {
  return trustedIp(headers) || "unknown";
}
