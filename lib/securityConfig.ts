/* Réglages de sécurité (surchargables par variables d'environnement serveur).
   Chaque valeur par défaut est expliquée ; voir docs/audits/REMEDIATION_REPORT.md. */

function int(name: string, def: number, min: number, max: number): number {
  const raw = process.env[name];
  const v = raw === undefined || raw === "" ? def : Number(raw);
  if (!Number.isInteger(v) || v < min || v > max) {
    throw new Error(`${name} invalide (attendu un entier entre ${min} et ${max}).`);
  }
  return v;
}

export const SECURITY = {
  /* --- Connexion admin --- */
  // 5 essais par compte par fenêtre de 15 min : avec un mot de passe ≥ 15 caractères,
  // cela rend la devinette impossible tout en bornant le coût CPU du hachage.
  loginAccountMax: () => int("LOGIN_ACCOUNT_MAX_ATTEMPTS", 5, 3, 100),
  // 20 essais par adresse (tous comptes confondus) par fenêtre.
  loginIpMax: () => int("LOGIN_IP_MAX_ATTEMPTS", 20, 5, 1000),
  loginWindowSecs: () => int("LOGIN_WINDOW_SECONDS", 15 * 60, 60, 24 * 3600),
  // Blocage 15 min, doublé à chaque récidive, plafonné à 60 min (pas de blocage
  // permanent qu'un attaquant pourrait imposer au propriétaire).
  loginLockSecs: () => int("LOGIN_LOCK_SECONDS", 15 * 60, 60, 24 * 3600),
  loginLockMaxSecs: () => int("LOGIN_LOCK_MAX_SECONDS", 60 * 60, 60, 24 * 3600),

  /* --- Sessions admin --- */
  sessionTtlSecs: () => int("SESSION_TTL_SECONDS", 8 * 3600, 300, 7 * 24 * 3600), // durée absolue (inchangée : 8 h)
  sessionIdleSecs: () => int("SESSION_IDLE_SECONDS", 3 * 3600, 300, 7 * 24 * 3600), // inactivité
  sessionTouchSecs: () => int("SESSION_TOUCH_SECONDS", 5 * 60, 30, 3600), // écrit "vu" au plus toutes les 5 min

  /* --- Réservations publiques --- */
  // Limite anti-abus à court terme, PARTAGÉE entre instances (en base) :
  // 6 tentatives de réservation valides par adresse réseau par 10 min. Les rejeux
  // idempotents (même requête renvoyée après une coupure) ne sont PAS comptés.
  // Compromis : plusieurs clients derrière la même adresse (wifi du salon,
  // opérateur mobile avec NAT) partagent ce quota. Ne bloque pas un spam distribué.
  bookingIpMax: () => int("BOOKING_IP_MAX", 6, 1, 1000),
  bookingIpWindowSecs: () => int("BOOKING_IP_WINDOW_SECONDS", 10 * 60, 60, 24 * 3600),
  // Plafond OPTIONNEL de réservations confirmées à venir par numéro.
  // 0 = désactivé (défaut) : comme avant, un même numéro peut réserver pour toute
  // la famille. Ce n'est pas une limite anti-abus, c'est une règle métier à décider.
  bookingMaxActivePerPhone: () => int("BOOKING_MAX_ACTIVE_PER_PHONE", 0, 0, 50),
};

export const PASSWORD_MIN_LENGTH = 15; // NIST SP 800-63B-4 : ≥ 15 pour un facteur unique
export const PASSWORD_MAX_LENGTH = 128; // ≥ 64 recommandé ; borné pour limiter le coût du hachage
export const PASSWORD_MAX_BYTES = 512;
