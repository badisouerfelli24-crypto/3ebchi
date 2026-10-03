"use client";

import { useCallback, useEffect, useState } from "react";
import { BARBERS, getBarber } from "@/config/site";
import { labelDate, todayTunis, nextDays, labelDateShort, weekdayOf } from "@/lib/time";
import { isClosedDay } from "@/lib/slots";

type Booking = {
  id: string;
  barber: string;
  service: string;
  price: number;
  duration_min: number;
  date: string;
  start_time: string;
  client_name: string;
  phone: string;
  note: string;
  status: string;
};

type Blocked = {
  id: string;
  barber: string;
  date: string;
  start_time: string;
  end_time: string;
  reason: string;
};

type Stats = {
  today: number;
  week: number;
  perBarber: { id: string; name: string; count: number }[];
};

type Data = {
  me: { id: string; name: string; isOwner: boolean };
  viewingAll: boolean;
  bookings: Booking[];
  blocked: Blocked[];
  stats: Stats | null;
};

export default function BarberPage() {
  const [data, setData] = useState<Data | null>(null);
  const [checking, setChecking] = useState(true);
  const [viewAll, setViewAll] = useState(false);

  const load = useCallback(async (all: boolean) => {
    const res = await fetch(`/api/barber/bookings${all ? "?all=1" : ""}`, {
      cache: "no-store",
    });
    if (res.status === 401) {
      setData(null);
      setChecking(false);
      return;
    }
    const d = await res.json();
    if (d.ok) setData(d);
    setChecking(false);
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center text-fg/60">
        Chargement…
      </main>
    );
  }

  if (!data) {
    return <Login onSuccess={() => load(false)} />;
  }

  return (
    <Dashboard
      data={data}
      viewAll={viewAll}
      onToggleAll={(v) => {
        setViewAll(v);
        load(v);
      }}
      reload={() => load(viewAll)}
    />
  );
}

/* ============================ LOGIN ============================ */
function Login({ onSuccess }: { onSuccess: () => void }) {
  const [barber, setBarber] = useState<string>("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/barber/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barber, pin }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        onSuccess();
      } else {
        setError(d.message || "Erreur");
        setPin("");
      }
    } catch {
      setError("Mochkla réseau");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <div className="mb-6 text-center">
        <div className="font-display font-black text-4xl text-cyan">Espace barber 🔒</div>
        <p className="mt-2 text-fg/60">A5tar esmek w da5el l&apos;PIN</p>
      </div>

      <div className="card w-full max-w-sm rounded-xl p-6">
        {!barber ? (
          <div className="grid grid-cols-2 gap-3">
            {BARBERS.map((b) => (
              <button
                key={b.id}
                onClick={() => setBarber(b.id)}
                className="rounded-lg border-2 border-white/15 px-4 py-5 font-display font-black text-xl text-cyan hover:border-cyan"
              >
                {b.name}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <p className="mb-3 text-center text-fg/80">
              Barber : <strong className="text-cyan">{getBarber(barber)?.name}</strong>{" "}
              <button onClick={() => { setBarber(""); setPin(""); setError(""); }} className="ml-2 text-sm underline text-fg/50">
                changer
              </button>
            </p>
            <input
              type="password"
              inputMode="numeric"
              pattern="\d*"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              onKeyDown={(e) => e.key === "Enter" && pin.length === 4 && submit()}
              autoFocus
              aria-label="Code PIN 4 chiffres"
              className="w-full rounded-md border-2 border-white/20 bg-bg px-4 py-4 text-center font-display font-black text-3xl tracking-[0.5em] text-fg focus:border-cyan"
              placeholder="····"
            />
            {error && <p className="mt-3 text-center text-pole">{error}</p>}
            <button
              onClick={submit}
              disabled={busy || pin.length !== 4}
              className="mt-4 w-full rounded-md bg-fg px-6 py-3 font-display font-bold text-xl tracking-wide text-black disabled:opacity-50"
            >
              {busy ? "…" : "Daxel"}
            </button>
          </div>
        )}
      </div>

      <a href="/" className="mt-6 text-sm text-fg/40 underline">
        ← Retour au site
      </a>
    </main>
  );
}

/* ============================ DASHBOARD ============================ */
function Dashboard({
  data,
  viewAll,
  onToggleAll,
  reload,
}: {
  data: Data;
  viewAll: boolean;
  onToggleAll: (v: boolean) => void;
  reload: () => void;
}) {
  const today = todayTunis();

  async function act(id: string, action: "done" | "cancel") {
    if (action === "cancel" && !confirm("Annuler cette réservation ? Le créneau sera libéré.")) {
      return;
    }
    await fetch("/api/barber/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    reload();
  }

  async function logout() {
    await fetch("/api/barber/logout", { method: "POST" });
    location.reload();
  }

  // Regroupe les réservations par jour
  const byDay = new Map<string, Booking[]>();
  for (const b of data.bookings) {
    if (!byDay.has(b.date)) byDay.set(b.date, []);
    byDay.get(b.date)!.push(b);
  }
  const days = [...byDay.keys()].sort();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-display font-black text-3xl text-cyan">
            Ahla {data.me.name} 💈
          </div>
          <p className="text-sm text-fg/50">
            {viewAll ? "Tous les barbiers" : "Tes réservations"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data.me.isOwner && (
            <button
              onClick={() => onToggleAll(!viewAll)}
              className={`rounded-md border-2 px-3 py-2 font-display font-bold tracking-wide ${
                viewAll ? "border-cyan bg-white/10 text-cyan" : "border-white/20 text-fg/70"
              }`}
            >
              {viewAll ? "👑 Tous" : "👑 Voir tous"}
            </button>
          )}
          <button
            onClick={logout}
            className="rounded-md border-2 border-pole px-3 py-2 font-display font-bold tracking-wide text-pole"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Stats owner */}
      {data.stats && (
        <div className="card mb-6 rounded-xl p-5">
          <h2 className="mb-3 font-display font-black text-xl text-cyan">Stats 👑</h2>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-white/[0.03] p-4 text-center">
              <div className="font-display font-black text-3xl text-cyan">{data.stats.today}</div>
              <div className="font-display font-bold tracking-widest text-fg/60">AUJOURD&apos;HUI</div>
            </div>
            <div className="rounded-lg bg-white/[0.03] p-4 text-center">
              <div className="font-display font-black text-3xl text-cyan">{data.stats.week}</div>
              <div className="font-display font-bold tracking-widest text-fg/60">CETTE SEMAINE</div>
            </div>
          </div>
          <ul className="space-y-1">
            {data.stats.perBarber.map((b) => (
              <li key={b.id} className="flex justify-between text-fg/80">
                <span className="font-display font-bold tracking-wide">{b.name}</span>
                <span className="font-display font-black text-cyan">{b.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Réservations */}
      {days.length === 0 && (
        <p className="py-10 text-center text-fg/50">Ma famech réservations 💤</p>
      )}

      {days.map((d) => (
        <div key={d} className="mb-6">
          <h2 className="mb-3 font-display font-bold text-2xl tracking-wide text-fg">
            {d === today ? "🔥 Lyoum — " : ""}
            {labelDate(d)}
          </h2>
          <div className="space-y-3">
            {byDay.get(d)!.map((b) => (
              <BookingCard
                key={b.id}
                b={b}
                showBarber={viewAll}
                onDone={() => act(b.id, "done")}
                onCancel={() => act(b.id, "cancel")}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Blocages */}
      <BlockManager blocked={data.blocked} reload={reload} showBarber={viewAll} />

      <a href="/" className="mt-8 block text-center text-sm text-fg/40 underline">
        ← Retour au site
      </a>
    </main>
  );
}

function BookingCard({
  b,
  showBarber,
  onDone,
  onCancel,
}: {
  b: Booking;
  showBarber: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const tel = `+${b.phone}`;
  const wa = `https://wa.me/${b.phone}`;
  const done = b.status === "done";

  return (
    <div className={`card rounded-lg p-4 ${done ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display font-bold text-2xl tracking-wide text-cyan">
            {b.start_time.slice(0, 5)} · {b.client_name}
          </div>
          <div className="text-sm text-fg/70">
            {b.service} · {b.price} DT · {b.duration_min} min
            {showBarber && <span className="ml-1 text-fg/40">({b.barber})</span>}
          </div>
          {b.note && <div className="mt-1 text-sm text-fg/50">📝 {b.note}</div>}
        </div>
        {done && <span className="chip text-xs">✅ done</span>}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`tel:${tel}`}
          className="rounded-md border border-white/20 px-3 py-2 text-sm text-fg hover:border-cyan"
        >
          📞 {tel}
        </a>
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-green-500/40 px-3 py-2 text-sm text-green-400 hover:border-green-400"
        >
          💬 WhatsApp
        </a>
        {!done && (
          <>
            <button
              onClick={onDone}
              className="rounded-md bg-fg px-3 py-2 text-sm font-bold text-black"
            >
              ✅ Done
            </button>
            <button
              onClick={onCancel}
              className="rounded-md border border-pole px-3 py-2 text-sm text-pole"
            >
              ✖ Annuler
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function BlockManager({
  blocked,
  reload,
  showBarber,
}: {
  blocked: Blocked[];
  reload: () => void;
  showBarber: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [fullDay, setFullDay] = useState(true);
  const [start, setStart] = useState("12:00");
  const [end, setEnd] = useState("13:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const days = nextDays(14).filter((d) => !isClosedDay(d));

  async function create() {
    if (!date) return;
    setBusy(true);
    await fetch("/api/barber/block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        fullDay,
        start_time: fullDay ? undefined : start,
        end_time: fullDay ? undefined : end,
        reason,
      }),
    });
    setBusy(false);
    setDate("");
    setReason("");
    setOpen(false);
    reload();
  }

  async function remove(id: string) {
    await fetch(`/api/barber/block?id=${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="card mt-8 rounded-xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display font-black text-xl text-cyan">Blocages (pause / absence) ⛔</h2>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-md border-2 border-white/20 px-3 py-1 font-display font-bold tracking-wide text-fg/80"
        >
          {open ? "Fermer" : "+ Bloquer"}
        </button>
      </div>

      {open && (
        <div className="mb-4 space-y-3 rounded-lg bg-white/[0.03] p-4">
          <div>
            <label className="mb-1 block text-sm text-fg/60">Nhar</label>
            <div className="grid grid-cols-4 gap-2">
              {days.map((d) => {
                const wd = weekdayOf(d);
                const short = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"][wd];
                return (
                  <button
                    key={d}
                    onClick={() => setDate(d)}
                    className={`rounded-md border-2 px-1 py-2 text-xs ${
                      date === d ? "border-cyan bg-white/10 text-cyan" : "border-white/15 text-fg/70"
                    }`}
                  >
                    {short} {labelDateShort(d)}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-fg/80">
            <input
              type="checkbox"
              checked={fullDay}
              onChange={(e) => setFullDay(e.target.checked)}
            />
            Journée complète
          </label>

          {!fullDay && (
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="rounded-md border-2 border-white/20 bg-bg px-2 py-2 text-fg"
              />
              <span className="text-fg/50">→</span>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="rounded-md border-2 border-white/20 bg-bg px-2 py-2 text-fg"
              />
            </div>
          )}

          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Raison (optionnel)"
            className="w-full rounded-md border-2 border-white/20 bg-bg px-3 py-2 text-fg"
          />

          <button
            onClick={create}
            disabled={busy || !date}
            className="w-full rounded-md bg-pole px-4 py-2 font-display font-bold text-lg tracking-wide text-fg disabled:opacity-50"
          >
            {busy ? "…" : "Bloquer ce créneau"}
          </button>
        </div>
      )}

      {blocked.length === 0 ? (
        <p className="text-sm text-fg/40">Aucun blocage à venir.</p>
      ) : (
        <ul className="space-y-2">
          {blocked.map((bl) => (
            <li
              key={bl.id}
              className="flex items-center justify-between rounded-md bg-white/[0.03] px-3 py-2"
            >
              <span className="text-sm text-fg/80">
                {labelDate(bl.date)} ·{" "}
                {bl.start_time.slice(0, 5) === "00:00" && bl.end_time.slice(0, 5) === "23:59"
                  ? "Journée complète"
                  : `${bl.start_time.slice(0, 5)}–${bl.end_time.slice(0, 5)}`}
                {bl.reason && ` · ${bl.reason}`}
                {showBarber && <span className="ml-1 text-fg/40">({bl.barber})</span>}
              </span>
              <button
                onClick={() => remove(bl.id)}
                className="text-sm text-pole underline"
              >
                Débloquer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
