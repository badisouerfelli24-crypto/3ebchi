"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { getBarber } from "@/config/site";
import { todayTunis, nextDays, labelDateShort, weekdayOf } from "@/lib/time";

/* Widget "LIVE" du hero : prochaines places libres de chaque hajem (données
   réelles). Un tap sur un créneau ouvre la réservation pré-remplie
   (hajem + nhar + wa9t) : le client n'a plus qu'à choisir le service. */

type Row = { barber: string; slots: { date: string; time: string }[] };
const DAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function dayLabel(d: string) {
  const today = todayTunis();
  const tomorrow = nextDays(2)[1];
  if (d === today) return "Lyoum";
  if (d === tomorrow) return "Ghodwa";
  return `${DAYS[weekdayOf(d)]} ${labelDateShort(d)}`;
}

export default function LiveSlots() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  const card = useRef<HTMLDivElement>(null);

  // Rafraîchissement : toutes les 60 s tant que le widget est réellement visible
  // (onglet au premier plan, widget à l'écran, réseau disponible). En arrière-plan
  // ou hors écran : aucune requête. Au retour : une seule mise à jour immédiate si
  // les données ont plus de 60 s. Erreurs : nouvelle tentative espacée (2, 4, 8…
  // 10 min max), jamais en rafale. Une seule requête à la fois, réponses périmées ignorées.
  const runRef = useRef<(force?: boolean) => void>(() => {});
  const load = useCallback(() => runRef.current(true), []);

  useEffect(() => {
    const BASE = 60_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ctrl: AbortController | null = null;
    let seq = 0;
    let last = 0;
    let failures = 0;
    let inView = true;
    let stopped = false;
    const active = () => document.visibilityState === "visible" && navigator.onLine !== false && inView;

    function schedule() {
      clearTimeout(timer);
      if (stopped || !active()) return;
      const delay = failures ? Math.min(BASE * 2 ** failures, 10 * BASE) : BASE;
      timer = setTimeout(() => run(), delay);
    }

    async function run(force = false) {
      if (stopped || ctrl) return; // une seule requête en vol
      if (!force && !active()) return;
      const my = ++seq;
      ctrl = new AbortController();
      const abort = ctrl;
      const timeout = setTimeout(() => abort.abort(), 15_000);
      try {
        const r = await fetch("/api/next-slots", { signal: abort.signal });
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (!stopped && my === seq) {
          setRows(d.hajema);
          setError(false);
        }
        failures = 0;
        last = Date.now();
      } catch {
        if (!stopped && my === seq) setError(true);
        failures = Math.min(failures + 1, 4);
      } finally {
        clearTimeout(timeout);
        ctrl = null;
        schedule();
      }
    }
    runRef.current = run;

    function wake() {
      if (!active()) {
        clearTimeout(timer);
        return;
      }
      if (Date.now() - last >= BASE) run();
      else schedule();
    }

    const el = card.current?.parentElement;
    const io = el
      ? new IntersectionObserver(([e]) => {
          inView = e.isIntersecting;
          wake();
        })
      : null;
    if (el && io) io.observe(el);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("offline", wake);
    run(true);

    return () => {
      stopped = true;
      clearTimeout(timer);
      ctrl?.abort();
      io?.disconnect();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", wake);
    };
  }, []);

  // Légère inclinaison 3D qui suit la souris (desktop uniquement)
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(900px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg)`;
      el.style.setProperty("--mx", `${(x + 0.5) * 100}%`);
      el.style.setProperty("--my", `${(y + 0.5) * 100}%`);
    };
    const onLeave = () => (el.style.transform = "");
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  function pick(barber: string, date: string, time: string) {
    window.dispatchEvent(new CustomEvent("prefill-booking", { detail: { barber, date, time } }));
    document.getElementById("booking")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div data-reveal style={{ ["--d" as string]: "650ms" }}>
    <div
      ref={card}
      className="live-card card relative w-full overflow-hidden p-5 transition-transform duration-300 ease-out sm:p-6"
    >
      {/* reflet qui suit la souris */}
      <div aria-hidden className="live-glare pointer-events-none absolute inset-0" />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          <span className="font-mono text-[11px] tracking-[0.2em] text-emerald-300">LIVE</span>
        </div>
        <span className="font-mono text-[11px] tracking-[0.15em] text-muted">Blayes fergha</span>
      </div>

      <h3 className="relative mt-3 font-display text-2xl font-black tracking-tight">
        Chkoun fergh <span className="text-muted">tawa?</span>
      </h3>

      <ul className="relative mt-4 space-y-2">
        {!rows &&
          !error &&
          Array.from({ length: 4 }).map((_, i) => <li key={i} className="h-[62px] animate-pulse rounded-2xl bg-white/[0.04]" />)}

        {error && (
          <li className="rounded-2xl border border-line px-4 py-4 text-sm text-muted">
            Ma najjamnech njibou l&apos;blayes tawa.{" "}
            <button onClick={load} className="text-fg underline underline-offset-4">
              3awed
            </button>
          </li>
        )}

        {rows?.map((r, i) => {
          const h = getBarber(r.barber);
          if (!h) return null;
          return (
            <li
              key={r.barber}
              className="live-row flex items-center gap-3 rounded-2xl border border-line bg-white/[0.02] p-2.5 pr-2"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              {h.photo ? (
                <Image src={h.photo} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-black">{h.name.slice(0, 2)}</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-sm font-extrabold">{h.name}</div>
                <div className="font-mono text-[10px] text-muted">
                  {r.slots[0] ? dayLabel(r.slots[0].date) : "Complet 7 jours"}
                </div>
              </div>
              <div className="flex gap-1.5">
                {r.slots.slice(0, 2).map((s) => (
                  <button
                    key={s.date + s.time}
                    onClick={() => pick(r.barber, s.date, s.time)}
                    className="slot-chip rounded-xl border border-white/15 px-2.5 py-2 text-center transition-all hover:-translate-y-0.5 hover:border-fg hover:bg-fg hover:text-black"
                    aria-label={`Réservi m3a ${h.name} ${dayLabel(s.date)} 3la ${s.time}`}
                  >
                    <span className="block font-mono text-[13px] font-medium leading-none">{s.time}</span>
                    {s.date !== r.slots[0].date && (
                      <span className="mt-1 block font-mono text-[9px] leading-none opacity-70">{dayLabel(s.date)}</span>
                    )}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="relative mt-4 font-mono text-[10px] tracking-[0.12em] text-muted">
        Tap 3la wa9t → réservi direct ✂️
      </p>
    </div>
    </div>
  );
}
