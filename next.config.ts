import type { NextConfig } from "next";

/* En-têtes de sécurité (appliqués à toutes les réponses, y compris les API).
   CSP statique (pas de nonce) : un nonce obligerait à rendre chaque page
   dynamiquement à chaque visite (perte du cache statique). Next.js injecte des
   scripts inline pour l'hydratation (+ le petit script de layout.tsx), d'où
   'unsafe-inline' pour les scripts : la CSP bloque néanmoins tout script,
   style, image, média, police ou connexion venant d'un AUTRE domaine, les
   objets/plugins, le changement de <base>, et l'affichage du site dans un
   cadre (clickjacking). */
const isDev = process.env.NODE_ENV !== "production";
const isPreview = process.env.VERCEL_ENV === "preview";
// Barre d'outils Vercel : uniquement sur les déploiements Preview (doc Vercel
// "Managing the visibility of the Vercel Toolbar" > "Using a Content Security Policy").
const toolbar = (s: string) => (isPreview ? ` ${s}` : "");

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${toolbar("https://vercel.live")}`,
  `style-src 'self' 'unsafe-inline'${toolbar("https://vercel.live")}`,
  `img-src 'self' data: blob:${toolbar("https://vercel.live https://vercel.com")}`,
  `font-src 'self'${toolbar("https://vercel.live https://assets.vercel.com")}`,
  "media-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}${toolbar("https://vercel.live wss://ws-us3.pusher.com")}`,
  `frame-src ${isPreview ? "https://vercel.live" : "'none'"}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

// Médias statiques (non versionnés dans l'URL) : 1 jour de cache navigateur/CDN
// puis revalidation, pour éviter de re-télécharger frames/reels à chaque visite
// sans risquer de servir longtemps un fichier remplacé.
const mediaCache = [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/assets/sequence/:path*", headers: mediaCache },
      { source: "/reels/:path*", headers: mediaCache },
      { source: "/barbers/:path*", headers: mediaCache },
      { source: "/barber", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
