#!/usr/bin/env node
/* =========================================================================
   Pré-vol de mise en production — LECTURE SEULE, n'affiche aucun secret.
   Fonctionne sous Windows (PowerShell), macOS et Linux avec Node ≥ 20.

   1) Variables d'un environnement (ex. fichier tiré de Vercel ou saisi à la main) :
        node --env-file=<fichier> scripts/release-preflight.mjs env
      Vérifie la PRÉSENCE et le FORMAT des variables requises (jamais leur valeur
      n'est affichée ; seule la référence du projet Supabase, non secrète, l'est).

   2) Séparation Preview / Production (références publiques uniquement) :
        node scripts/release-preflight.mjs separation <url-supabase-prod> <url-supabase-preview>
      Échoue si les deux URL désignent le même projet Supabase.

   3) Base de données (appelle public.release_preflight via l'API Supabase) :
        node --env-file=<fichier> scripts/release-preflight.mjs db [pre-deploy|post-cutover]
      Alternative sans aucun secret sur ton PC : dans Supabase > SQL Editor,
        select public.release_preflight('pre-deploy');

   Code de sortie : 0 = tout est conforme ; 1 = au moins un contrôle échoue ;
   2 = usage incorrect. Aucune valeur par défaut ne fait « passer » un contrôle.
   ========================================================================= */

const ENVS = ["production", "preview", "development", "test"];

function projectRef(url) {
  try {
    const u = new URL(url);
    const m = /^([a-z0-9]{20})\.supabase\.co$/.exec(u.hostname);
    return m ? m[1] : `${u.hostname}${u.port ? ":" + u.port : ""}`;
  } catch {
    return null;
  }
}

function report(rows) {
  let ok = true;
  for (const r of rows) {
    ok = ok && r.ok;
    console.log(`${r.ok ? "OK  " : "FAIL"}  ${r.check}${r.detail != null && r.detail !== "" ? "  — " + r.detail : ""}`);
  }
  console.log(ok ? "\nRÉSULTAT : conforme" : "\nRÉSULTAT : NON conforme (voir FAIL ci-dessus)");
  return ok;
}

function checkEnv() {
  const e = process.env;
  const rows = [];
  const url = e.NEXT_PUBLIC_SUPABASE_URL || "";
  const ref = url ? projectRef(url) : null;
  rows.push({ check: "NEXT_PUBLIC_SUPABASE_URL présent et en https", ok: !!ref && url.startsWith("https://"), detail: ref ? `projet ${ref}` : "absent ou invalide" });
  rows.push({ check: "SUPABASE_SERVICE_ROLE_KEY présent", ok: (e.SUPABASE_SERVICE_ROLE_KEY || "").length >= 20, detail: e.SUPABASE_SERVICE_ROLE_KEY ? "(valeur masquée)" : "absent" });
  rows.push({ check: "SESSION_SECRET ≥ 32 caractères", ok: (e.SESSION_SECRET || "").length >= 32, detail: e.SESSION_SECRET ? `${e.SESSION_SECRET.length} caractères (valeur masquée)` : "absent" });
  rows.push({ check: "DATA_ENVIRONMENT valide", ok: ENVS.includes(e.DATA_ENVIRONMENT), detail: e.DATA_ENVIRONMENT || "absent" });
  if (e.VERCEL_ENV) {
    rows.push({ check: "DATA_ENVIRONMENT = VERCEL_ENV", ok: e.DATA_ENVIRONMENT === e.VERCEL_ENV, detail: `${e.DATA_ENVIRONMENT} / ${e.VERCEL_ENV}` });
  }
  // En production, l'espace barbier doit être servi par un hôte de PRODUCTION
  // (données réelles). Le défaut de middleware.ts vise l'URL de la branche
  // preview, qui pointe désormais vers la base de PREVIEW.
  const prodNeedsHosts = e.DATA_ENVIRONMENT === "production";
  rows.push({
    check: prodNeedsHosts ? "ADMIN_HOSTS défini explicitement pour la production" : "ADMIN_HOSTS (information)",
    ok: prodNeedsHosts ? !!(e.ADMIN_HOSTS && e.ADMIN_HOSTS.trim()) : true,
    detail: e.ADMIN_HOSTS ? e.ADMIN_HOSTS : prodNeedsHosts ? "absent : l'espace barbier serait introuvable (404) en production" : "non défini",
  });
  rows.push({ check: "aucune dérogation ALLOW_PREVIEW_ON_PRODUCTION_DATA", ok: !e.ALLOW_PREVIEW_ON_PRODUCTION_DATA, detail: e.ALLOW_PREVIEW_ON_PRODUCTION_DATA ? "présente : à retirer sauf décision explicite" : "" });
  rows.push({ check: "aucun TRUST_PROXY_HEADERS (inutile sur Vercel)", ok: !e.TRUST_PROXY_HEADERS, detail: e.TRUST_PROXY_HEADERS ? "présent" : "" });
  for (const n of ["LOGIN_ACCOUNT_MAX_ATTEMPTS", "LOGIN_IP_MAX_ATTEMPTS", "LOGIN_WINDOW_SECONDS", "LOGIN_LOCK_SECONDS", "LOGIN_LOCK_MAX_SECONDS", "SESSION_TTL_SECONDS", "SESSION_IDLE_SECONDS", "SESSION_TOUCH_SECONDS", "BOOKING_IP_MAX", "BOOKING_IP_WINDOW_SECONDS", "BOOKING_MAX_ACTIVE_PER_PHONE"]) {
    if (e[n] !== undefined) rows.push({ check: `${n} entier`, ok: /^\d+$/.test(e[n]), detail: e[n] });
  }
  return report(rows);
}

function checkSeparation(prodUrl, previewUrl) {
  const a = projectRef(prodUrl || "");
  const b = projectRef(previewUrl || "");
  if (!a || !b) {
    console.error("usage : separation <url-supabase-prod> <url-supabase-preview>");
    process.exit(2);
  }
  return report([
    { check: "production et preview utilisent deux projets Supabase différents", ok: a !== b, detail: `prod=${a} preview=${b}` },
  ]);
}

async function checkDb(phase) {
  if (!["pre-deploy", "post-cutover"].includes(phase)) {
    console.error("phase : pre-deploy ou post-cutover");
    process.exit(2);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (utilise --env-file).");
    process.exit(2);
  }
  console.log(`Projet : ${projectRef(url)}  —  phase : ${phase}\n`);
  let res;
  try {
    res = await fetch(`${url}/rest/v1/rpc/release_preflight`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_phase: phase }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return report([{ check: "connexion à l'API Supabase", ok: false, detail: e?.name || "erreur réseau" }]);
  }
  if (!res.ok) {
    return report([{ check: "public.release_preflight disponible", ok: false, detail: `HTTP ${res.status} (migration non appliquée ou cache de schéma pas à jour)` }]);
  }
  const out = await res.json();
  const label = (out.checks || []).find((c) => c.check === "app_environment label set");
  const expected = process.env.DATA_ENVIRONMENT;
  const rows = [...(out.checks || [])];
  if (expected) rows.push({ check: "étiquette de la base = DATA_ENVIRONMENT", ok: label?.detail === expected, detail: `${label?.detail} / ${expected}` });
  else rows.push({ check: "DATA_ENVIRONMENT fourni pour comparer l'étiquette", ok: false, detail: "absent" });
  return report(rows) && out.ok === true;
}

const [mode, a, b] = process.argv.slice(2);
let ok;
if (mode === "env") ok = checkEnv();
else if (mode === "separation") ok = checkSeparation(a, b);
else if (mode === "db") ok = await checkDb(a || "pre-deploy");
else {
  console.error("usage : release-preflight.mjs env | separation <prod-url> <preview-url> | db [pre-deploy|post-cutover]");
  process.exit(2);
}
process.exit(ok ? 0 : 1);
