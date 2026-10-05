import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isOwner } from "@/config/site";
import { sessionBarber } from "@/lib/dashboard/session";
import { SERVICE_COLS, rowToService, type ServiceRow } from "@/lib/services";

export const dynamic = "force-dynamic";

// Gestion des services / packs / prix / durées.
// RÉSERVÉ AU OWNER (3EBCHI) : les autres hajems reçoivent 403, même en lecture.
// Les catégories sont fixes : "solo" (wa7dou) et "pack" (+ option premium / VIP).

function guard(req: NextRequest) {
  const me = sessionBarber(req);
  if (!me) return { error: fail("Mech connecté", 401) };
  if (!isOwner(me.id)) return { error: fail("Ghir 3EBCHI ynajem ybaddel les prix w les packs", 403) };
  return { me };
}

async function list() {
  const { data, error } = await supabaseAdmin()
    .from("services")
    .select(SERVICE_COLS)
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as ServiceRow[]).map(rowToService);
}

// GET -> liste complète.
export async function GET(req: NextRequest) {
  const g = guard(req);
  if ("error" in g) return g.error;
  try {
    return NextResponse.json({ ok: true, services: await list() });
  } catch (e) {
    console.error("services list error", e);
    return fail("Mochkla fel serveur", 500);
  }
}

// POST { id?, name, sub, price, durationMin, kind, parts?, premium? }
// Sans id -> nouveau service ; avec id -> modification (la catégorie ne change pas).
export async function POST(req: NextRequest) {
  const g = guard(req);
  if ("error" in g) return g.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("Talab mech valide", 400);
  }

  const id = typeof body.id === "string" ? body.id : "";
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
  const sub = String(body.sub ?? "").trim().replace(/\s+/g, " ");
  const price = Number(body.price);
  const durationMin = Number(body.durationMin);
  const kind = body.kind === "pack" ? "pack" : body.kind === "solo" ? "solo" : null;

  if (name.length < 2 || name.length > 40) return fail("L'esm lazem bin 2 w 40 harf", 400);
  if (sub.length > 80) return fail("El wasf twil barcha (80 harf max)", 400);
  if (!Number.isFinite(price) || price < 0 || price > 1000) return fail("Soum mech valide", 400);
  if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 480 || durationMin % 5 !== 0) {
    return fail("El wa9t lazem bin 5 w 480 d9i9a (b 5 b 5)", 400);
  }
  if (!kind) return fail("Catégorie mech valide", 400);

  try {
    const sb = supabaseAdmin();
    const all = await list();
    const existing = id ? all.find((s) => s.id === id) : undefined;
    if (id && !existing) return fail("Service mech mawjoud", 404);
    const finalKind = existing ? existing.kind : kind; // la catégorie reste la même

    const solos = new Set(all.filter((s) => s.kind === "solo").map((s) => s.id));
    const parts =
      finalKind === "pack" && Array.isArray(body.parts)
        ? [...new Set(body.parts.filter((p): p is string => typeof p === "string" && solos.has(p)))]
        : [];
    const premium = finalKind === "pack" && body.premium === true;

    if (all.some((s) => s.id !== id && s.name.toLowerCase() === name.toLowerCase())) {
      return fail("Famma déjà service b nafs l'esm", 409);
    }

    const row = { name, sub, price, duration_min: durationMin, parts, premium, updated_at: new Date().toISOString() };

    let savedId = existing?.id ?? "";
    if (existing) {
      const { error } = await sb.from("services").update(row).eq("id", existing.id);
      if (error) throw error;
    } else {
      // Nouveau : id lisible + suffixe pour l'unicité ; placé à la fin de sa catégorie.
      const slug = name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "service";
      const newId = `${slug}_${Math.random().toString(36).slice(2, 6)}`;
      const { data: maxRow } = await sb.from("services").select("sort").order("sort", { ascending: false }).limit(1).maybeSingle();
      const sort = (maxRow?.sort ?? 0) + 10;
      const { error } = await sb.from("services").insert({ id: newId, kind: finalKind, sort, ...row });
      if (error) throw error;
      savedId = newId;
    }

    // Un seul pack VIP mis en avant sur le site.
    if (premium) {
      const { error } = await sb.from("services").update({ premium: false }).eq("premium", true).neq("id", savedId);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true, services: await list() });
  } catch (e) {
    console.error("services save error", e);
    return fail("Mochkla fel serveur", 500);
  }
}

// DELETE ?id=… -> fassa5 (les réservations déjà faites gardent leur nom / prix).
export async function DELETE(req: NextRequest) {
  const g = guard(req);
  if ("error" in g) return g.error;
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return fail("Talab mech valide", 400);

  try {
    const sb = supabaseAdmin();
    const all = await list();
    const target = all.find((s) => s.id === id);
    if (!target) return fail("Service mech mawjoud", 404);
    if (all.length <= 1) return fail("Lazem yo93ed 3al a9al service wa7ed", 409);

    const { error } = await sb.from("services").delete().eq("id", id);
    if (error) throw error;

    // Un service wa7dou supprimé disparaît aussi du contenu des packs.
    if (target.kind === "solo") {
      for (const p of all.filter((s) => s.kind === "pack" && s.parts?.includes(id))) {
        const { error: e2 } = await sb.from("services").update({ parts: p.parts!.filter((x) => x !== id) }).eq("id", p.id);
        if (e2) throw e2;
      }
    }
    return NextResponse.json({ ok: true, services: await list() });
  } catch (e) {
    console.error("services delete error", e);
    return fail("Mochkla fel serveur", 500);
  }
}

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}
