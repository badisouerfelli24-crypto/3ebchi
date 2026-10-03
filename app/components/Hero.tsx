import Image from "next/image";
import { BARBERS, SITE, STATS } from "@/config/site";
import LiveSlots from "./LiveSlots";

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

        {/* Widget LIVE : prochaines places libres de chaque hajem (cliquables) */}
        <div className="relative mx-auto w-full max-w-[420px]">
          <div aria-hidden className="absolute -inset-8 -z-10 rounded-full bg-violet/15 blur-3xl" />
          <LiveSlots />
        </div>
      </div>
    </header>
  );
}
