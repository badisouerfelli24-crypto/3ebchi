/* Client Supabase CÔTÉ SERVEUR uniquement.
   Utilise la SERVICE ROLE KEY : ne JAMAIS importer ce fichier dans un
   composant client. Toutes les lectures/écritures passent par les routes API. */

import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Config Supabase manquante : définis NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (voir .env.example)."
    );
  }

  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}
