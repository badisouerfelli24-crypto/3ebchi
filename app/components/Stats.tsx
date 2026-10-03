"use client";

import { useEffect, useRef, useState } from "react";
import { STATS } from "@/config/site";

/** "1.5K+" -> { num: 1.5, suffix: "K+" } */
function parse(v: string) {
  const m = v.match(/^([\d.]+)(.*)$/);
  return m ? { num: parseFloat(m[1]), suffix: m[2], dec: (m[1].split(".")[1] || "").length } : null;
}

function CountUp({ value }: { value: string }) {
  const p = parse(value);
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(p ? (0).toFixed(p.dec) + p.suffix : value);

  useEffect(() => {
    if (!p || !ref.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(value); return; }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / 1400);
        const eased = 1 - Math.pow(1 - k, 4);
        setShown((p.num * eased).toFixed(p.dec) + p.suffix);
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span ref={ref}>{shown}</span>;
}

export default function Stats() {
  return (
    <section className="px-4 py-16 sm:px-6" aria-label="Chiffres">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-3 sm:grid-cols-3">
        {STATS.map((s, i) => (
          <div key={i} className="card px-6 py-7" data-reveal style={{ ["--d" as string]: `${i * 90}ms` }}>
            <div className="display chroma text-6xl">
              <CountUp value={s.value} />
            </div>
            <div className="mt-3 font-mono text-xs uppercase tracking-[0.2em] text-muted">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
