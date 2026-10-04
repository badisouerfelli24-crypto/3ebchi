"use client";

import { useState } from "react";
import { BARBERS } from "@/config/site";
import { nextDays, labelDate, labelDateShort, weekdayOf } from "@/lib/time";
import { isClosedDay } from "@/lib/slots";
import { api, barberColor, dayLabel, fmtDT, STATUS_META, type Agenda as AgendaData, type Blocked, type Booking, type Status } from "./lib";
import { Icon, Avatar, Switch, CardHeader } from "./ui";

/** Heure Tunis "HH:MM" côté navigateur. */
function nowHHMM() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Tunis", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date())
    .replace(/^24/, "00");
}

export function Agenda({
  data,
  meId,
  onChanged,
  notify,
}: {
  data: AgendaData;
  meId: string;
  onChanged: () => void;
  notify: (msg: string, tone?: "good" | "crit") => void;
}) {
  const isShop = data.scope === "shop";
  const now = nowHHMM();
  // Les réservations d'aujourd'hui déjà commencées et sans issue remontent en "à clôturer".
  const todayPast = data.todays.filter((b) => b.status === "confirmed" && b.start_time.slice(0, 5) <= now);
  const toSettle = [...todayPast, ...data.toSettle];
  const todays = data.todays.filter((b) => !todayPast.includes(b));
  const [overrides, setOverrides] = useState<Record<string, Status>>({});

  async function setOutcome(b: Booking, outcome: Status) {
    const prev = overrides[b.id];
    setOverrides((o) => ({ ...o, [b.id]: outcome }));
    try {
      await api("/api/barber/outcome", { method: "POST", body: JSON.stringify({ id: b.id, outcome }) });
      notify(outcome === "confirmed" ? "Remise en attente" : `${STATUS_META[outcome].label} ✓`, outcome === "cancelled" ? "crit" : "good");
      onChanged();
    } catch (e) {
      setOverrides((o) => {
        const n = { ...o };
        if (prev) n[b.id] = prev;
        else delete n[b.id];
        return n;
      });
      notify((e as Error).message, "crit");
    }
  }

  const item = (b: Booking) => (
    <BookingItem
      key={b.id}
      b={{ ...b, status: overrides[b.id] ?? b.status }}
      started={b.date < data.today || (b.date === data.today && b.start_time.slice(0, 5) <= now)}
      showBarber={false}
      onOutcome={(o) => setOutcome(b, o)}
    />
  );

  // Groupes "à venir" par jour.
  const [settleShown, settleMore] = useCap(toSettle, 6);
  const [recentShown, recentMore] = useCap(data.recent, 4);
  const [upcomingShown, upcomingMore] = useCap(data.upcoming, 12);

  const upcomingByDay = new Map<string, Booking[]>();
  for (const b of upcomingShown) {
    if (!upcomingByDay.has(b.date)) upcomingByDay.set(b.date, []);
    upcomingByDay.get(b.date)!.push(b);
  }

  return (
    <div className="space-y-6">
      {toSettle.length > 0 && (
        <Section title="À clôturer" count={toSettle.length} tone="var(--warn)" hint="Hjema faite, annulée ou pas venu ?">
          <ByBarber list={settleShown} isShop={isShop} render={item} showDate today={data.today} />
          {settleMore}
        </Section>
      )}

      <Section title="Aujourd'hui" count={todays.length} tone="var(--accent)" hint={labelDate(data.today)}>
        {todays.length === 0 ? <Empty text="Rien de prévu pour le reste de la journée" /> : <ByBarber list={todays} isShop={isShop} render={item} />}
      </Section>

      <Section title="À venir" count={data.upcoming.length} tone="var(--s2)">
        {data.upcoming.length === 0 ? (
          <Empty text="Aucune réservation à venir" />
        ) : (
          <div className="space-y-5">
            {[...upcomingByDay.entries()].map(([d, list]) => (
              <div key={d}>
                <div className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-[var(--ink-2)]">
                  {dayLabel(d)} <span className="d-pill d-pill-neutral">{list.length}</span>
                </div>
                <ByBarber list={list} isShop={isShop} render={item} />
              </div>
            ))}
            {upcomingMore}
          </div>
        )}
      </Section>

      {data.recent.length > 0 && (
        <Section title="Clôturées récemment" count={data.recent.length} tone="var(--neutral)" hint="14 derniers jours">
          <ByBarber list={recentShown} isShop={isShop} render={item} showDate today={data.today} />
          {recentMore}
        </Section>
      )}

      {data.scope === meId && <BlockPanel blocked={data.blocked} onChanged={onChanged} notify={notify} />}
    </div>
  );
}

/** Affiche les `n` premiers éléments, avec un bouton "Voir plus". */
function useCap<T>(list: T[], n: number) {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, n);
  const more =
    list.length > n ? (
      <button type="button" onClick={() => setAll((a) => !a)} className="d-btn d-btn-ghost d-btn-sm mt-3 w-full">
        {all ? "Voir moins" : `Voir plus (+${list.length - n})`}
      </button>
    ) : null;
  return [shown, more] as const;
}

function Section({ title, count, tone, hint, children }: { title: string; count: number; tone: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="d-rise">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="h-4 w-1 rounded-full" style={{ background: tone }} />
        <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
        <span className="d-pill d-pill-neutral">{count}</span>
        {hint && <span className="ml-auto truncate text-[12px] text-[var(--ink-3)]">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="d-card p-6 text-center text-[13.5px] text-[var(--ink-3)]">{text}</div>;
}

/** En vue boutique, les réservations restent séparées par hajem. */
function ByBarber({ list, isShop, render, showDate, today }: { list: Booking[]; isShop: boolean; render: (b: Booking) => React.ReactNode; showDate?: boolean; today?: string }) {
  const withDate = (b: Booking) => (
    <div key={b.id}>
      {showDate && <div className="mb-1 ml-1 text-[11.5px] text-[var(--ink-3)]">{dayLabel(b.date, today)}</div>}
      {render(b)}
    </div>
  );
  if (!isShop) return <div className="grid gap-2.5 lg:grid-cols-2">{list.map(withDate)}</div>;
  return (
    <div className="space-y-4">
      {BARBERS.map((info) => {
        const mine = list.filter((b) => b.barber === info.id);
        if (mine.length === 0) return null;
        return (
          <div key={info.id} className="rounded-2xl border border-[var(--border)] p-2.5" style={{ background: `color-mix(in oklab, ${barberColor(info.id)} 5%, transparent)` }}>
            <div className="mb-2.5 flex items-center gap-2 px-1 text-[13px] font-semibold">
              <Avatar name={info.name} photo={info.photo} color={barberColor(info.id)} size={22} />
              {info.name}
              <span className="d-pill d-pill-neutral">{mine.length}</span>
            </div>
            <div className="grid gap-2.5 lg:grid-cols-2">{mine.map(withDate)}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------- Carte de réservation ----------------------- */
function BookingItem({ b, started, showBarber, onOutcome }: { b: Booking; started: boolean; showBarber: boolean; onOutcome: (o: Status) => void }) {
  const [confirming, setConfirming] = useState<Status | null>(null);
  const meta = STATUS_META[b.status];
  const settled = b.status !== "confirmed";
  const tel = `+${b.phone}`;

  const ask = (o: Status) => {
    // Annuler / remettre en attente : confirmation en deux temps (pas de popup natif).
    if (o === "cancelled" || o === "confirmed") {
      if (confirming === o) {
        setConfirming(null);
        onOutcome(o);
      } else setConfirming(o);
    } else onOutcome(o);
  };

  return (
    <article
      className="d-card overflow-hidden transition-opacity"
      style={{ opacity: b.status === "cancelled" ? 0.72 : 1, boxShadow: `inset 3px 0 0 ${settled ? meta.tone : "transparent"}, var(--shadow)` }}
    >
      <div className="flex gap-3 p-3.5">
        <div className="w-[58px] shrink-0 border-r border-[var(--border)] pr-3">
          <div className="num text-[19px] font-black leading-tight">{b.start_time.slice(0, 5)}</div>
          <div className="mt-0.5 text-[11px] text-[var(--ink-3)]">{b.duration_min} min</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold">{b.client_name}</div>
              <div className="mt-0.5 text-[12.5px] text-[var(--ink-2)]">
                {b.service} · <span className="tnum font-semibold text-[var(--ink)]">{fmtDT(b.price)}</span>
              </div>
            </div>
            <span className={`d-pill ${meta.pill} shrink-0`}>
              <Icon name={{ done: "check", cancelled: "x", no_show: "ghost", confirmed: "clock" }[b.status]} size={12} stroke={2.4} />
              {meta.label}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[var(--ink-3)]">
            {b.ref && <span className="font-mono tracking-wider">#{b.ref}</span>}
            {showBarber && (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: barberColor(b.barber) }} />
                {BARBERS.find((x) => x.id === b.barber)?.name}
              </span>
            )}
          </div>
          {b.note && <div className="mt-2 rounded-lg px-2.5 py-1.5 text-[12.5px] text-[var(--ink-2)]" style={{ background: "var(--card-hi)" }}>{b.note}</div>}
        </div>
      </div>

      {/* Issue à poser : rangée dédiée, libellés toujours visibles */}
      {!settled && started && (
        <div className="grid grid-cols-[1fr_1fr_1.35fr] gap-1.5 border-t border-[var(--border)] px-3.5 pt-2.5">
          <button type="button" onClick={() => ask("no_show")} className="d-btn d-btn-tone d-btn-sm" style={{ "--tone": "var(--warn)" } as React.CSSProperties}>
            <Icon name="ghost" size={16} stroke={2.2} className="hidden sm:block" />Pas venu
          </button>
          <button type="button" onClick={() => ask("cancelled")} className={`d-btn d-btn-tone d-btn-sm ${confirming === "cancelled" ? "is-solid" : ""}`} style={{ "--tone": "var(--crit)" } as React.CSSProperties}>
            <Icon name="x" size={16} stroke={2.4} className="hidden sm:block" />{confirming === "cancelled" ? "Confirmer" : "Annulée"}
          </button>
          <button type="button" onClick={() => ask("done")} className="d-btn d-btn-tone is-solid d-btn-sm" style={{ "--tone": "var(--good)" } as React.CSSProperties}>
            <Icon name="check" size={16} stroke={2.6} />Hjema faite
          </button>
        </div>
      )}

      <div className={`flex items-center gap-2 px-3.5 py-2.5 ${!settled && started ? "" : "border-t border-[var(--border)]"}`}>
        <a href={`tel:${tel}`} className="d-icon-btn d-icon-md" aria-label={`Appeler ${b.client_name}`}><Icon name="phone" size={17} /></a>
        <a href={`https://wa.me/${b.phone}`} target="_blank" rel="noopener noreferrer" className="d-icon-btn d-icon-md" style={{ color: "#25d366" }} aria-label="WhatsApp">
          <Icon name="chat" size={17} />
        </a>
        <span className="ml-1 truncate text-[12px] text-[var(--ink-3)] tnum">{tel}</span>
        <div className="ml-auto flex shrink-0 gap-2">
          {!settled && !started && (
            <button type="button" onClick={() => ask("cancelled")} className={`d-btn d-btn-tone d-btn-sm ${confirming === "cancelled" ? "is-solid" : ""}`} style={{ "--tone": "var(--crit)" } as React.CSSProperties}>
              <Icon name="x" size={16} stroke={2.4} />{confirming === "cancelled" ? "Confirmer" : "Annuler"}
            </button>
          )}
          {settled && (
            <button type="button" onClick={() => ask("confirmed")} className={`d-btn ${confirming === "confirmed" ? "d-btn-primary" : "d-btn-ghost"} d-btn-sm`}>
              <Icon name="undo" size={16} />{confirming === "confirmed" ? "En attente ?" : "Modifier"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/* ----------------------- Blocages (pause / absence) ----------------------- */
function BlockPanel({ blocked, onChanged, notify }: { blocked: Blocked[]; onChanged: () => void; notify: (m: string, t?: "good" | "crit") => void }) {
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
    try {
      await api("/api/barber/block", {
        method: "POST",
        body: JSON.stringify({ date, fullDay, start_time: fullDay ? undefined : start, end_time: fullDay ? undefined : end, reason }),
      });
      setDate("");
      setReason("");
      setOpen(false);
      notify("Créneau bloqué", "good");
      onChanged();
    } catch (e) {
      notify((e as Error).message, "crit");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/barber/block?id=${id}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      notify((e as Error).message, "crit");
    }
  }

  return (
    <section className="d-card d-rise p-4 lg:p-5">
      <CardHeader
        title="Blocages (pause / absence)"
        sub="Les clients ne pourront pas réserver ces créneaux"
        right={
          <button type="button" onClick={() => setOpen((o) => !o)} className={`d-btn ${open ? "d-btn-ghost" : "d-btn-primary"} d-btn-sm`}>
            <Icon name={open ? "x" : "plus"} size={16} stroke={2.4} />{open ? "Fermer" : "Bloquer"}
          </button>
        }
      />

      {open && (
        <div className="mb-4 space-y-4 rounded-2xl border border-[var(--border)] p-3.5" style={{ background: "var(--card-hi)" }}>
          <div>
            <div className="eyebrow mb-2">Nhar</div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {days.map((d) => {
                const short = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"][weekdayOf(d)];
                const on = date === d;
                return (
                  <button key={d} type="button" onClick={() => setDate(d)} aria-pressed={on}
                    className="rounded-xl border px-1 py-2 text-[12px] font-semibold transition-all"
                    style={{
                      borderColor: on ? "var(--accent)" : "var(--border)",
                      background: on ? "var(--accent-soft)" : "transparent",
                      color: on ? "var(--ink)" : "var(--ink-2)",
                    }}>
                    {short}<span className="block text-[11px] font-medium text-[var(--ink-3)]">{labelDateShort(d)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 text-[14px]">
            Journée complète
            <Switch checked={fullDay} onChange={setFullDay} label="Journée complète" />
          </label>

          {!fullDay && (
            <div className="flex items-center gap-2">
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="d-input" aria-label="Début" />
              <Icon name="arrowRight" className="shrink-0 text-[var(--ink-3)]" />
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="d-input" aria-label="Fin" />
            </div>
          )}

          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Raison (optionnel)" className="d-input" maxLength={120} />

          <button type="button" onClick={create} disabled={busy || !date} className="d-btn d-btn-tone is-solid w-full" style={{ "--tone": "var(--crit)" } as React.CSSProperties}>
            <Icon name="ban" size={17} stroke={2.2} />{busy ? "…" : "Bloquer ce créneau"}
          </button>
        </div>
      )}

      {blocked.length === 0 ? (
        <p className="text-[13px] text-[var(--ink-3)]">Aucun blocage à venir.</p>
      ) : (
        <ul className="space-y-2">
          {blocked.map((bl) => (
            <li key={bl.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--card-hi)" }}>
              <span className="min-w-0 text-[13px]">
                <span className="font-semibold">{labelDate(bl.date)}</span>
                <span className="text-[var(--ink-2)]">
                  {" · "}
                  {bl.start_time.slice(0, 5) === "00:00" && bl.end_time.slice(0, 5) === "23:59" ? "Journée complète" : `${bl.start_time.slice(0, 5)}–${bl.end_time.slice(0, 5)}`}
                  {bl.reason && ` · ${bl.reason}`}
                </span>
              </span>
              <button type="button" onClick={() => remove(bl.id)} className="d-btn d-btn-ghost d-btn-xs">Débloquer</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
