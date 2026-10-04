import { BARBERS } from "@/config/site";
import type { Metrics, PeriodKey, StatsPayload } from "@/lib/dashboard/metrics";

export type { Metrics, PeriodKey, StatsPayload };

export type Status = "confirmed" | "done" | "cancelled" | "no_show";

export type Booking = {
  id: string;
  ref: string | null;
  barber: string;
  service: string;
  price: number;
  duration_min: number;
  date: string;
  start_time: string;
  client_name: string;
  phone: string;
  note: string;
  status: Status;
  created_at: string;
};

export type Blocked = {
  id: string;
  barber: string;
  date: string;
  start_time: string;
  end_time: string;
  reason: string;
};

export type Agenda = {
  scope: string;
  today: string;
  toSettle: Booking[];
  todays: Booking[];
  upcoming: Booking[];
  recent: Booking[];
  blocked: Blocked[];
};

export type Me = { id: string; name: string; isOwner: boolean };

export const PERIODS: { key: PeriodKey; label: string; short: string; prev: string }[] = [
  { key: "today", label: "Aujourd'hui", short: "Lyoum", prev: "vs hier" },
  { key: "yesterday", label: "Hier", short: "Ams", prev: "vs avant-hier" },
  { key: "week", label: "Cette semaine", short: "Semaine", prev: "vs même moment sem. dernière" },
  { key: "month", label: "Ce mois", short: "Mois", prev: "vs même moment mois dernier" },
  { key: "lifetime", label: "Depuis le début", short: "Total", prev: "" },
];

/** Couleur de série d'un barbier (ordre fixe de BARBERS, jamais recyclée). */
export function barberColor(id: string): string {
  const i = BARBERS.findIndex((b) => b.id === id);
  return i >= 0 && i < 4 ? `var(--s${i + 1})` : "var(--neutral)";
}

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export const fmtNum = (n: number) => nf0.format(n);
export const fmtDT = (n: number) => `${nf.format(n)} DT`;
export const fmtPct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);

/** Compact pour axes : 1 200 -> 1,2k */
export function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1000) return `${nf.format(n / 1000)}k`;
  return nf0.format(n);
}

/** Variation relative ; null si non calculable. */
export function delta(cur: number, prev: number | null | undefined): number | null {
  if (prev === null || prev === undefined) return null;
  if (prev === 0) return cur === 0 ? 0 : null;
  return (cur - prev) / prev;
}

const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export function dayLabel(d: string, today?: string): string {
  if (today && d === today) return "Aujourd'hui";
  const [y, m, dd] = d.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, dd, 12)).getUTCDay();
  return `${JOURS[wd]} ${dd} ${MOIS[m - 1]}`;
}
export function dayShort(d: string): string {
  const [, m, dd] = d.split("-").map(Number);
  return `${dd} ${MOIS[m - 1]}`;
}

export const STATUS_META: Record<Status, { label: string; tone: string; pill: string }> = {
  done: { label: "Hjema faite", tone: "var(--good)", pill: "d-pill-good" },
  cancelled: { label: "Annulée", tone: "var(--crit)", pill: "d-pill-crit" },
  no_show: { label: "Pas venu", tone: "var(--warn)", pill: "d-pill-warn" },
  confirmed: { label: "En attente", tone: "var(--neutral)", pill: "d-pill-neutral" },
};

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...(init.headers || {}) } : init?.headers,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new AuthError();
  if (!res.ok || !data.ok) throw new Error(data.message || "Erreur");
  return data as T;
}

export class AuthError extends Error {
  constructor() {
    super("Session expirée");
  }
}
