import type { Metadata, Viewport } from "next";

// Espace hajem installable sur l'écran d'accueil (requis pour les
// notifications push sur iPhone) et jamais indexé.
export const metadata: Metadata = {
  title: "3EBCHI Pro — Espace hajem",
  manifest: "/barber.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "3EBCHI Pro", statusBarStyle: "black-translucent" },
  icons: { apple: "/barber-apple-touch.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0e",
  viewportFit: "cover",
};

export default function BarberLayout({ children }: { children: React.ReactNode }) {
  return children;
}
