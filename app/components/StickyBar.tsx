"use client";

/** Barre collante en bas (mobile uniquement) : CTA réservation. */
export default function StickyBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink bg-spray px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.5)] sm:hidden">
      <a
        href="#booking"
        className="spray-btn block rounded-md bg-ink py-3 text-center font-bebas text-xl tracking-widest text-spray"
      >
        Réservi 💈
      </a>
    </div>
  );
}
