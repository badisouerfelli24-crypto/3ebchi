/* Authentification de l'espace hajem (/barber).
   - Mot de passe fort (≥ 15 caractères) vérifié CÔTÉ SERVEUR contre un hash
     scrypt (lib/password.ts). L'ancien PIN à 4 chiffres n'est plus accepté.
   - Limiteur PARTAGÉ en base (par compte ET par adresse), compté avant le
     hachage : des requêtes parallèles ou plusieurs instances ne le contournent pas.
     Si la base du limiteur est indisponible : refus (fail closed).
   - Session OPAQUE : jeton aléatoire de 32 octets dans un cookie httpOnly ;
     seule son empreinte SHA-256 est stockée (table admin_sessions). Déconnexion,
     changement de mot de passe, compte désactivé ou rôle retiré => effet
     immédiat à la requête suivante.
   - Rôle propriétaire = config/site.ts ET barbers.is_owner en base (les deux). */

import "server-only";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBarber, isOwner as configIsOwner } from "@/config/site";
import { SECURITY } from "@/lib/securityConfig";
import { verifyPassword, dummyHash, passwordWithinBounds, HashBusyError } from "@/lib/password";
import { clientKey } from "@/lib/rateLimit";

const PROD = process.env.NODE_ENV === "production";
/* Préfixe __Host- : cookie lié à l'hôte exact, Secure, Path=/ (non injectable
   par un sous-domaine). En local http, on garde un nom simple non Secure. */
export const SESSION_COOKIE = PROD ? "__Host-3ebchi_admin" : "3ebchi_admin";
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export type Session = { barberId: string; isOwner: boolean };

function sha256(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: PROD, sameSite: "strict" as const, path: "/", maxAge };
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(SECURITY.sessionTtlSecs()));
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
}

function readToken(req: NextRequest): string | null {
  const t = req.cookies.get(SESSION_COOKIE)?.value;
  return t && TOKEN_RE.test(t) ? t : null;
}

/**
 * Vérifie la session d'une requête (UN appel base par requête).
 * Retourne null si absente, expirée, révoquée, inactive, compte désactivé,
 * mot de passe changé depuis, ou si la base ne répond pas (fail closed).
 */
export async function getSession(req: NextRequest): Promise<Session | null> {
  const token = readToken(req);
  if (!token) return null;
  try {
    const { data, error } = await supabaseAdmin().rpc("admin_session_validate", {
      p_token_hash: sha256(token),
      p_idle_secs: SECURITY.sessionIdleSecs(),
      p_touch_secs: SECURITY.sessionTouchSecs(),
    });
    if (error || !data) return null;
    const row = data as { barber: string; is_owner: boolean };
    if (!getBarber(row.barber)) return null; // retiré de la configuration
    return { barberId: row.barber, isOwner: !!row.is_owner && configIsOwner(row.barber) };
  } catch {
    return null;
  }
}

export type LoginResult =
  | { kind: "ok"; token: string }
  | { kind: "invalid" } // message générique
  | { kind: "locked"; retryAfter: number }
  | { kind: "unavailable" }; // limiteur ou base indisponible => refus

/**
 * Tentative de connexion. Ordre : bornes -> limiteur partagé (compte + adresse,
 * compté AVANT le hachage) -> vérification scrypt -> création de session.
 */
export async function attemptLogin(req: NextRequest, barberId: string, password: unknown): Promise<LoginResult> {
  const known = !!getBarber(barberId);
  const ipKey = clientKey(req.headers, "login");
  const accountKey = known ? `login:acct:${barberId}` : null;
  const sb = supabaseAdmin();

  let gate: { allowed: boolean; retry_after: number };
  try {
    const { data, error } = await sb.rpc("auth_login_begin", {
      p_account_key: accountKey,
      p_ip_key: ipKey,
      p_account_max: SECURITY.loginAccountMax(),
      p_ip_max: SECURITY.loginIpMax(),
      p_window_secs: SECURITY.loginWindowSecs(),
      p_lock_secs: SECURITY.loginLockSecs(),
      p_lock_max_secs: SECURITY.loginLockMaxSecs(),
    });
    if (error || !data) return { kind: "unavailable" };
    gate = data as { allowed: boolean; retry_after: number };
  } catch {
    return { kind: "unavailable" };
  }
  if (!gate.allowed) return { kind: "locked", retryAfter: Math.max(1, Number(gate.retry_after) || 60) };

  // Comptes inconnus : la liste des comptes est publique (écran de connexion),
  // on refuse sans hacher (aucun coût CPU exploitable).
  if (!known || !passwordWithinBounds(password)) return { kind: "invalid" };

  let stored: string | null = null;
  let active = false;
  try {
    const { data, error } = await sb.from("barbers").select("password_hash, active").eq("id", barberId).limit(1);
    if (error) return { kind: "unavailable" };
    const row = (data || [])[0] as { password_hash: string | null; active: boolean } | undefined;
    stored = row?.password_hash ?? null;
    active = !!row?.active;
  } catch {
    return { kind: "unavailable" };
  }

  // Compte connu sans mot de passe / désactivé : on hache quand même (temps comparable).
  let ok: boolean;
  try {
    ok = await verifyPassword(password, stored && active ? stored : await dummyHash());
  } catch (e) {
    if (e instanceof HashBusyError) return { kind: "unavailable" }; // trop de calculs simultanés
    throw e;
  }
  if (!ok || !stored || !active) return { kind: "invalid" };

  const token = crypto.randomBytes(32).toString("base64url");
  const previous = readToken(req);
  try {
    const { error } = await sb.rpc("admin_session_create", {
      p_barber: barberId,
      p_token_hash: sha256(token),
      p_ttl_secs: SECURITY.sessionTtlSecs(),
      p_previous_token_hash: previous ? sha256(previous) : null,
      p_account_key: accountKey,
      p_ip_key: ipKey,
    });
    if (error) return { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
  return { kind: "ok", token };
}

/** Révoque la session présentée (déconnexion réelle côté serveur). */
export async function revokeSession(req: NextRequest): Promise<void> {
  const token = readToken(req);
  if (!token) return;
  try {
    await supabaseAdmin().rpc("admin_session_revoke", { p_token_hash: sha256(token) });
  } catch {
    // le cookie est effacé de toute façon ; l'échec est journalisé par l'appelant
  }
}
