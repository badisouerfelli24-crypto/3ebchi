"use client";

import { useEffect, useState } from "react";

const LINKS = [
  { href: "#reels", label: "Reels" },
  { href: "#barbers", label: "Barbers" },
  { href: "#prix", label: "Prix" },
  { href: "#location", label: "Win tal9ana" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  return (
    <>
      <nav
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
          scrolled ? "border-b border-line bg-bg/70 backdrop-blur-xl" : "border-b border-transparent"
        }`}
        aria-label="Navigation principale"
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:h-[72px] sm:px-6">
          <a href="#top" className="font-display text-lg font-black tracking-tight" aria-label="3ebchi style — accueil">
            3EBCHI<span className="text-cyan">.</span>
          </a>

          <div className="hidden items-center gap-8 md:flex">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-sm font-semibold text-muted transition-colors hover:text-fg">
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <a href="#booking" className="btn btn-primary !px-5 !py-2.5 text-sm">
              Réservi
              <span aria-hidden>→</span>
            </a>
            <button
              onClick={() => setOpen(true)}
              className="grid h-11 w-11 place-items-center rounded-full border border-line md:hidden"
              aria-label="Ouvrir le menu"
              aria-expanded={open}
            >
              <span className="flex flex-col gap-[5px]">
                <span className="block h-[2px] w-5 bg-fg" />
                <span className="block h-[2px] w-3.5 bg-fg" />
              </span>
            </button>
          </div>
        </div>
      </nav>

      {/* Menu plein écran mobile */}
      <div
        className={`fixed inset-0 z-[60] bg-bg/95 backdrop-blur-xl transition-opacity duration-500 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
      >
        <div className="flex h-16 items-center justify-between px-4">
          <span className="font-display text-lg font-black">
            3EBCHI<span className="text-cyan">.</span>
          </span>
          <button
            onClick={() => setOpen(false)}
            className="grid h-11 w-11 place-items-center rounded-full border border-line text-xl"
            aria-label="Fermer le menu"
          >
            ×
          </button>
        </div>
        <div className="flex flex-col gap-2 px-6 pt-10">
          {LINKS.map((l, i) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="display border-b border-line py-4 text-5xl transition-all duration-700"
              style={{
                transitionDelay: open ? `${80 + i * 60}ms` : "0ms",
                transform: open ? "none" : "translateY(20px)",
                opacity: open ? 1 : 0,
              }}
            >
              {l.label}
            </a>
          ))}
          <a href="#booking" onClick={() => setOpen(false)} className="btn btn-primary mt-8 w-full text-lg">
            Réservi tawa 💈
          </a>
        </div>
      </div>
    </>
  );
}
