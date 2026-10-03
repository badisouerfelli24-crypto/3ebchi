const WORDS = ["FADE", "TAPER", "LINE-UP", "SKIN FADE", "BEARD", "CONTOURS", "KIDS CUT", "SOIN"];
const COLORS = ["text-violet", "text-cyan", "text-pink", "text-fg"];

/** Bandeau défilant multicolore (style portfolio). */
export default function Marquee() {
  const row = [...WORDS, ...WORDS];
  return (
    <div className="marquee-wrap relative overflow-hidden border-y border-line bg-white/[0.015] py-4" aria-hidden>
      <div className="marquee">
        {[0, 1].map((k) => (
          <div key={k} className="flex shrink-0 items-center">
            {row.map((w, i) => (
              <span key={i} className="flex items-center font-mono text-sm tracking-[0.3em]">
                <span className={`px-6 ${COLORS[i % COLORS.length]}`}>{w}</span>
                <span className="text-muted">→</span>
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-bg to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-bg to-transparent" />
    </div>
  );
}
