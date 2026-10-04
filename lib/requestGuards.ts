/* Garde-fous communs des routes API : corps JSON borné, même origine (CSRF),
   identifiants bien formés. */

import "server-only";
import { NextRequest } from "next/server";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Lit un corps JSON objet de taille bornée. Retourne null si invalide/trop gros. */
export async function readJsonBody(req: NextRequest, maxBytes: number): Promise<Record<string, unknown> | null> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("application/json")) return null;
  const len = Number(req.headers.get("content-length") || "0");
  if (len > maxBytes) return null;
  let text: string;
  try {
    text = await req.text();
  } catch {
    return null;
  }
  if (Buffer.byteLength(text, "utf8") > maxBytes) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Protection CSRF pour les routes authentifiées par cookie :
 * - le navigateur envoie toujours Origin sur un POST/DELETE fetch ; il doit
 *   correspondre exactement à l'hôte qui a reçu la requête ;
 * - Sec-Fetch-Site, s'il est présent, doit valoir "same-origin".
 * Le cookie est en plus SameSite=Strict. Ce n'est pas une autorisation :
 * chaque route vérifie aussi la session.
 */
export function isSameOrigin(req: NextRequest, { requireOrigin }: { requireOrigin: boolean }): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  if (!origin) return !requireOrigin;
  const host = (req.headers.get("host") || "").toLowerCase();
  try {
    const o = new URL(origin);
    return o.host.toLowerCase() === host && (o.protocol === "https:" || o.hostname === "localhost" || o.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}
