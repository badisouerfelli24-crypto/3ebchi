import { STATS } from "@/config/site";
import Reveal from "./Reveal";

export default function Stats() {
  return (
    <section className="px-5 py-10" aria-label="Chiffres">
      <Reveal className="mx-auto max-w-4xl">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STATS.map((s, i) => (
            <div
              key={i}
              className="tape-card rounded-lg px-4 py-6 text-center"
            >
              <div className="font-marker text-4xl text-spray sm:text-5xl">
                {s.value}
              </div>
              <div className="mt-2 font-bebas text-lg tracking-widest text-chalk/70 uppercase">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
