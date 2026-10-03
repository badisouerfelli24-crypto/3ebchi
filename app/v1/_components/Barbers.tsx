"use client";

import Image from "next/image";
import { BARBERS } from "@/config/site";
import Reveal from "./Reveal";

/** Avatar : photo si dispo, sinon initiales. */
function Avatar({ name, photo }: { name: string; photo?: string }) {
  if (photo) {
    return (
      <div className="mx-auto h-24 w-24 overflow-hidden rounded-full border-4 border-spray shadow-[3px_3px_0_rgba(0,0,0,0.6)]">
        <Image
          src={photo}
          alt={`Barber ${name}`}
          width={96}
          height={96}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-4 border-ink bg-gradient-to-br from-spray to-hot font-marker text-3xl text-ink shadow-[3px_3px_0_rgba(0,0,0,0.6)]">
      {initials}
    </div>
  );
}

export default function Barbers() {
  function pick(id: string) {
    window.dispatchEvent(new CustomEvent("select-barber", { detail: id }));
    document.getElementById("booking")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <section id="barbers" className="px-5 py-14" aria-label="Les barbiers">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <span className="sticker text-base">🦍 L&apos;équipe</span>
          <h2 className="mt-4 font-marker text-4xl text-chalk sm:text-5xl">
            <span className="tag-underline">A5tar</span> l&apos;barber mte3ek
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {BARBERS.map((b, i) => (
            <Reveal
              key={b.id}
              className="tape-card flex flex-col items-center rounded-xl px-5 pb-6 pt-8 text-center"
            >
              <div style={{ transform: `rotate(${i % 2 === 0 ? -2 : 2}deg)` }}>
                <Avatar name={b.name} photo={b.photo} />
              </div>
              <h3 className="mt-4 font-marker text-2xl text-spray">{b.name}</h3>
              <p className="mt-1 min-h-[2.5rem] text-sm text-chalk/70">
                {b.tagline}
              </p>
              <button
                onClick={() => pick(b.id)}
                className="spray-btn mt-4 w-full rounded-md bg-hot px-4 py-3 font-bebas text-lg tracking-wide text-chalk"
              >
                Réservi m3ah 💈
              </button>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
