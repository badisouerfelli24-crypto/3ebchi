import { SITE } from "@/config/site";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-10 border-t border-chalk/10 px-5 pb-28 pt-12 sm:pb-12">
      <div className="mx-auto max-w-4xl text-center">
        <div className="font-marker text-3xl text-spray">
          {SITE.name} {SITE.emoji}
        </div>
        <p className="mt-2 font-bebas text-xl tracking-widest text-chalk/70">
          #3ebchi_style — {SITE.tagline}
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
          <a
            href={SITE.tiktokUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bebas text-lg tracking-wide text-chalk hover:text-spray"
          >
            TikTok {SITE.tiktokHandle} ↗
          </a>
          <a
            href={SITE.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bebas text-lg tracking-wide text-chalk hover:text-spray"
          >
            Maps 📍
          </a>
        </div>

        <div className="mt-8 flex items-center justify-center gap-4 text-sm text-chalk/40">
          <span>© {year} {SITE.name}</span>
          <span aria-hidden>·</span>
          <a href="/barber" className="hover:text-chalk/70">
            Espace barber 🔒
          </a>
        </div>
      </div>
    </footer>
  );
}
