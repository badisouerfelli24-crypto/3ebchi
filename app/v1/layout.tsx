/* Version 1 (graffiti) — archivée et accessible sur /v1.
   Polices et styles chargés uniquement pour cette route. */
import type { Metadata } from "next";
import { Permanent_Marker, Bebas_Neue } from "next/font/google";
import "./v1.css";

const marker = Permanent_Marker({ weight: "400", subsets: ["latin"], variable: "--font-marker", display: "swap" });
const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas", display: "swap" });

export const metadata: Metadata = {
  title: "3ebchi Style 💈 — v1",
  robots: { index: false },
};

export default function V1Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`v1-root ${marker.variable} ${bebas.variable} font-body bg-ink text-chalk antialiased`}>
      {children}
    </div>
  );
}
