"use client";

import { SERVICES, packSaving, type Service } from "@/config/site";
import SectionHead from "./SectionHead";

const SOLO = SERVICES.filter((s) => s.kind === "solo");
const PACKS = SERVICES.filter((s) => s.kind === "pack" && !s.premium);
const VIP = SERVICES.find((s) => s.premium);

export default function Services() {
  function pick(id: string) {
    window.dispatchEvent(new CustomEvent("select-service", { detail: id }));
    document.getElementById("booking")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <section id="prix" className="px-4 py-20 sm:px-6 sm:py-28" aria-label="Services et prix">
      <div className="mx-auto max-w-6xl">
        <SectionHead n="03" label="Services" title="Chnowa" outline="t7eb?" sub="Prix clairs, sans surprise. Payement fel salon." />

        {/* ---- Pack premium ---- */}
        {VIP && (
          <button type="button" onClick={() => pick(VIP.id)} className="vip group" data-reveal>
            <span className="vip-shine" aria-hidden />
            <span className="vip-inner">
              <span className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <span className="block">
                  <span className="vip-badge">👑 PREMIUM · EXPÉRIENCE COMPLÈTE</span>
                  <span className="vip-title display mt-4 block text-[13vw] leading-[0.85] sm:text-7xl">
                    {VIP.name.replace(/^Pack /, "")}
                  </span>
                  <span className="mt-3 block max-w-md text-sm text-[#f3e7c9]/75 sm:text-base">
                    El pack el VIP : produit mte3ek, hjema w lahya — t5arej king.
                  </span>
                  <span className="mt-4 flex flex-wrap gap-2">
                    {(VIP.sub ?? "").split(" + ").map((x) => (
                      <span key={x} className="vip-chip">✦ {x}</span>
                    ))}
                    <span className="vip-chip">⏱ {VIP.durationMin} min</span>
                  </span>
                </span>
                <span className="flex flex-wrap items-end justify-between gap-4 sm:flex-col sm:flex-nowrap sm:items-end sm:gap-6">
                  <span className="text-right">
                    <span className="vip-price display block text-7xl sm:text-8xl">{VIP.price}</span>
                    <span className="font-mono text-xs tracking-[0.3em] text-[#f3e7c9]/70">DINARS</span>
                  </span>
                  <span className="vip-cta">
                    Réservi Za9lamni <span aria-hidden>→</span>
                  </span>
                </span>
              </span>
            </span>
          </button>
        )}

        {/* ---- Packs ---- */}
        <h3 className="mb-3 mt-12 font-mono text-xs tracking-[0.3em] text-cyan">// PACKS — T5ALLES 9AL</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {PACKS.map((s, i) => (
            <PriceCard key={s.id} s={s} onPick={pick} delay={i * 70} />
          ))}
        </div>

        {/* ---- Services seuls ---- */}
        <h3 className="mb-3 mt-12 font-mono text-xs tracking-[0.3em] text-cyan">// WA7DOU</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {SOLO.map((s, i) => (
            <PriceCard key={s.id} s={s} onPick={pick} delay={i * 70} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PriceCard({ s, onPick, delay }: { s: Service; onPick: (id: string) => void; delay: number }) {
  const save = packSaving(s);
  return (
    <button
      type="button"
      onClick={() => onPick(s.id)}
      className="card card-glow group flex w-full items-center gap-4 px-5 py-5 text-left transition-colors hover:bg-white/[0.03] sm:px-7 sm:py-6"
      data-reveal
      style={{ ["--d" as string]: `${delay}ms` }}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-display text-lg font-extrabold sm:text-2xl">{s.name}</span>
          {save > 0 && (
            <span className="rounded-full border border-cyan/40 bg-cyan/10 px-2 py-0.5 font-mono text-[10px] tracking-[0.15em] text-cyan">
              −{save} DT
            </span>
          )}
        </span>
        <span className="mt-1 block text-sm text-fg/70">{s.sub}</span>
        <span className="mt-1 inline-block font-mono text-xs text-muted">⏱ {s.durationMin} min</span>
      </span>
      <span className="text-right">
        <span className="display text-4xl sm:text-5xl">{s.price}</span>
        <span className="ml-1 font-mono text-xs text-muted">DT</span>
      </span>
      <span
        aria-hidden
        className="hidden h-10 w-10 shrink-0 place-items-center rounded-full border border-line transition-all group-hover:border-fg group-hover:bg-fg group-hover:text-black sm:grid"
      >
        →
      </span>
    </button>
  );
}
