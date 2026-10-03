"use client";

import { SERVICES } from "@/config/site";
import SectionHead from "./SectionHead";

// Service mis en avant (badge "Populaire") — change l'id si besoin.
const POPULAR = "fade";

export default function Services() {
  function pick(id: string) {
    window.dispatchEvent(new CustomEvent("select-service", { detail: id }));
    document.getElementById("booking")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <section id="prix" className="px-4 py-20 sm:px-6 sm:py-28" aria-label="Services et prix">
      <div className="mx-auto max-w-6xl">
        <SectionHead n="03" label="Services" title="Chnowa" outline="t7eb?" sub="Prix clairs, sans surprise. Payement fel salon." />

        <div className="card overflow-hidden" data-reveal>
          <ul className="divide-y divide-line">
            {SERVICES.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => pick(s.id)}
                  className="group flex w-full items-center gap-4 px-5 py-5 text-left transition-colors hover:bg-white/[0.03] sm:px-8 sm:py-6"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-lg font-extrabold sm:text-2xl">{s.name}</span>
                      {s.id === POPULAR && (
                        <span className="rounded-full border border-pink/40 bg-pink/10 px-2 py-0.5 font-mono text-[10px] tracking-[0.15em] text-pink">
                          POPULAIRE
                        </span>
                      )}
                    </div>
                    <span className="mt-1 inline-block font-mono text-xs text-muted">⏱ {s.durationMin} min</span>
                  </div>
                  <div className="text-right">
                    <span className="display text-3xl sm:text-5xl">{s.price}</span>
                    <span className="ml-1 font-mono text-xs text-muted">DT</span>
                  </div>
                  <span
                    aria-hidden
                    className="hidden h-10 w-10 shrink-0 place-items-center rounded-full border border-line transition-all group-hover:border-fg group-hover:bg-fg group-hover:text-black sm:grid"
                  >
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
