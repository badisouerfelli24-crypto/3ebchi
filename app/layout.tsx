import type { Metadata, Viewport } from "next";
import { Permanent_Marker, Bebas_Neue, Inter } from "next/font/google";
import "./globals.css";
import { SITE } from "@/config/site";

const marker = Permanent_Marker({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-marker",
  display: "swap",
});
const bebas = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const title = `3ebchi Style 💈 Barbershop Tunis`;
const description =
  "3EBCHI STYLE 💈 — Coupe propre, style 3ebchi. Barbershop à Tunis. Réservi blastek en ligne : fade, barbe, coupe. Let's shake things up 🔥";

export const metadata: Metadata = {
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
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0d0d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body
        className={`${marker.variable} ${bebas.variable} ${inter.variable} font-body bg-ink text-chalk antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
