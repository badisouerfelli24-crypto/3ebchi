/* Client Supabase CÔTÉ SERVEUR uniquement.
   Utilise la clé secrète (service role) : ne JAMAIS importer ce fichier dans un
   composant client. Toutes les lectures/écritures passent par les routes API.

   Garde-fou d'environnement (2 niveaux, aucun repli silencieux) :
   1. Étiquette de configuration : DATA_ENVIRONMENT doit être défini partout
      ("production", "preview", "development" ou "test"). Sur Vercel, il doit
      être égal à VERCEL_ENV. Absent ou incohérent => aucun accès à la base.
   2. Preuve côté BASE : chaque projet Supabase porte sa propre étiquette dans
      public.app_environment (posée une fois, à la main, dans le SQL Editor de
      CE projet). Avant la première requête, le serveur la lit et refuse si elle
      diffère de DATA_ENVIRONMENT. Une même base ne pouvant porter qu'une
      étiquette, un déploiement Preview branché par erreur sur la base de
      production (étiquette "production") est refusé, même si ses variables
      disent "preview". Base non étiquetée => refus.
   Dérogation explicite et consciente (déconseillée) :
   ALLOW_PREVIEW_ON_PRODUCTION_DATA=I_UNDERSTAND (Preview sur données de prod). */

import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const DATA_ENVIRONMENTS = ["production", "preview", "development", "test"] as const;

let _client: SupabaseClient | null = null;
let _labelCheck: Promise<void> | null = null;

function previewOnProductionAllowed(): boolean {
  return process.env.VERCEL_ENV === "preview" && process.env.ALLOW_PREVIEW_ON_PRODUCTION_DATA === "I_UNDERSTAND";
}

/** Étiquette attendue pour la base, ou exception si la configuration est incohérente. */
export function expectedDataEnvironment(): string {
  const label = process.env.DATA_ENVIRONMENT;
  if (!label || !(DATA_ENVIRONMENTS as readonly string[]).includes(label)) {
    throw new Error(
      `Configuration refusée : DATA_ENVIRONMENT ${label ? "invalide" : "absent"} (attendu : ${DATA_ENVIRONMENTS.join(", ")}). Voir docs/audits/PRODUCTION_READINESS.md.`
    );
  }
  const vercelEnv = process.env.VERCEL_ENV; // défini par Vercel uniquement
  if (vercelEnv && vercelEnv !== "development" && label !== vercelEnv && !(label === "production" && previewOnProductionAllowed())) {
    throw new Error(`Configuration refusée : DATA_ENVIRONMENT (${label}) ne correspond pas à VERCEL_ENV (${vercelEnv}).`);
  }
  // Hors Vercel (poste local, tests), une étiquette "production" n'est jamais acceptée :
  // un .env local ne doit pas pouvoir écrire dans la base de production.
  if (!vercelEnv && label === "production" && process.env.ALLOW_LOCAL_PRODUCTION_ACCESS !== "I_UNDERSTAND") {
    throw new Error("Configuration refusée : DATA_ENVIRONMENT=production hors Vercel.");
  }
  return label;
}

/* Lecture de l'étiquette stockée dans la base (une fois par instance si elle
   est correcte ; en cas d'échec, nouvel essai à la requête suivante). */
async function verifyDatabaseLabel(url: string, key: string, expected: string): Promise<void> {
  const res = await fetch(`${url}/rest/v1/rpc/app_environment_name`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Étiquette de base illisible (HTTP ${res.status}) : migration non appliquée ?`);
  const actual: unknown = await res.json();
  if (actual === null) throw new Error("Base non étiquetée (public.app_environment vide) : accès refusé.");
  if (actual === expected) return;
  if (actual === "production" && previewOnProductionAllowed()) return;
  throw new Error(`Base étiquetée "${String(actual)}" alors que ce déploiement attend "${expected}" : accès refusé.`);
}

function ensureLabel(url: string, key: string, expected: string): Promise<void> {
  if (!_labelCheck) {
    _labelCheck = verifyDatabaseLabel(url, key, expected).catch((e) => {
      _labelCheck = null; // pas de mise en cache d'un échec
      console.error("data environment check failed:", e instanceof Error ? e.message : "unknown");
      throw e;
    });
  }
  return _labelCheck;
}

export function supabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const expected = expectedDataEnvironment();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Config Supabase manquante : définis NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (voir .env.example)."
    );
  }
  if (process.env.NODE_ENV === "production" && (process.env.SESSION_SECRET || "").length < 32) {
    throw new Error("SESSION_SECRET manquant ou trop court (≥ 32 caractères en production).");
  }

  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      // 1) étiquette de la base vérifiée avant toute requête ;
      // 2) délai borné : une base qui ne répond pas donne une erreur propre (pas
      //    de requête suspendue indéfiniment, pas de nouvelle tentative automatique).
      fetch: async (input, init) => {
        await ensureLabel(url, key, expected);
        return fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(10_000) });
      },
    },
  });
  return _client;
}
