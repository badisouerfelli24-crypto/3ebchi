/* Services & prix en ligne : lus dans la table Supabase `services` à chaque
   requête (une modif faite depuis /barber est visible tout de suite).
   Si la base est injoignable, on retombe sur les valeurs de config/site.ts. */

import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { SERVICES, type Service } from "@/config/site";

export const SERVICE_COLS = "id, name, sub, price, duration_min, kind, parts, premium, sort";

export type ServiceRow = {
  id: string;
  name: string;
  sub: string;
  price: number | string;
  duration_min: number;
  kind: "solo" | "pack";
  parts: string[] | null;
  premium: boolean;
  sort: number;
};

export function rowToService(r: ServiceRow): Service {
  return {
    id: r.id,
    name: r.name,
    sub: r.sub || "",
    price: Number(r.price),
    durationMin: r.duration_min,
    kind: r.kind,
    parts: r.parts ?? [],
    premium: r.premium,
  };
}

export async function getServices(): Promise<Service[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("services")
      .select(SERVICE_COLS)
      .order("sort", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return (data as ServiceRow[]).map(rowToService);
  } catch (e) {
    console.error("services load error (fallback config)", e);
    return SERVICES;
  }
}

export async function findService(id: string): Promise<Service | undefined> {
  return (await getServices()).find((s) => s.id === id);
}
