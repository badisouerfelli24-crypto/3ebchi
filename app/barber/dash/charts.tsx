"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { fmtCompact, dayShort, dayLabel } from "./lib";

/* Hook : largeur réelle du conteneur (graphes responsives). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Graduations "rondes" pour l'axe Y. */
function niceTicks(max: number, count = 3): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/* =================================================================
   Courbe d'évolution : aire + ligne, réticule + infobulle au survol /
   au doigt (scrub), navigation clavier ←/→.
   ================================================================= */
export function TrendChart({
  points,
  format,
  label,
  today,
}: {
  points: { date: string; value: number }[];
  format: (n: number) => string;
  label: string;
  today: string;
}) {
  const [wrap, width] = useWidth<HTMLDivElement>();
  const [idx, setIdx] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  const H = 220;
  const pad = { l: 40, r: 12, t: 16, b: 28 };
  const n = points.length;
  const max = Math.max(0, ...points.map((p) => p.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const iw = Math.max(1, width - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / top) * ih;

  const { line, area } = useMemo(() => {
    if (!width || n === 0) return { line: "", area: "" };
    // Courbe monotone (Fritsch–Carlson) : lisse, sans dépasser les données
    // (jamais sous zéro les jours fermés).
    const X = points.map((_, i) => x(i));
    const Y = points.map((p) => y(p.value));
    const m = new Array(n).fill(0);
    const dx: number[] = [], dy: number[] = [];
    for (let i = 0; i < n - 1; i++) { dx.push(X[i + 1] - X[i]); dy.push((Y[i + 1] - Y[i]) / (X[i + 1] - X[i])); }
    for (let i = 1; i < n - 1; i++) m[i] = dy[i - 1] * dy[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / dy[i - 1] + (dx[i] + 2 * dx[i - 1]) / dy[i]);
    if (n > 1) { m[0] = dy[0]; m[n - 1] = dy[n - 2]; }
    let d = `M${X[0]},${Y[0]}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      d += ` C${X[i] + h},${Y[i] + m[i] * h} ${X[i + 1] - h},${Y[i + 1] - m[i + 1] * h} ${X[i + 1]},${Y[i + 1]}`;
    }
    return { line: d, area: `${d} L${x(n - 1)},${pad.t + ih} L${x(0)},${pad.t + ih} Z` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, width, top]);

  const onPointer = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.round(((px) / r.width) * (n - 1));
    setIdx(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, (i ?? n) - 1));
    else if (e.key === "ArrowRight") setIdx((i) => Math.min(n - 1, (i ?? -1) + 1));
    else if (e.key === "Escape") setIdx(null);
    else return;
    e.preventDefault();
  };

  // Étiquettes X : ~5 dates réparties.
  const xLabels = useMemo(() => {
    if (n < 2) return [];
    const k = Math.min(5, n);
    return Array.from({ length: k }, (_, j) => Math.round((j / (k - 1)) * (n - 1)));
  }, [n]);

  const total = points.reduce((s, p) => s + p.value, 0);
  const sel = idx !== null ? points[idx] : null;

  return (
    <div ref={wrap} className="relative select-none" style={{ height: H }}>
      {width > 0 && (
        <svg
          width={width}
          height={H}
          className="d-chart block outline-none"
          role="img"
          aria-label={`${label} : ${format(total)} sur ${n} jours`}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setIdx(null)}
        >
          <defs>
            <linearGradient id={`a${gid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--accent-line)" stopOpacity="0.28" />
              <stop offset="1" stopColor="var(--accent-line)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeDasharray={t === 0 ? undefined : "3 4"} />
              <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end">{fmtCompact(t)}</text>
            </g>
          ))}
          {xLabels.map((i, j) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor={j === 0 ? "start" : j === xLabels.length - 1 ? "end" : "middle"}>
              {points[i].date === today ? "Auj." : dayShort(points[i].date)}
            </text>
          ))}
          <path d={area} fill={`url(#a${gid})`} />
          <path d={line} fill="none" stroke="var(--accent-line)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
            style={{ filter: "drop-shadow(0 4px 10px color-mix(in oklab, var(--accent) 45%, transparent))" }} />
          {sel && idx !== null && (
            <g>
              <line x1={x(idx)} x2={x(idx)} y1={pad.t} y2={pad.t + ih} stroke="var(--ink-3)" strokeDasharray="2 3" />
              <circle cx={x(idx)} cy={y(sel.value)} r={5} fill="var(--accent-line)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
          {/* zone de capture plus large que le tracé */}
          <rect
            x={pad.l}
            y={0}
            width={iw}
            height={H}
            fill="transparent"
            style={{ touchAction: "pan-y", cursor: "crosshair" }}
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={(e) => e.pointerType === "mouse" && setIdx(null)}
          />
        </svg>
      )}
      {sel && idx !== null && (
        <div
          className="d-tooltip"
          style={{ left: Math.min(Math.max(x(idx), 70), width - 70), top: y(sel.value) }}
        >
          <div className="text-[11px] text-[var(--ink-3)]">{dayLabel(sel.date, today)}</div>
          <div className="num text-[15px] font-bold text-[var(--ink)]">{format(sel.value)}</div>
        </div>
      )}
    </div>
  );
}

/* Mini-courbe (tuile KPI) — décorative, la valeur est écrite à côté. */
export function Sparkline({ values, color = "var(--accent-line)" }: { values: number[]; color?: string }) {
  const gid = useId().replace(/:/g, "");
  const W = 100, H = 32;
  const max = Math.max(1, ...values);
  const n = values.length;
  if (n < 2) return null;
  const pts = values.map((v, i) => [(i / (n - 1)) * W, H - 2 - (v / max) * (H - 4)] as const);
  const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-8 w-full" aria-hidden="true">
      <defs>
        <linearGradient id={`s${gid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.25" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#s${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/* Anneau de progression (taux de hjema). */
export function Ring({ value, size = 64, color = "var(--good)" }: { value: number | null; size?: number; color?: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const v = value ?? 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--grid)" strokeWidth={6} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={value === null ? "transparent" : color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${c * v} ${c}`}
        style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.22,1,0.36,1)" }}
      />
    </svg>
  );
}

/* =================================================================
   Barre empilée (issues des réservations) + légende avec chiffres.
   ================================================================= */
export function StackBar({
  parts,
}: {
  parts: { key: string; label: string; value: number; color: string; icon: React.ReactNode }[];
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div>
      <div className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-[6px]" role="img"
        aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
        {total === 0 ? (
          <div className="h-full w-full rounded-[4px]" style={{ background: "var(--grid)" }} />
        ) : (
          parts.filter((p) => p.value > 0).map((p) => (
            <div
              key={p.key}
              onPointerEnter={() => setHover(p.key)}
              onPointerLeave={() => setHover(null)}
              className="h-full rounded-[4px] transition-[flex-grow,opacity] duration-700"
              style={{ flexGrow: p.value, flexBasis: 0, background: p.color, opacity: hover && hover !== p.key ? 0.35 : 1 }}
            />
          ))
        )}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-2">
        {parts.map((p) => (
          <li
            key={p.key}
            onPointerEnter={() => setHover(p.key)}
            onPointerLeave={() => setHover(null)}
            className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors"
            style={{ background: hover === p.key ? "var(--card-hi)" : "transparent" }}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ color: p.color, background: `color-mix(in oklab, ${p.color} 14%, transparent)` }}>
              {p.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] text-[var(--ink-2)]">{p.label}</span>
              <span className="num block text-[15px] font-bold text-[var(--ink)]">
                {p.value}
                <span className="ml-1.5 text-[11px] font-medium text-[var(--ink-3)]">
                  {total ? `${Math.round((p.value / total) * 100)}%` : ""}
                </span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* =================================================================
   Barres horizontales étiquetées (taux par barbier / par période,
   classement). Valeur écrite en clair, couleur = identité.
   ================================================================= */
export function HBars({
  rows,
  max,
  format,
  onSelect,
}: {
  rows: { key: string; label: React.ReactNode; value: number | null; color: string; hint?: string }[];
  max?: number;
  format: (n: number | null) => string;
  onSelect?: (key: string) => void;
}) {
  const top = max ?? Math.max(1e-9, ...rows.map((r) => r.value ?? 0));
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const Tag = onSelect ? "button" : "div";
        return (
          <li key={r.key}>
            <Tag
              {...(onSelect ? { type: "button" as const, onClick: () => onSelect(r.key) } : {})}
              className={`group block w-full text-left ${onSelect ? "rounded-xl p-1 -m-1 transition-colors hover:bg-[var(--card-hi)]" : ""}`}
            >
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                <span className="flex min-w-0 items-center gap-2 font-medium text-[var(--ink-2)]">{r.label}</span>
                <span className="flex items-baseline gap-2">
                  {r.hint && <span className="text-[11px] text-[var(--ink-3)]">{r.hint}</span>}
                  <span className="num text-[14px] font-bold text-[var(--ink)]">{format(r.value)}</span>
                </span>
              </div>
              <div className="h-2.5 w-full rounded-[4px]" style={{ background: "var(--grid)" }}>
                <div
                  className="h-full rounded-[4px] transition-[width] duration-700 ease-out"
                  style={{
                    width: `${r.value === null ? 0 : Math.max(r.value > 0 ? 2 : 0, (r.value / top) * 100)}%`,
                    background: r.color,
                    boxShadow: `0 0 12px -2px color-mix(in oklab, ${r.color} 60%, transparent)`,
                  }}
                />
              </div>
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}

/* Heures de pointe : barres verticales, infobulle au survol / toucher. */
export function HoursChart({ hours }: { hours: number[] }) {
  // On n'affiche que la plage où il y a de l'activité (bornée aux heures d'ouverture probables).
  let first = hours.findIndex((h) => h > 0);
  let last = 23 - [...hours].reverse().findIndex((h) => h > 0);
  if (first < 0) { first = 9; last = 20; }
  first = Math.min(first, 9);
  last = Math.max(last, 20);
  const slice = hours.slice(first, last + 1);
  const max = Math.max(1, ...slice);
  const peak = slice.indexOf(Math.max(...slice));
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? (slice[peak] > 0 ? peak : null);
  return (
    <div>
      <div className="mb-3 h-5 text-[12.5px] text-[var(--ink-2)]">
        {shown !== null && (
          <>
            <span className="num font-bold text-[var(--ink)]">{first + shown}h</span>
            {" · "}
            {slice[shown]} réservation{slice[shown] > 1 ? "s" : ""}
            {hover === null && <span className="ml-1.5 d-pill d-pill-accent">pic</span>}
          </>
        )}
      </div>
      <div className="flex h-28 items-end gap-[2px]" role="img" aria-label={slice.map((v, i) => `${first + i}h : ${v}`).join(", ")}>
        {slice.map((v, i) => (
          <div
            key={i}
            className="flex h-full flex-1 cursor-pointer items-end"
            onPointerEnter={() => setHover(i)}
            onPointerDown={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            <div
              className="w-full rounded-t-[4px] transition-[height,opacity] duration-700"
              style={{
                height: `${v === 0 ? 2 : Math.max(6, (v / max) * 100)}%`,
                background: v === 0 ? "var(--grid)" : "var(--accent-line)",
                opacity: shown === null || shown === i ? 1 : 0.4,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10.5px] text-[var(--ink-3)]">
        <span>{first}h</span>
        <span>{Math.round((first + last) / 2)}h</span>
        <span>{last}h</span>
      </div>
    </div>
  );
}
