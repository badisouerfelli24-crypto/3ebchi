import { NextRequest, NextResponse } from "next/server";
import { sessionBarber } from "@/lib/dashboard/session";

export const dynamic = "force-dynamic";

// GET : barbier connecté (401 sinon).
export async function GET(req: NextRequest) {
  const me = await sessionBarber(req);
  if (!me) return NextResponse.json({ ok: false, message: "Non authentifié" }, { status: 401 });
  return NextResponse.json({ ok: true, me: { id: me.id, name: me.name, isOwner: me.sessionIsOwner } }, { headers: { "Cache-Control": "no-store, private" } });
}
