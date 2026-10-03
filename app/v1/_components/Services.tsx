import { SERVICES } from "@/config/site";
import Reveal from "./Reveal";

export default function Services() {
  return (
    <section id="services" className="px-5 py-14" aria-label="Services et prix">
      <div className="relative mx-auto max-w-4xl">
        <div className="pointer-events-none absolute -top-10 right-0 opacity-100">
          <span className="outline-ghost text-[18vw] leading-none sm:text-[9rem]">
            PRIX
          </span>
        </div>

        <div className="relative mb-8 text-center">
          <span className="sticker text-base">✂️ Services</span>
          <h2 className="mt-4 font-marker text-4xl text-chalk sm:text-5xl">
            <span className="tag-underline">Chnowa</span> t7eb ta3mel lyoum?
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SERVICES.map((s) => (
            <Reveal
              key={s.id}
              className="tape-card flex items-center justify-between rounded-lg px-5 py-4"
            >
              <div>
                <div className="font-bebas text-2xl tracking-wide text-chalk">
                  {s.name}
                </div>
                <div className="text-sm text-chalk/50">{s.durationMin} min</div>
              </div>
              <div className="font-marker text-3xl text-spray">
                {s.price}
                <span className="ml-1 text-lg text-hot">DT</span>
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mt-6 text-center text-sm text-chalk/50">
          Prix indicatifs · A5tar w réservi blastek en ligne 💈
        </p>
      </div>
    </section>
  );
}
