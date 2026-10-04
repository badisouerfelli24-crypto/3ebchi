import { NextRequest, NextResponse } from "next/server";
import { revokeSession, clearSessionCookie } from "@/lib/auth";
import { isSameOrigin } from "@/lib/requestGuards";

export const dynamic = "force-dynamic";

// Déconnexion réelle : la session est révoquée en base (rejouer l'ancien cookie
// échoue), puis le cookie est effacé avec les mêmes attributs qu'à la création.
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req, { requireOrigin: true })) {
    return NextResponse.json({ ok: false, message: "Requête invalide" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  await revokeSession(req);
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  clearSessionCookie(res);
  return res;
}
