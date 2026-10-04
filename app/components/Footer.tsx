import { SITE } from "@/config/site";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden border-t border-line px-4 pb-28 pt-16 sm:px-6 sm:pb-12">
      <div className="mx-auto max-w-6xl">
        <div className="display select-none text-[19vw] leading-none text-white/[0.04] sm:text-[11rem]" aria-hidden>
          3EBCHI
        </div>
        <div className="mt-6 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <div className="font-display text-2xl font-black">
              3EBCHI STYLE<span className="text-cyan">.</span>
            </div>
            <p className="mt-1 font-mono text-xs tracking-[0.2em] text-muted">#3EBCHI_STYLE — LET&apos;S SHAKE THINGS UP 🔥</p>
          </div>
          <div className="flex flex-wrap gap-5 text-sm font-semibold text-muted">
            <a href={SITE.tiktokUrl} target="_blank" rel="noopener noreferrer" className="hover:text-fg">TikTok ↗</a>
            <a href={SITE.mapsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-fg">Maps ↗</a>
          </div>
        </div>
        <p className="mt-8 font-mono text-xs text-muted/60">© {year} {SITE.name}</p>
      </div>
    </footer>
  );
}
