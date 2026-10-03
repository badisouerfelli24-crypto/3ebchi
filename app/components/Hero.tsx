import { SITE } from "@/config/site";

export default function Hero() {
  return (
    <header className="relative overflow-hidden px-5 pt-16 pb-14 sm:pt-24 sm:pb-20">
      {/* Texte fantôme géant en fond */}
      <div className="pointer-events-none absolute -top-2 left-0 right-0 text-center">
        <span className="outline-ghost block text-[26vw] sm:text-[20vw] leading-none">
          3EBCHI
        </span>
      </div>

      <div className="relative mx-auto max-w-4xl text-center">
        <div className="mb-5 flex justify-center">
          <span className="sticker text-lg sm:text-xl">🦍 Barber King</span>
        </div>

        <h1 className="font-marker text-5xl leading-[1.05] sm:text-7xl">
          <span className="tag-underline">3EBCHI</span>{" "}
          <span className="text-spray">STYLE</span>{" "}
          <span className="inline-block">💈</span>
        </h1>

        <p className="mt-6 font-bebas text-3xl tracking-wide text-hot sm:text-5xl">
          {SITE.tagline}
        </p>

        <p className="mx-auto mt-3 max-w-xl text-base text-chalk/80 sm:text-lg">
          {SITE.subline}
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="#booking"
            className="spray-btn w-full rounded-md bg-spray px-8 py-4 font-bebas text-2xl tracking-wide text-ink shadow-[4px_4px_0_rgba(0,0,0,0.7)] sm:w-auto"
          >
            Réservi tawa 💈
          </a>
          <a
            href="#videos"
            className="spray-btn w-full rounded-md border-2 border-chalk/70 bg-transparent px-8 py-4 font-bebas text-2xl tracking-wide text-chalk sm:w-auto"
          >
            Chouf l&apos;videos ↗
          </a>
        </div>

        <p className="mt-6 text-sm text-chalk/50">📍 {SITE.city}</p>
      </div>

      <div className="barber-pole mt-14" aria-hidden />
    </header>
  );
}
