"use client";

import "./dash.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { BARBERS } from "@/config/site";
import { api, AuthError, barberColor, fmtDT, dayLabel, type Agenda as AgendaData, type Me, type PeriodKey, type StatsPayload } from "./lib";
import { Icon, Avatar } from "./ui";
import { Overview } from "./Overview";
import { Agenda } from "./Agenda";
import { Settings } from "./Settings";

type Tab = "overview" | "agenda" | "settings";
type Toast = { id: number; title: string; body?: string; tone: "good" | "crit" | "accent"; color?: string };

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "overview", label: "Stats", icon: "chart" },
  { key: "agenda", label: "Agenda", icon: "calendar" },
  { key: "settings", label: "Réglages", icon: "settings" },
];

const POLL_MS = 30_000;

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* stockage indisponible : préférence non mémorisée */
  }
}

export default function Dashboard({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [sound, setSound] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [scope, setScope] = useState<string>(me.isOwner ? "shop" : me.id);
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [stats, setStats] = useState<Record<string, StatsPayload>>({});
  const [agenda, setAgenda] = useState<Record<string, AgendaData>>({});
  const [error, setError] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [unseen, setUnseen] = useState(0);
  const toastId = useRef(0);

  /* ----- Préférences + paramètres d'URL (clic sur une notification) ----- */
  useEffect(() => {
    if (readLS("dash-theme") === "light") setTheme("light");
    if (readLS("dash-sound") === "off") setSound(false);
    const q = new URLSearchParams(location.search);
    const t = q.get("tab");
    if (t === "agenda" || t === "settings" || t === "overview") setTab(t);
    const s = q.get("scope");
    if (s && (s === me.id || (me.isOwner && (s === "shop" || BARBERS.some((b) => b.id === s))))) setScope(s);
  }, [me]);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    q.set("tab", tab);
    if (me.isOwner) q.set("scope", scope);
    else q.delete("scope");
    history.replaceState(null, "", `${location.pathname}?${q}`);
    if (tab === "agenda") setUnseen(0);
  }, [tab, scope, me.isOwner]);

  // Le fond de page suit le thème (évite un bord sombre en mode clair).
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = theme === "light" ? "#f4f5f7" : "#0b0b0e";
    return () => {
      document.body.style.background = prev;
    };
  }, [theme]);

  const notify = useCallback((title: string, tone: Toast["tone"] = "good", body?: string, color?: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, title, body, tone, color }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), body ? 7000 : 3200);
  }, []);

  /* ----- Chargement des données de la portée courante ----- */
  const load = useCallback(
    async (s: string) => {
      try {
        const [st, ag] = await Promise.all([
          api<StatsPayload>(`/api/barber/stats?scope=${encodeURIComponent(s)}`),
          api<AgendaData>(`/api/barber/agenda?scope=${encodeURIComponent(s)}`),
        ]);
        setStats((m) => ({ ...m, [s]: st }));
        setAgenda((m) => ({ ...m, [s]: ag }));
        setError("");
      } catch (e) {
        if (e instanceof AuthError) onLogout();
        else setError((e as Error).message);
      }
    },
    [onLogout]
  );

  useEffect(() => {
    load(scope);
  }, [scope, load]);

  /* ----- Son (WebAudio, débloqué au premier geste) ----- */
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => {
    const unlock = () => {
      if (!audio.current) {
        try {
          audio.current = new AudioContext();
        } catch {
          /* pas d'audio */
        }
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);
  const chime = useCallback(() => {
    const ctx = audio.current;
    if (!ctx || !sound) return;
    const t = ctx.currentTime;
    [880, 1318.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 0.4);
    });
  }, [sound]);

  /* ----- Flux "live" : uniquement quand l'onglet est visible (coût ~0) ----- */
  const cursor = useRef<string | null>(null);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    type Item = { id: string; barber: string; service: string; price: number; date: string; start_time: string; client_name: string };

    const tick = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const d = await api<{ now: string; items: Item[] }>(
          `/api/barber/feed${cursor.current ? `?since=${encodeURIComponent(cursor.current)}` : ""}`
        );
        cursor.current = d.now;
        if (d.items.length > 0) {
          for (const it of d.items) {
            const who = BARBERS.find((b) => b.id === it.barber)?.name ?? it.barber;
            notify(
              it.barber === me.id ? "Nouvelle réservation 💈" : `Nouvelle réservation · ${who}`,
              "accent",
              `${it.client_name} — ${it.service} (${fmtDT(it.price)}) · ${dayLabel(it.date)} ${it.start_time.slice(0, 5)}`,
              barberColor(it.barber)
            );
          }
          chime();
          navigator.vibrate?.([80, 60, 80]);
          setUnseen((u) => u + d.items.length);
          load(scopeRef.current);
        }
      } catch (e) {
        if (e instanceof AuthError) return onLogout();
      }
      timer = setTimeout(tick, POLL_MS);
    };
    const onVis = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") {
        tick();
        load(scopeRef.current);
      }
    };
    tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [me.id, notify, chime, load, onLogout]);

  const changeTheme = (t: "dark" | "light") => {
    setTheme(t);
    writeLS("dash-theme", t);
  };
  const changeSound = (v: boolean) => {
    setSound(v);
    writeLS("dash-sound", v ? "on" : "off");
  };

  const st = stats[scope];
  const ag = agenda[scope];
  const scopeInfo = scope === "shop" ? null : BARBERS.find((b) => b.id === scope);
  const scopeTitle = scope === "shop" ? "Toute la boutique" : scope === me.id ? "Mon dashboard" : scopeInfo?.name ?? scope;
  const settle = st?.toSettle ?? 0;

  const scopeChips = (vertical = false) =>
    me.isOwner ? (
      <div role="group" aria-label="Dashboard affiché" className={vertical ? "flex flex-col gap-1" : "d-scroll-x -mx-4 flex gap-2 px-4 pb-1"}>
        {[{ id: "shop", name: "Boutique" }, ...BARBERS].map((b) => {
          const isShop = b.id === "shop";
          const info = BARBERS.find((x) => x.id === b.id);
          const label = isShop ? "Boutique" : b.id === me.id ? `${b.name} · moi` : b.name;
          const color = isShop ? "var(--accent)" : barberColor(b.id);
          return vertical ? (
            <button key={b.id} type="button" onClick={() => setScope(b.id)} aria-current={scope === b.id ? "page" : undefined} className="d-side-link">
              {isShop ? (
                <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><Icon name="store" size={15} /></span>
              ) : (
                <Avatar name={b.name} photo={info?.photo} color={color} size={26} />
              )}
              <span className="truncate">{label}</span>
            </button>
          ) : (
            <button key={b.id} type="button" onClick={() => setScope(b.id)} aria-pressed={scope === b.id} className="d-chip" style={{ "--chip": color } as React.CSSProperties}>
              {isShop ? (
                <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><Icon name="store" size={15} /></span>
              ) : (
                <Avatar name={b.name} photo={info?.photo} color={color} size={28} />
              )}
              {label}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <div className="dash" data-theme={theme}>
      <div className="dash-bg" />

      {/* Toasts */}
      <div className="d-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="d-toast" role="status">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl"
              style={{
                color: t.tone === "crit" ? "var(--crit)" : t.color ?? "var(--good)",
                background: `color-mix(in oklab, ${t.tone === "crit" ? "var(--crit)" : t.color ?? "var(--good)"} 16%, transparent)`,
              }}>
              <Icon name={t.tone === "crit" ? "x" : t.body ? "bell" : "check"} size={18} stroke={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">{t.title}</span>
              {t.body && <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--ink-2)]">{t.body}</span>}
            </span>
            <button type="button" aria-label="Fermer" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="text-[var(--ink-3)]">
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="relative z-10 lg:flex">
        {/* ---------- Barre latérale (desktop) ---------- */}
        <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col border-r border-[var(--border)] p-4 lg:flex"
          style={{ background: "color-mix(in oklab, var(--surface) 60%, transparent)" }}>
          <div className="mb-6 flex items-center gap-2.5 px-2 pt-1">
            <span className="grid h-9 w-9 place-items-center rounded-xl text-[var(--accent-ink)]"
              style={{ background: "linear-gradient(135deg, var(--accent), var(--s2))", boxShadow: "0 8px 20px -8px var(--accent)" }}>
              <Icon name="sparkles" size={18} stroke={2.2} />
            </span>
            <span>
              <span className="block font-display text-[15px] font-black tracking-tight">3EBCHI Pro</span>
              <span className="block text-[11.5px] text-[var(--ink-3)]">Espace hajem</span>
            </span>
          </div>
          <nav className="space-y-1">
            {TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-current={tab === t.key ? "page" : undefined} className="d-side-link">
                <Icon name={t.icon} size={19} />
                {t.label}
                {t.key === "agenda" && (settle > 0 || unseen > 0) && (
                  <span className="d-pill d-pill-warn ml-auto">{unseen > 0 ? `+${unseen}` : settle}</span>
                )}
              </button>
            ))}
          </nav>
          {me.isOwner && (
            <>
              <div className="eyebrow mb-2 mt-7 px-3">Dashboards</div>
              {scopeChips(true)}
            </>
          )}
          <div className="mt-auto flex items-center gap-2.5 rounded-2xl border border-[var(--border)] p-2.5">
            <Avatar name={me.name} photo={BARBERS.find((b) => b.id === me.id)?.photo} color={barberColor(me.id)} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold">{me.name}</span>
              <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-3)]"><span className="d-live" />En direct</span>
            </span>
            <button type="button" className="d-icon-btn d-icon-sm" aria-label={theme === "dark" ? "Mode clair" : "Mode sombre"} onClick={() => changeTheme(theme === "dark" ? "light" : "dark")}>
              <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
            </button>
          </div>
        </aside>

        {/* ---------- Contenu ---------- */}
        <div className="min-w-0 flex-1">
          {/* En-tête mobile */}
          <header className="sticky top-0 z-30 border-b border-[var(--border)] px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl lg:hidden"
            style={{ background: "color-mix(in oklab, var(--bg) 80%, transparent)" }}>
            <div className="flex h-11 items-center gap-3">
              <Avatar name={me.name} photo={BARBERS.find((b) => b.id === me.id)?.photo} color={barberColor(me.id)} size={34} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold leading-tight">Ahla {me.name} 💈</div>
                <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-3)]"><span className="d-live" />{scopeTitle}</div>
              </div>
              <button type="button" className="d-icon-btn" aria-label={theme === "dark" ? "Mode clair" : "Mode sombre"} onClick={() => changeTheme(theme === "dark" ? "light" : "dark")}>
                <Icon name={theme === "dark" ? "sun" : "moon"} size={19} />
              </button>
              <button type="button" className="d-icon-btn relative" aria-label="Agenda" onClick={() => setTab("agenda")}>
                <Icon name="bell" size={19} />
                {unseen > 0 && <span className="d-badge" style={{ right: -4, top: -4 }}>{unseen}</span>}
              </button>
            </div>
          </header>

          <main className="mx-auto max-w-[1240px] px-4 pb-[calc(110px+env(safe-area-inset-bottom))] pt-4 lg:px-8 lg:pb-12 lg:pt-8">
            {/* Titre desktop */}
            <div className="mb-6 hidden items-end justify-between gap-4 lg:flex">
              <div>
                <div className="eyebrow">{TABS.find((t) => t.key === tab)?.label}</div>
                <h1 className="mt-1 font-display text-[30px] font-black tracking-tight">{scopeTitle}</h1>
              </div>
              <span className="flex items-center gap-2 text-[12.5px] text-[var(--ink-3)]"><span className="d-live" />Mise à jour en direct</span>
            </div>

            {tab !== "settings" && me.isOwner && (
              <div className="mb-3 lg:hidden">{scopeChips()}</div>
            )}

            {error && (
              <div className="d-card mb-4 flex items-center justify-between gap-3 p-3.5 text-[13.5px]" style={{ borderColor: "color-mix(in oklab, var(--crit) 40%, transparent)" }}>
                <span className="text-[var(--crit)]">{error}</span>
                <button type="button" className="d-btn d-btn-ghost d-btn-xs" onClick={() => load(scope)}>Réessayer</button>
              </div>
            )}

            {tab === "overview" &&
              (st ? (
                <Overview stats={st} period={period} onPeriod={setPeriod} onScope={(s) => setScope(s)} onAgenda={() => setTab("agenda")} />
              ) : (
                <Skeleton />
              ))}
            {tab === "agenda" &&
              (ag ? (
                <Agenda data={ag} meId={me.id} onChanged={() => load(scope)} notify={(m, t) => notify(m, t)} />
              ) : (
                <Skeleton />
              ))}
            {tab === "settings" && (
              <Settings me={me} theme={theme} onTheme={changeTheme} sound={sound} onSound={changeSound} notify={(m, t) => notify(m, t)} />
            )}
          </main>
        </div>
      </div>

      {/* ---------- Barre d'onglets (mobile) ---------- */}
      <nav className="d-tabbar lg:hidden" aria-label="Navigation">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-current={tab === t.key ? "page" : undefined}>
            <Icon name={t.icon} size={21} />
            {t.label}
            {t.key === "agenda" && (unseen > 0 || settle > 0) && <span className="d-badge">{unseen > 0 ? unseen : settle}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement">
      <div className="d-skel h-11" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="d-skel col-span-2 h-40 lg:col-span-1" />
        <div className="d-skel h-36" />
        <div className="d-skel h-36" />
        <div className="d-skel h-36" />
      </div>
      <div className="d-skel h-72" />
    </div>
  );
}
