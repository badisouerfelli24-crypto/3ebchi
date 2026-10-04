/* Calcul des métriques du dashboard hajem. Pur (sans BDD) : utilisable côté
   serveur et testable. Toutes les dates sont des "YYYY-MM-DD" à Tunis.

   Règles (validées avec le owner) :
   - réservations = toutes les réservations du jour/période (tous statuts) ;
   - encaissé     = somme des prix des réservations marquées "done" UNIQUEMENT ;
   - taux hjema   = done ÷ (done + cancelled + no_show) — seules les
                    réservations dont l'issue est posée comptent. */

export type Status = "confirmed" | "done" | "cancelled" | "no_show";

export type Row = {
  barber: string;
  date: string;
  start_time: string;
  status: Status;
  price: number;
};

export type Metrics = {
  reservations: number;
  done: number;
  cancelled: number;
  noShow: number;
  pending: number;
  earned: number;
  /** 0..1, ou null si aucune issue posée. */
  rate: number | null;
};

export const PERIOD_KEYS = ["today", "yesterday", "week", "month", "lifetime"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export type Range = { from: string; to: string };

export type PeriodStat = {
  range: Range | null;
  current: Metrics;
  previous: Metrics | null; // période précédente comparable (null pour lifetime)
};

export type SeriesPoint = { date: string; reservations: number; done: number; earned: number };

export type BarberStat = { id: string; periods: Record<PeriodKey, Metrics> };

export type StatsPayload = {
  scope: string; // "shop" ou id du barbier
  today: string;
  periods: Record<PeriodKey, PeriodStat>;
  series: SeriesPoint[]; // 90 derniers jours, jusqu'à aujourd'hui inclus
  hours: number[]; // réservations (hors annulées) par heure de début, 0..23
  upcoming: number; // réservations en attente à partir d'aujourd'hui
  toSettle: number; // réservations passées encore sans issue
  perBarber: BarberStat[] | null; // scope "shop" uniquement
};

// ---------- Dates ----------
function toUTC(d: string) {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd, 12));
}
function fmt(dt: Date) {
  return dt.toISOString().slice(0, 10);
}
export function addDays(d: string, n: number): string {
  const dt = toUTC(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fmt(dt);
}
/** Lundi de la semaine de `d`. */
export function weekStart(d: string): string {
  const wd = toUTC(d).getUTCDay(); // 0 = dimanche
  return addDays(d, -((wd + 6) % 7));
}
export function monthStart(d: string): string {
  return d.slice(0, 8) + "01";
}
export function monthEnd(d: string): string {
  const dt = toUTC(monthStart(d));
  dt.setUTCMonth(dt.getUTCMonth() + 1, 0);
  return fmt(dt);
}

/** Nombre de jours entre deux dates (b - a). */
function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86400000);
}

/**
 * Périodes courantes et précédentes pour une date "aujourd'hui".
 * Semaine / mois / total sont comptés "à date" (du début jusqu'à aujourd'hui
 * inclus) ; la comparaison porte sur le même nombre de jours écoulés de la
 * période précédente. Les réservations futures sont comptées à part ("à venir").
 */
export function periodRanges(today: string): Record<PeriodKey, { cur: Range | null; prev: Range | null }> {
  const yest = addDays(today, -1);
  const ws = weekStart(today);
  const ms = monthStart(today);
  const prevMs = monthStart(addDays(ms, -1));
  const prevMonthTo = addDays(prevMs, daysBetween(ms, today));
  const prevMe = monthEnd(prevMs);
  return {
    today: { cur: { from: today, to: today }, prev: { from: yest, to: yest } },
    yesterday: { cur: { from: yest, to: yest }, prev: { from: addDays(today, -2), to: addDays(today, -2) } },
    week: { cur: { from: ws, to: today }, prev: { from: addDays(ws, -7), to: addDays(today, -7) } },
    month: { cur: { from: ms, to: today }, prev: { from: prevMs, to: prevMonthTo < prevMe ? prevMonthTo : prevMe } },
    lifetime: { cur: { from: "0000-01-01", to: today }, prev: null },
  };
}

// ---------- Agrégation ----------
export function emptyMetrics(): Metrics {
  return { reservations: 0, done: 0, cancelled: 0, noShow: 0, pending: 0, earned: 0, rate: null };
}

function add(m: Metrics, r: Row) {
  m.reservations++;
  if (r.status === "done") {
    m.done++;
    m.earned += Number(r.price) || 0;
  } else if (r.status === "cancelled") m.cancelled++;
  else if (r.status === "no_show") m.noShow++;
  else m.pending++;
}

function finish(m: Metrics): Metrics {
  const settled = m.done + m.cancelled + m.noShow;
  m.rate = settled > 0 ? m.done / settled : null;
  m.earned = Math.round(m.earned * 100) / 100;
  return m;
}

const inRange = (d: string, r: Range | null) => !r || (d >= r.from && d <= r.to);

export function metricsFor(rows: Row[], range: Range | null): Metrics {
  const m = emptyMetrics();
  for (const r of rows) if (inRange(r.date, range)) add(m, r);
  return finish(m);
}

/**
 * Construit tout le payload du dashboard à partir des lignes de la portée.
 * `nowHHMM` sert à savoir quelles réservations d'aujourd'hui sont déjà passées.
 */
export function buildStats(
  rows: Row[],
  opts: { scope: string; today: string; nowHHMM: string; barberIds: string[] | null }
): StatsPayload {
  const { today, nowHHMM } = opts;
  const ranges = periodRanges(today);

  const periods = {} as Record<PeriodKey, PeriodStat>;
  for (const k of PERIOD_KEYS) {
    const { cur, prev } = ranges[k];
    periods[k] = {
      range: cur,
      current: metricsFor(rows, cur),
      previous: prev ? metricsFor(rows, prev) : null,
    };
  }

  // Série journalière (90 jours).
  const start = addDays(today, -89);
  const byDay = new Map<string, SeriesPoint>();
  for (let d = start; d <= today; d = addDays(d, 1)) {
    byDay.set(d, { date: d, reservations: 0, done: 0, earned: 0 });
  }
  const hours = new Array(24).fill(0);
  let upcoming = 0;
  let toSettle = 0;
  for (const r of rows) {
    const p = byDay.get(r.date);
    if (p) {
      p.reservations++;
      if (r.status === "done") {
        p.done++;
        p.earned += Number(r.price) || 0;
      }
    }
    if (r.status !== "cancelled") {
      const h = parseInt(r.start_time.slice(0, 2), 10);
      if (h >= 0 && h < 24) hours[h]++;
    }
    if (r.status === "confirmed") {
      const past = r.date < today || (r.date === today && r.start_time.slice(0, 5) <= nowHHMM);
      if (past) toSettle++;
      else upcoming++;
    }
  }

  const perBarber = opts.barberIds
    ? opts.barberIds.map((id) => {
        const mine = rows.filter((r) => r.barber === id);
        const p = {} as Record<PeriodKey, Metrics>;
        for (const k of PERIOD_KEYS) p[k] = metricsFor(mine, ranges[k].cur);
        return { id, periods: p };
      })
    : null;

  return {
    scope: opts.scope,
    today,
    periods,
    series: [...byDay.values()].map((p) => ({ ...p, earned: Math.round(p.earned * 100) / 100 })),
    hours,
    upcoming,
    toSettle,
    perBarber,
  };
}
