"use client";

import { smoothScrollTo } from "@/lib/smoothScroll";
import Image from "next/image";
import { BARBERS } from "@/config/site";
import SectionHead from "./SectionHead";
import SocialIcon from "./SocialIcon";

const LABEL = { tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook" } as const;

export default function Barbers() {
  function pick(id: string) {
    window.dispatchEvent(new CustomEvent("select-barber", { detail: id }));
    smoothScrollTo("booking");
  }

  return (
    <section id="barbers" className="px-4 py-20 sm:px-6 sm:py-28" aria-label="Les hajema">
      <div className="mx-auto max-w-6xl">
        <SectionHead n="02" label="L'équipe" title="A5tar" outline="l'hajem" sub="Kol wa7ed w style mte3ou. Réservi direct m3a eli t7eb." />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {BARBERS.map((b, i) => (
            <article
              key={b.id}
              className="card card-glow group overflow-hidden p-2"
              data-reveal
              style={{ ["--d" as string]: `${i * 90}ms` }}
            >
              <div className="relative aspect-[4/5] overflow-hidden rounded-[16px] bg-surface">
                {b.photo ? (
                  <Image
                    src={b.photo}
                    alt={`Hajem ${b.name}`}
                    fill
                    sizes="(min-width: 1024px) 270px, 50vw"
                    className="object-cover grayscale-[35%] transition-all duration-700 group-hover:scale-105 group-hover:grayscale-0"
                  />
                ) : (
                  <div className="display grid h-full place-items-center text-6xl text-muted">{b.name.slice(0, 2)}</div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
                {b.isOwner && (
                  <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[10px] tracking-[0.15em] text-cyan backdrop-blur">
                    FOUNDER 🦍
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <h3 className="display text-2xl sm:text-3xl">{b.name}</h3>
                  <p className="mt-1 text-xs text-fg/75 sm:text-sm">{b.tagline}</p>
                </div>
              </div>
              {b.socials && b.socials.length > 0 && (
                <div className="mt-2 flex gap-1.5">
                  {b.socials.map((so) => (
                    <a
                      key={so.url}
                      href={so.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${b.name} sur ${LABEL[so.kind]}`}
                      title={LABEL[so.kind]}
                      className="grid h-10 flex-1 place-items-center rounded-[12px] border border-line text-fg/80 transition-colors hover:border-white/30 hover:bg-white/[0.06] hover:text-fg"
                    >
                      <SocialIcon kind={so.kind} />
                    </a>
                  ))}
                </div>
              )}
              <button
                onClick={() => pick(b.id)}
                className="mt-2 flex w-full items-center justify-between rounded-[14px] border border-line px-3 py-3 text-left text-sm font-bold transition-colors hover:bg-white hover:text-black"
              >
                Réservi m3ah
                <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
