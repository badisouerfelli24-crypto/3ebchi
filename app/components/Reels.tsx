"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VIDEOS, SITE } from "@/config/site";
import SectionHead from "./SectionHead";

/* Carrousel horizontal de reels hébergés sur le site (MP4 + poster).
   - Aucune intégration TikTok : pas de logo, pas de boutons, pas d'écran noir.
   - Un seul reel joue à la fois (celui le plus visible) ; les autres sont en pause.
   - Les vidéos ne se chargent qu'à l'approche (perf mobile).
   - Indice "3adi b sob3ek" + petite vibration la 1ère fois que le carrousel apparaît. */

export default function Reels() {
  const scroller = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const ratios = useRef<number[]>(VIDEOS.map(() => 0));
  const [active, setActive] = useState(-1);
  const [loaded, setLoaded] = useState<boolean[]>(VIDEOS.map(() => false));
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [hint, setHint] = useState<"idle" | "show" | "done">("idle");
  const [nudge, setNudge] = useState(false);

  // --- Choisir le reel actif = le plus visible (>= 60 %) ---
  useEffect(() => {
    const els = videos.current.map((v) => v?.parentElement).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = Number((e.target as HTMLElement).dataset.idx);
          ratios.current[i] = e.isIntersecting ? e.intersectionRatio : 0;
        }
        let best = -1;
        let bestR = 0.59; // à égalité (desktop), le premier visible gagne
        ratios.current.forEach((r, i) => {
          if (r > bestR) {
            best = i;
            bestR = r;
          }
        });
        setActive(best);
      },
      { threshold: [0, 0.3, 0.6, 0.8, 1] }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // --- Charger l'actif + le suivant, jouer l'actif, mettre en pause le reste ---
  useEffect(() => {
    if (active >= 0) {
      setLoaded((prev) => {
        const next = [...prev];
        next[active] = true;
        if (active + 1 < next.length) next[active + 1] = true;
        return next;
      });
    }
    videos.current.forEach((v, i) => {
      if (!v) return;
      if (i === active) {
        v.muted = muted;
        const p = v.play();
        if (p) p.catch(() => {});
      } else {
        v.pause();
      }
    });
    setProgress(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, loaded[active]]);

  useEffect(() => {
    videos.current.forEach((v) => v && (v.muted = muted));
  }, [muted]);

  // --- Indice de swipe : seulement quand le carrousel arrive à l'écran ---
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || e.intersectionRatio < 0.55) return;
        io.disconnect();
        setHint("show");
        if (!reduce) setNudge(true);
        try {
          navigator.vibrate?.([14, 60, 14]); // vibration légère (Android, si autorisé)
        } catch {}
      },
      { threshold: [0, 0.55, 0.8] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (hint !== "show") return;
    const t = setTimeout(() => setHint("done"), 4200);
    return () => clearTimeout(t);
  }, [hint]);

  const dismissHint = useCallback(() => {
    if (hint === "show") setHint("done");
  }, [hint]);

  const scrollBy = (dir: number) => {
    const el = scroller.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-idx]");
    el.scrollBy({ left: dir * ((card?.offsetWidth || 300) + 12), behavior: "smooth" });
  };

  return (
    <section id="reels" ref={section} className="relative py-20 sm:py-28" aria-label="Reels">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex items-end justify-between gap-6">
          <SectionHead n="01" label="Reels" title="Chouf" outline="l'khedma" sub="Coupes réelles, clients réels. Swipe w chouf." />
          <div className="mb-14 hidden gap-2 sm:flex">
            <button onClick={() => scrollBy(-1)} className="grid h-12 w-12 place-items-center rounded-full border border-line hover:border-fg/40" aria-label="Reel précédent">
              ←
            </button>
            <button onClick={() => scrollBy(1)} className="grid h-12 w-12 place-items-center rounded-full border border-line hover:border-fg/40" aria-label="Reel suivant">
              →
            </button>
          </div>
        </div>
      </div>

      <div className="relative">
        <div
          ref={scroller}
          onScroll={dismissHint}
          onPointerDown={dismissHint}
          className={`reels flex gap-3 overflow-x-auto pb-4 ${nudge ? "nudge" : ""}`}
          onAnimationEnd={() => setNudge(false)}
        >
          {VIDEOS.map((v, i) => (
            <article
              key={v.src}
              data-idx={i}
              className="scan relative aspect-[9/16] w-[62vw] max-w-[320px] shrink-0 overflow-hidden rounded-[22px] border border-line bg-surface sm:w-[300px]"
              onClick={() => setMuted((m) => !m)}
            >
              <video
                ref={(el) => {
                  videos.current[i] = el;
                }}
                className="absolute inset-0 h-full w-full object-cover"
                poster={v.poster}
                src={loaded[i] ? v.src : undefined}
                muted
                playsInline
                loop
                preload={loaded[i] ? "auto" : "none"}
                disablePictureInPicture
                controlsList="nodownload nofullscreen noremoteplayback"
                aria-label={v.title}
                onTimeUpdate={(e) => {
                  if (i !== active) return;
                  const t = e.currentTarget;
                  if (t.duration) setProgress(t.currentTime / t.duration);
                }}
              />

              {/* dégradés + infos */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

              <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
                <span className="rounded-full bg-black/50 px-2.5 py-1 font-mono text-[10px] tracking-[0.15em] text-fg backdrop-blur">
                  {String(i + 1).padStart(2, "0")} / {String(VIDEOS.length).padStart(2, "0")}
                </span>
              </div>

              <button
                className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-sm backdrop-blur"
                aria-label={muted ? "Activer le son" : "Couper le son"}
                onClick={(e) => {
                  e.stopPropagation();
                  setMuted((m) => !m);
                }}
              >
                {muted ? "🔇" : "🔊"}
              </button>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
                <div className="font-display text-lg font-extrabold leading-tight">{v.title}</div>
                <div className="mt-1 font-mono text-xs text-fg/70">▶ {v.views} views</div>
                <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-white/15">
                  <div
                    className="reel-progress h-full bg-gradient-to-r from-cyan via-violet to-pink"
                    style={{ transform: `scaleX(${i === active ? progress : 0})` }}
                  />
                </div>
              </div>
            </article>
          ))}
          <div className="w-1 shrink-0" aria-hidden />
        </div>

        {/* Indice de swipe : doigt gris + "3adi b sob3ek" */}
        <div
          className={`swipe-hint pointer-events-none absolute inset-0 z-10 flex items-center justify-center ${
            hint === "show" ? "opacity-100" : "translate-y-2 opacity-0"
          }`}
          aria-hidden={hint !== "show"}
        >
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-black/55 px-6 py-5 backdrop-blur-md">
            <div className="relative h-14 w-24">
              <div className="swipe-trail absolute right-6 top-[18px] h-[3px] w-16 rounded-full bg-gradient-to-l from-zinc-300/0 via-zinc-300/70 to-zinc-300/0" />
              <svg viewBox="0 0 48 56" className="swipe-finger absolute right-4 top-0 h-14 w-12" fill="none">
                {/* main stylisée grise (index pointé) */}
                <path
                  d="M17 30V9.5a4 4 0 0 1 8 0V25l1.2-.6a4 4 0 0 1 5.3 1.6l.5.9.9-.4a4 4 0 0 1 5.4 2l.4.9a4 4 0 0 1 5.1 2.6l1.2 3.6c1.4 4.3.6 9-2.2 12.6L40 51a9 9 0 0 1-7.1 3.5H24a9 9 0 0 1-7.4-3.9l-7.3-10.7a3.6 3.6 0 0 1 5.5-4.6L17 37.4"
                  fill="#a1a1aa"
                  stroke="#e4e4e7"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="font-display text-lg font-extrabold tracking-tight text-zinc-200">3adi b sob3ek</span>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-6xl px-4 sm:px-6">
        <a href={SITE.tiktokUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-xs tracking-[0.2em] text-muted hover:text-fg">
          {SITE.tiktokHandle} — kol l&apos;khedma ↗
        </a>
      </div>
    </section>
  );
}
