import { NextResponse, type NextRequest } from "next/server";

/* L'espace hajem (/barber + ses API) n'est accessible QUE depuis ces adresses.
   Partout ailleurs (site public, domaine de prod) → 404, comme si la page n'existait pas.
   Pour changer d'adresse : variable d'env ADMIN_HOSTS (liste séparée par des virgules). */
const ADMIN_HOSTS = (process.env.ADMIN_HOSTS || "3ebchi-style-git-preview-badis4.vercel.app")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase().split(":")[0];
  const local = host === "localhost" || host === "127.0.0.1";
  if (local || ADMIN_HOSTS.includes(host)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  return NextResponse.rewrite(new URL("/_not-found", req.url), { status: 404 });
}

export const config = {
  matcher: ["/barber", "/barber/:path*", "/api/barber/:path*"],
};
