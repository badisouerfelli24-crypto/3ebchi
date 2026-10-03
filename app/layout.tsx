import type { Metadata, Viewport } from "next";
import { Montserrat, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SITE } from "@/config/site";

const display = Montserrat({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const title = `3ebchi Style 💈 Hajem Tunis`;
const description =
  "3EBCHI STYLE 💈 — Coupe propre, style 3ebchi. Barbershop à Tunis. Réservi blastek en ligne : fade, barbe, coupe. Let's shake things up 🔥";

export const metadata: Metadata = {
  metadataBase: new URL("https://3ebchi-style-badis4.vercel.app"),
  title,
  description,
  applicationName: SITE.name,
  keywords: [
    "barbershop Tunis",
    "coiffeur Tunis",
    "fade Tunis",
    "3ebchi style",
    "barber Tunisie",
    "réservation coiffeur Tunis",
  ],
  openGraph: {
    title,
    description,
    type: "website",
    locale: "fr_TN",
    siteName: SITE.name,
    images: [{ url: "/reels/stour3ad.jpg", width: 540, height: 960 }],
  },
  twitter: { card: "summary_large_image", title, description },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/* Ouvrir toujours en haut de page : retire le #section de l'URL avant que
            le navigateur ne saute dessus, et désactive la restauration du scroll. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{history.scrollRestoration='manual';if(location.hash){history.replaceState(null,'',location.pathname+location.search)}}catch(e){}",
          }}
        />
      </head>
      <body
        className={`${display.variable} ${inter.variable} ${mono.variable} font-body bg-bg text-fg antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
