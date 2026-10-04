"use client";

import { useEffect } from "react";
import { smoothScrollTo, smoothScrollTop } from "@/lib/smoothScroll";

/** Toujours ouvrir la page en haut (pas de restauration de scroll, pas de saut
 *  vers une ancre #section restée dans l'URL), et faire défiler les liens
 *  internes en douceur SANS écrire le #… dans l'adresse. */
export default function ScrollManager() {
  useEffect(() => {
    try {
      history.scrollRestoration = "manual";
    } catch {}
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const restored = nav && nav.type !== "navigate"; // reload / retour arrière
    if (location.hash || restored) {
      history.replaceState(null, "", location.pathname + location.search);
      window.scrollTo(0, 0);
    }

    function onClick(e: MouseEvent) {
      const a = (e.target as HTMLElement).closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a) return;
      const id = a.getAttribute("href")!.slice(1);
      e.preventDefault();
      if (!id || id === "top") return smoothScrollTop();
      smoothScrollTo(id);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
