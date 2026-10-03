import { HOURS, SITE } from "@/config/site";
import SectionHead from "./SectionHead";

export default function Location() {
  const ordered = [1, 2, 3, 4, 5, 6, 0].map((d) => HOURS.find((h) => h.day === d)).filter(Boolean) as typeof HOURS;

  return (
    <section id="location" className="px-4 py-20 sm:px-6 sm:py-28" aria-label="Adresse et horaires">
      <div className="mx-auto max-w-6xl">
        <SectionHead n="05" label="Location" title="Win" outline="tal9ana?" />

        <div className="grid gap-3 md:grid-cols-2">
          <a
            href={SITE.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="card card-glow group relative flex min-h-[280px] flex-col justify-between overflow-hidden p-6 sm:p-8"
            data-reveal
          >
            {/* grille "carte" stylisée */}
            <div
              aria-hidden
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px)",
                backgroundSize: "28px 28px",
                maskImage: "radial-gradient(circle at 60% 50%, #000 20%, transparent 75%)",
              }}
            />
            <div aria-hidden className="absolute left-[60%] top-1/2 -translate-x-1/2 -translate-y-1/2">
              <span className="absolute -inset-6 animate-ping rounded-full bg-cyan/20" />
              <span className="relative grid h-12 w-12 place-items-center rounded-full bg-cyan text-xl text-black shadow-[0_0_40px_rgba(34,211,238,.6)]">💈</span>
            </div>
            <p className="label relative">// {SITE.city}</p>
            <div className="relative">
              <div className="display text-4xl sm:text-5xl">Ouvrir Maps</div>
              <div className="mt-2 inline-flex items-center gap-2 font-semibold text-muted transition-colors group-hover:text-fg">
                Itinéraire direct <span aria-hidden className="transition-transform group-hover:translate-x-1">↗</span>
              </div>
            </div>
          </a>

          <div className="card p-6 sm:p-8" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="label">// Horaires</p>
            <ul className="mt-5 divide-y divide-line">
              {ordered.map((h) => (
                <li key={h.day} className="flex items-center justify-between py-3">
                  <span className="font-semibold">{h.label}</span>
                  {h.closed ? (
                    <span className="rounded-full border border-pole/40 bg-pole/10 px-2.5 py-0.5 font-mono text-xs text-pole">Fermé</span>
                  ) : (
                    <span className="font-mono text-sm text-fg/85">{h.open} — {h.close}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
