import { HOURS, SITE } from "@/config/site";
import Reveal from "./Reveal";

export default function Location() {
  // Ordre d'affichage : Lundi -> Dimanche
  const ordered = [1, 2, 3, 4, 5, 6, 0]
    .map((d) => HOURS.find((h) => h.day === d))
    .filter(Boolean) as typeof HOURS;

  return (
    <section id="location" className="px-5 py-14" aria-label="Adresse et horaires">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <span className="sticker text-base">📍 Win tal9ana?</span>
          <h2 className="mt-4 font-marker text-4xl text-chalk sm:text-5xl">
            <span className="tag-underline">Location</span> &amp; horaires
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Reveal className="tape-card flex flex-col justify-center rounded-xl p-6 text-center">
            <div className="text-5xl">🗺️</div>
            <p className="mt-4 text-lg text-chalk/90">{SITE.city}</p>
            <a
              href={SITE.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="spray-btn mx-auto mt-5 inline-block rounded-md bg-spray px-6 py-3 font-bebas text-xl tracking-wide text-ink"
            >
              Win tal9ana? → Maps
            </a>
            <a
              href={SITE.tiktokUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="spray-btn mx-auto mt-3 inline-block rounded-md border-2 border-chalk/50 px-6 py-3 font-bebas text-xl tracking-wide text-chalk"
            >
              Suivi na 3la TikTok {SITE.tiktokHandle} ↗
            </a>
          </Reveal>

          <Reveal className="tape-card rounded-xl p-6">
            <h3 className="mb-4 font-marker text-2xl text-spray">Horaires</h3>
            <ul className="divide-y divide-chalk/10">
              {ordered.map((h) => (
                <li key={h.day} className="flex items-center justify-between py-2">
                  <span className="font-bebas text-lg tracking-wide text-chalk/80">
                    {h.label}
                  </span>
                  {h.closed ? (
                    <span className="font-bebas text-lg tracking-wide text-hot">Fermé</span>
                  ) : (
                    <span className="font-bebas text-lg tracking-wide text-chalk">
                      {h.open} – {h.close}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
