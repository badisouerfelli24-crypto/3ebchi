"use client";

import { useMemo, useState } from "react";
import { BARBERS } from "@/config/site";
import { PERIODS, barberColor, fmtDT, fmtNum, fmtPct, dayLabel, type PeriodKey, type StatsPayload, type Metrics } from "./lib";
import { Icon, Segmented, DeltaPill, Avatar, CardHeader } from "./ui";
import { TrendChart, Sparkline, Ring, StackBar, HBars, HoursChart } from "./charts";

const avg = (m: Metrics) => (m.done ? m.earned / m.done : 0);

export function Overview({
  stats,
  period,
  onPeriod,
  onScope,
  onAgenda,
}: {
  stats: StatsPayload;
  period: PeriodKey;
  onPeriod: (p: PeriodKey) => void;
  onScope: (scope: string) => void;
  onAgenda: () => void;
}) {
  const p = stats.periods[period];
  const cur = p.current;
  const prev = p.previous;
  const meta = PERIODS.find((x) => x.key === period)!;
  const isShop = stats.scope === "shop";
  const spark = stats.series.slice(-14);

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Sélecteur de période — collant sous l'en-tête sur mobile */}
      <div className="sticky top-[calc(env(safe-area-inset-top)+64px)] z-20 -mx-4 px-4 py-2 backdrop-blur-xl lg:static lg:mx-0 lg:p-0 lg:backdrop-blur-0"
        style={{ background: "color-mix(in oklab, var(--bg) 75%, transparent)" }}>
        <Segmented
          label="Période"
          value={period}
          onChange={onPeriod}
          options={PERIODS.map((x) => ({ value: x.key, label: x.short }))}
          className="lg:max-w-xl"
        />
      </div>

      {/* Alerte : réservations à clôturer */}
      {stats.toSettle > 0 && (
        <button type="button" onClick={onAgenda}
          className="d-card d-card-hover d-rise flex w-full items-center gap-3 p-3.5 text-left"
          style={{ borderColor: "color-mix(in oklab, var(--warn) 40%, transparent)" }}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ color: "var(--warn)", background: "var(--warn-soft)" }}>
            <Icon name="clock" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">
              {stats.toSettle} réservation{stats.toSettle > 1 ? "s" : ""} à clôturer
            </span>
            <span className="block text-[12.5px] text-[var(--ink-3)]">Indique si c&apos;est devenu une hjema, annulé ou pas venu</span>
          </span>
          <Icon name="arrowRight" className="text-[var(--ink-3)]" />
        </button>
      )}

      {/* KPI */}
      <section aria-label={`Chiffres clés — ${meta.label}`} className="grid grid-cols-2 gap-3 lg:grid-cols-6 lg:gap-4">
        <div className="d-card d-card-hero d-rise col-span-2 overflow-hidden p-4 lg:p-5">
          <div className="eyebrow">Encaissé · {meta.label}</div>
          <div className="num mt-2 text-[40px] font-black leading-none text-[var(--ink)] lg:text-[34px]">
            {fmtDT(cur.earned)}
          </div>
          <div className="mt-2.5"><DeltaPill cur={cur.earned} prev={prev?.earned} suffix={meta.prev || "depuis le début"} /></div>
          <div className="mt-3 -mx-1"><Sparkline values={spark.map((s) => s.earned)} /></div>
        </div>

        <Kpi label="Réservations" value={fmtNum(cur.reservations)}
          foot={<DeltaPill cur={cur.reservations} prev={prev?.reservations} suffix={meta.prev} />}
          spark={spark.map((s) => s.reservations)} color="var(--s2)" />

        <div className="d-card d-rise flex flex-col p-4 lg:p-5">
          <div className="eyebrow">Taux hjema</div>
          <div className="mt-2 flex items-center gap-3">
            <div className="relative">
              <Ring value={cur.rate} size={56} />
              <Icon name="check" size={18} stroke={2.4} className="absolute inset-0 m-auto text-[var(--good)]" />
            </div>
            <div className="num text-[30px] font-black leading-none">{fmtPct(cur.rate)}</div>
          </div>
          <div className="mt-auto pt-3">
            <DeltaPill cur={cur.rate} prev={prev?.rate} points suffix={cur.rate === null ? "aucune issue posée" : meta.prev} />
          </div>
        </div>

        <Kpi label="Ticket moyen" value={cur.done ? fmtDT(avg(cur)) : "—"}
          foot={<DeltaPill cur={cur.done ? avg(cur) : null} prev={prev && prev.done ? avg(prev) : null} suffix={meta.prev} />}
          sub={`${cur.done} hjema${cur.done > 1 ? "s" : ""} faite${cur.done > 1 ? "s" : ""}`} />

        <button type="button" onClick={onAgenda} className="d-card d-card-hover d-rise flex flex-col p-4 text-left lg:p-5">
          <div className="eyebrow">À venir</div>
          <div className="num mt-2 text-[30px] font-black leading-none">{fmtNum(stats.upcoming)}</div>
          <div className="mt-1.5 text-[12px] text-[var(--ink-3)]">réservations en attente</div>
          <div className="mt-auto flex items-center gap-1 pt-2.5 text-[12px] font-semibold text-[var(--accent)]">
            Voir l&apos;agenda <Icon name="arrowRight" size={14} />
          </div>
        </button>
      </section>

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        <TrendCard stats={stats} className="lg:col-span-8" />

        {/* Issues des réservations */}
        <section className="d-card d-rise p-4 lg:col-span-4 lg:p-5">
          <CardHeader title="Issues des réservations" sub={meta.label} />
          <StackBar
            parts={[
              { key: "done", label: "Hjema faite", value: cur.done, color: "var(--good)", icon: <Icon name="check" size={16} stroke={2.4} /> },
              { key: "cancelled", label: "Annulée", value: cur.cancelled, color: "var(--crit)", icon: <Icon name="x" size={16} stroke={2.4} /> },
              { key: "no_show", label: "Pas venu", value: cur.noShow, color: "var(--warn)", icon: <Icon name="ghost" size={16} stroke={2.2} /> },
              { key: "pending", label: "En attente", value: cur.pending, color: "var(--neutral)", icon: <Icon name="clock" size={16} stroke={2.2} /> },
            ]}
          />
        </section>

        {/* Taux de hjema : par barbier (boutique) ou par période (perso) */}
        <section className="d-card d-rise p-4 lg:col-span-6 lg:p-5">
          {isShop && stats.perBarber ? (
            <>
              <CardHeader title="Taux hjema par hajem" sub={`Hjemas faites ÷ issues posées · ${meta.label}`} />
              <HBars
                max={1}
                format={fmtPct}
                onSelect={onScope}
                rows={stats.perBarber.map((b) => {
                  const info = BARBERS.find((x) => x.id === b.id)!;
                  const m = b.periods[period];
                  return {
                    key: b.id,
                    value: m.rate,
                    color: barberColor(b.id),
                    hint: `${m.done}/${m.done + m.cancelled + m.noShow}`,
                    label: (<><Avatar name={info.name} photo={info.photo} color={barberColor(b.id)} size={22} /> {info.name}</>),
                  };
                })}
              />
            </>
          ) : (
            <>
              <CardHeader title="Taux hjema par période" sub="Hjemas faites ÷ issues posées" />
              <HBars
                max={1}
                format={fmtPct}
                onSelect={(k) => onPeriod(k as PeriodKey)}
                rows={PERIODS.map((x) => {
                  const m = stats.periods[x.key].current;
                  return {
                    key: x.key,
                    value: m.rate,
                    color: x.key === period ? "var(--accent-line)" : "color-mix(in oklab, var(--accent-line) 45%, transparent)",
                    hint: `${m.done}/${m.done + m.cancelled + m.noShow}`,
                    label: <span className={x.key === period ? "text-[var(--ink)]" : ""}>{x.label}</span>,
                  };
                })}
              />
            </>
          )}
        </section>

        {/* Boutique : classement de l'équipe ; perso : heures de pointe */}
        {isShop && stats.perBarber ? (
          <TeamCard stats={stats} period={period} onScope={onScope} className="lg:col-span-6" />
        ) : (
          <section className="d-card d-rise p-4 lg:col-span-6 lg:p-5">
            <CardHeader title="Heures de pointe" sub="Réservations par heure de début · depuis le début" />
            <HoursChart hours={stats.hours} />
          </section>
        )}

        <PeriodsTable stats={stats} period={period} onPeriod={onPeriod} className="lg:col-span-6" />

        {isShop ? (
          <section className="d-card d-rise p-4 lg:col-span-6 lg:p-5">
            <CardHeader title="Heures de pointe" sub="Toute la boutique · depuis le début" />
            <HoursChart hours={stats.hours} />
          </section>
        ) : (
          <section className="d-card d-rise grid grid-cols-2 gap-3 p-4 lg:col-span-6 lg:p-5">
            <MiniStat label="À venir" value={stats.upcoming} icon="calendar" tone="var(--accent)" onClick={onAgenda} />
            <MiniStat label="À clôturer" value={stats.toSettle} icon="clock" tone="var(--warn)" onClick={onAgenda} />
          </section>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, foot, spark, color, sub }: { label: string; value: string; foot: React.ReactNode; spark?: number[]; color?: string; sub?: string }) {
  return (
    <div className="d-card d-rise flex flex-col p-4 lg:p-5">
      <div className="eyebrow">{label}</div>
      <div className="num mt-2 text-[30px] font-black leading-none">{value}</div>
      {sub && <div className="mt-1.5 text-[12px] text-[var(--ink-3)]">{sub}</div>}
      {spark && <div className="mt-2 -mx-1"><Sparkline values={spark} color={color} /></div>}
      <div className="mt-auto pt-2.5">{foot}</div>
    </div>
  );
}

function MiniStat({ label, value, icon, tone, onClick }: { label: string; value: number; icon: string; tone: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="d-card-hover flex flex-col rounded-2xl p-3 text-left" style={{ background: "var(--card-hi)" }}>
      <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ color: tone, background: `color-mix(in oklab, ${tone} 14%, transparent)` }}>
        <Icon name={icon} size={18} />
      </span>
      <span className="num mt-3 text-[28px] font-black leading-none">{value}</span>
      <span className="mt-1 text-[12.5px] text-[var(--ink-3)]">{label}</span>
    </button>
  );
}

/* ----------------------- Courbe d'évolution ----------------------- */
function TrendCard({ stats, className = "" }: { stats: StatsPayload; className?: string }) {
  const [metric, setMetric] = useState<"reservations" | "earned" | "done">("reservations");
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const [table, setTable] = useState(false);
  const pts = useMemo(
    () => stats.series.slice(-Number(range)).map((s) => ({ date: s.date, value: s[metric] })),
    [stats.series, metric, range]
  );
  const fmt = metric === "earned" ? fmtDT : fmtNum;
  const total = pts.reduce((s, p) => s + p.value, 0);
  const title = { reservations: "Réservations", earned: "Encaissé", done: "Hjemas faites" }[metric];

  return (
    <section className={`d-card d-rise p-4 lg:p-5 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">{title} · {range} derniers jours</div>
          <div className="num mt-1.5 text-[26px] font-black leading-none">{fmt(total)}</div>
        </div>
        <button type="button" className="d-icon-btn d-icon-sm" aria-pressed={table} aria-label={table ? "Voir le graphe" : "Voir le tableau"} onClick={() => setTable((t) => !t)}>
          <Icon name={table ? "chart" : "table"} size={17} />
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Segmented label="Mesure" value={metric} onChange={setMetric} className="flex-1"
          options={[{ value: "reservations", label: "Réserv." }, { value: "done", label: "Hjemas" }, { value: "earned", label: "DT" }]} />
        <Segmented label="Plage" value={range} onChange={setRange}
          options={[{ value: "7", label: "7j" }, { value: "30", label: "30j" }, { value: "90", label: "90j" }]} />
      </div>
      {table ? (
        <div className="max-h-[220px] overflow-y-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0" style={{ background: "var(--card-solid)" }}>
              <tr className="text-left text-[var(--ink-3)]"><th className="px-3 py-2 font-medium">Jour</th><th className="px-3 py-2 text-right font-medium">{title}</th></tr>
            </thead>
            <tbody className="tnum">
              {[...pts].reverse().map((p) => (
                <tr key={p.date} className="border-t border-[var(--border)]">
                  <td className="px-3 py-1.5 text-[var(--ink-2)]">{dayLabel(p.date, stats.today)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold">{fmt(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <TrendChart points={pts} format={fmt} label={title} today={stats.today} />
      )}
    </section>
  );
}

/* ----------------------- Classement équipe ----------------------- */
function TeamCard({ stats, period, onScope, className = "" }: { stats: StatsPayload; period: PeriodKey; onScope: (s: string) => void; className?: string }) {
  const [by, setBy] = useState<"earned" | "reservations">("earned");
  const rows = [...(stats.perBarber || [])].sort((a, b) => b.periods[period][by] - a.periods[period][by]);
  const fmt = by === "earned" ? (n: number | null) => fmtDT(n ?? 0) : (n: number | null) => fmtNum(n ?? 0);
  return (
    <section className={`d-card d-rise p-4 lg:p-5 ${className}`}>
      <CardHeader
        title="Équipe"
        sub="Touchez un hajem pour ouvrir son dashboard"
        right={<Segmented label="Classer par" value={by} onChange={setBy} options={[{ value: "earned", label: "DT" }, { value: "reservations", label: "Réserv." }]} />}
      />
      <HBars
        format={fmt}
        onSelect={onScope}
        rows={rows.map((b, i) => {
          const info = BARBERS.find((x) => x.id === b.id)!;
          const m = b.periods[period];
          return {
            key: b.id,
            value: m[by],
            color: barberColor(b.id),
            hint: by === "earned" ? `${m.reservations} rés.` : fmtDT(m.earned),
            label: (
              <>
                <span className="num w-4 text-[12px] text-[var(--ink-3)]">{i + 1}</span>
                <Avatar name={info.name} photo={info.photo} color={barberColor(b.id)} size={22} />
                <span className="truncate">{info.name}</span>
              </>
            ),
          };
        })}
      />
    </section>
  );
}

/* ----------------------- Toutes les périodes ----------------------- */
function PeriodsTable({ stats, period, onPeriod, className = "" }: { stats: StatsPayload; period: PeriodKey; onPeriod: (p: PeriodKey) => void; className?: string }) {
  return (
    <section className={`d-card d-rise p-4 lg:p-5 ${className}`}>
      <CardHeader title="Toutes les périodes" sub="Touchez une ligne pour l'afficher en haut" />
      <div className="-mx-1 overflow-hidden">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-[11.5px] text-[var(--ink-3)]">
              <th className="px-1 pb-2 font-medium">Période</th>
              <th className="px-1 pb-2 text-right font-medium">Rés.</th>
              <th className="px-1 pb-2 text-right font-medium">Encaissé</th>
              <th className="px-1 pb-2 text-right font-medium">Taux</th>
            </tr>
          </thead>
          <tbody className="tnum">
            {PERIODS.map((x) => {
              const m = stats.periods[x.key].current;
              const active = x.key === period;
              return (
                <tr
                  key={x.key}
                  onClick={() => onPeriod(x.key)}
                  className="cursor-pointer border-t border-[var(--border)] transition-colors hover:bg-[var(--card-hi)]"
                  style={active ? { background: "var(--accent-soft)" } : undefined}
                >
                  <td className="px-1 py-2.5 font-medium" style={{ color: active ? "var(--ink)" : "var(--ink-2)" }}>
                    {active && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: "var(--accent)" }} />}
                    {x.label}
                  </td>
                  <td className="px-1 py-2.5 text-right font-semibold">{fmtNum(m.reservations)}</td>
                  <td className="px-1 py-2.5 text-right font-semibold">{fmtDT(m.earned)}</td>
                  <td className="px-1 py-2.5 text-right font-semibold">{fmtPct(m.rate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
