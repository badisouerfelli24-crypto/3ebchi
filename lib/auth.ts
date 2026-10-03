/* Authentification des barbiers (espace /barber).
   - PIN vérifié CÔTÉ SERVEUR, comparé à un hash bcrypt stocké en BDD.
   - Session = cookie httpOnly signé (HMAC-SHA256 avec SESSION_SECRET).
   - Verrouillage après 5 échecs pendant 10 minutes.
   Aucun PIN ni hash n'est envoyé au navigateur. */

import "server-only";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase";

export const SESSION_COOKIE = "3ebchi_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8h

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET manquant ou trop court (voir .env.example).");
  }
  return s;
}

// ---------- Session signée ----------
function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(barberId: string): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${barberId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [barberId, expStr, sig] = parts;
  const payload = `${barberId}.${expStr}`;
  const expected = sign(payload);
  // Comparaison à temps constant
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Date.now() > Number(expStr)) return null;
  return barberId;
}

// ---------- Vérification du PIN ----------
export async function verifyPin(barberId: string, pin: string): Promise<boolean> {
  if (!/^\d{4}$/.test(pin)) return false;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("barbers")
    .select("pin_hash")
    .eq("id", barberId)
    .maybeSingle();
  if (error || !data?.pin_hash) return false;
  return bcrypt.compare(pin, data.pin_hash);
}

// ---------- Verrouillage (en mémoire) ----------
type Attempt = { count: number; lockedUntil: number };
const attempts = new Map<string, Attempt>();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 1000 * 60 * 10; // 10 min

export function isLockedOut(key: string): number {
  const a = attempts.get(key);
  if (a && a.lockedUntil > Date.now()) {
    return Math.ceil((a.lockedUntil - Date.now()) / 1000);
  }
  return 0;
}

export function recordFailure(key: string): void {
  const a = attempts.get(key) || { count: 0, lockedUntil: 0 };
  a.count++;
  if (a.count >= MAX_ATTEMPTS) {
    a.lockedUntil = Date.now() + LOCK_MS;
    a.count = 0;
  }
  attempts.set(key, a);
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}
