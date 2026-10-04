/* Défilement doux vers un élément, sans conflit avec Lenis.
   - Si Lenis tourne (ordinateur avec souris/trackpad), c'est lui qui anime :
     un scrollIntoView natif en parallèle désynchronise Lenis et provoque des
     sauts.
   - Sinon (téléphone, tablette, mouvements réduits), défilement natif. */
import type Lenis from "lenis";

export function smoothScrollTo(target: string | HTMLElement, duration = 1.2) {
  const el = typeof target === "string" ? document.getElementById(target) : target;
  if (!el) return;
  const lenis = (window as unknown as { __lenis?: Lenis }).__lenis;
  if (lenis) {
    lenis.scrollTo(el, { duration });
    return;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

export function smoothScrollTop() {
  const lenis = (window as unknown as { __lenis?: Lenis }).__lenis;
  if (lenis) return lenis.scrollTo(0, { duration: 1.2 });
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
}
