import Image from "next/image";
import { BARBERS, SITE, STATS } from "@/config/site";

/** Découpe un mot en lettres animées (apparition décalée). */
function Split({ text, offset = 0 }: { text: string; offset?: number }) {
  return (
    <span className="split" aria-label={text}>
      {[...text].map((c, i) => (
        <span key={i} aria-hidden style={{ ["--i" as string]: i + offset }}>
          {c}
        </span>
      ))}
    </span>
  );
}

export default function Hero() {
  return (
    <header id="top" className="relative px-4 pb-16 pt-28 sm:px-6 sm:pb-24 sm:pt-40">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.25fr_0.75fr]">
        <div>
          <p className="label" data-reveal>
            // Hajem — Tunis 🇹🇳
          </p>

          <h1 className="display mt-5 text-[22vw] sm:text-[9.5rem] lg:text-[10.5rem]">
            <span className="glitch chroma block" data-text="3EBCHI">
              <Split text="3EBCHI" />
            </span>
            <span className="outline-text block">
              <Split text="STYLE" offset={6} />
            </span>
          </h1>

          <p
            className="mt-8 max-w-xl font-display text-2xl font-extrabold leading-tight sm:text-4xl"
            data-reveal
            style={{ ["--d" as string]: "500ms" }}
          >
            Coupe propre, style 3ebchi.{" "}
            <span className="text-muted">Let&apos;s shake things up 🔥</span>
          </p>

          <p
            className="mt-4 max-w-lg text-base text-muted sm:text-lg"
            data-reveal
            style={{ ["--d" as string]: "600ms" }}
          >
            Fade, contours, barbe — réservi blastek fi 30 secondes. Ma tstannech, ma tcallich.
          </p>

          <div
            className="mt-9 flex flex-col gap-3 sm:flex-row"
            data-reveal
            style={{ ["--d" as string]: "700ms" }}
          >
            <a href="#booking" className="btn btn-primary text-lg">
              Réservi tawa <span aria-hidden>→</span>
            </a>
            <a href="#reels" className="btn btn-ghost text-lg">
              Chouf l&apos;reels <span aria-hidden>↓</span>
            </a>
          </div>

          {/* Preuve sociale : avatars des barbers */}
          <div
            className="mt-10 flex items-center gap-4"
            data-reveal
            style={{ ["--d" as string]: "800ms" }}
          >
            <div className="flex -space-x-3">
              {BARBERS.filter((b) => b.photo).map((b) => (
                <Image
                  key={b.id}
                  src={b.photo!}
                  alt={b.name}
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-full border-2 border-bg object-cover"
                />
              ))}
            </div>
            <div className="text-sm leading-tight">
              <div className="font-bold">{BARBERS.length} hajema · {SITE.city}</div>
              <div className="font-mono text-xs text-muted">
                {STATS[0]?.value} followers · {STATS[1]?.value} likes
              </div>
            </div>
          </div>
        </div>

        {/* Composition graphique : barber pole + badge rotatif */}
        <div className="relative mx-auto h-[380px] w-full max-w-[340px] sm:h-[460px]" aria-hidden>
          {/* halo */}
          <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet/20 blur-3xl" />

          {/* barber pole */}
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
            <div className="h-6 w-20 rounded-t-2xl border border-line bg-gradient-to-b from-zinc-300 to-zinc-600" />
            <div className="pole h-64 w-14 sm:h-80 sm:w-16" />
            <div className="h-6 w-20 rounded-b-2xl border border-line bg-gradient-to-b from-zinc-600 to-zinc-300" />
          </div>

          {/* badge circulaire rotatif */}
          <svg viewBox="0 0 200 200" className="spin-slow absolute -right-2 top-2 h-36 w-36 sm:h-40 sm:w-40">
            <defs>
              <path id="circle" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
            </defs>
            <circle cx="100" cy="100" r="96" fill="rgba(10,10,11,0.75)" stroke="rgba(255,255,255,0.12)" />
            <text fill="#f5f5f4" fontSize="15.5" fontWeight="800" letterSpacing="3.2" fontFamily="var(--font-mono)">
              <textPath href="#circle">HAJEM KING · #3EBCHI_STYLE · TUNIS · </textPath>
            </text>
            <text x="100" y="114" textAnchor="middle" fontSize="40">
              🦍
            </text>
          </svg>

          {/* chips flottants */}
          <div className="card absolute bottom-10 left-0 z-10 !bg-[#141416] px-4 py-3 shadow-2xl sm:bottom-16">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan">Best reel</div>
            <div className="font-display text-2xl font-black">{STATS[2]?.value} views</div>
          </div>
          <div className="card absolute right-0 top-[55%] z-10 !bg-[#141416] px-3 py-2 shadow-2xl sm:right-2">
            <div className="text-sm font-bold">✂️ Fade · Taper · Beard</div>
          </div>
        </div>
      </div>
    </header>
  );
}
