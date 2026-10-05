"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { delta } from "./lib";

/* ---------------- Icônes (traits 1.75, 20px) ---------------- */
const paths: Record<string, ReactNode> = {
  chart: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 14 4-4 3 3 5-6" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  bellOff: <><path d="M8.7 3A6 6 0 0 1 18 8c0 3 .5 5.2 1.2 6.7" /><path d="M17 17H3s3-2 3-9c0-.6.1-1.2.3-1.8" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /><path d="m2 2 20 20" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  ghost: <><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  chat: <path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.3A8.5 8.5 0 1 1 21 12Z" />,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  arrowUp: <path d="M12 19V5M5 12l7-7 7 7" />,
  arrowDown: <path d="M12 5v14M19 12l-7 7-7-7" />,
  arrowRight: <path d="M5 12h14M13 5l7 7-7 7" />,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>,
  table: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M3.5 15h17M10 4.5v15" /></>,
  store: <><path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9" /><path d="M3 10 5 4h14l2 6a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  tag: <><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9Z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  home: <><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z" /></>,
  sparkles: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6 6 2 2M16 16l2 2M6 18l2-2M16 8l2-2" /></>,
};

export function Icon({ name, size = 20, className = "", stroke = 1.75 }: { name: keyof typeof paths | string; size?: number; className?: string; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

/* ---------------- Contrôle segmenté ---------------- */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const place = () => {
      const el = root.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
      if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(root);
    return () => ro.disconnect();
  }, [value, options.length]);

  return (
    <div ref={ref} role="group" aria-label={label} className={`d-seg ${className}`}>
      {thumb && <span className="d-seg-thumb" style={{ left: thumb.left, width: thumb.width }} />}
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Pastille de variation ---------------- */
export function DeltaPill({
  cur,
  prev,
  suffix,
  points = false,
}: {
  cur: number | null;
  prev: number | null | undefined;
  suffix?: string;
  /** true = écart en points de % (pour un taux) */
  points?: boolean;
}) {
  if (cur === null || prev === null || prev === undefined) {
    return suffix ? <span className="text-[11.5px] text-[var(--ink-3)]">{suffix}</span> : null;
  }
  const d = points ? cur - prev : delta(cur, prev);
  if (d === null) {
    return (
      <span className="flex items-center gap-1.5">
        <span className="d-pill d-pill-accent">Nouveau</span>
        {suffix && <span className="text-[11.5px] text-[var(--ink-3)]">{suffix}</span>}
      </span>
    );
  }
  const flat = Math.abs(d) < 0.005;
  const up = d > 0;
  const text = points ? `${up ? "+" : ""}${Math.round(d * 100)} pts` : `${up ? "+" : ""}${Math.round(d * 100)}%`;
  return (
    <span className="flex items-center gap-1.5">
      <span className={`d-pill ${flat ? "d-pill-neutral" : up ? "d-pill-good" : "d-pill-crit"}`}>
        {!flat && <Icon name={up ? "arrowUp" : "arrowDown"} size={12} stroke={2.4} />}
        {flat ? "=" : text}
      </span>
      {suffix && <span className="text-[11.5px] text-[var(--ink-3)]">{suffix}</span>}
    </span>
  );
}

/* ---------------- Switch ---------------- */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="d-switch disabled:opacity-40"
    />
  );
}

/* ---------------- Avatar barbier ---------------- */
export function Avatar({ name, photo, color, size = 28 }: { name: string; photo?: string; color: string; size?: number }) {
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        color: "#fff",
        background: color,
        boxShadow: `0 0 0 2px var(--surface), 0 0 0 3.5px ${color}`,
      }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : (
        name.slice(0, 2)
      )}
    </span>
  );
}

export function CardHeader({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight text-[var(--ink)]">{title}</h3>
        {sub && <p className="mt-0.5 text-[12.5px] text-[var(--ink-3)]">{sub}</p>}
      </div>
      {right}
    </div>
  );
}
