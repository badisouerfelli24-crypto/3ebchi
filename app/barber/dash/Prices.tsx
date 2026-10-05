"use client";

import { useEffect, useRef, useState } from "react";
import type { Service } from "@/config/site";
import { api } from "./lib";
import { Icon, Switch, CardHeader } from "./ui";

/* Onglet « Prix » — owner (3EBCHI) seulement. Tout en derja (lettres latines).
   Chaque "Sajjel" est en ligne sur le site tout de suite. */

type Draft = {
  id?: string;
  kind: "solo" | "pack";
  name: string;
  sub: string;
  price: string;
  durationMin: string;
  parts: string[];
  premium: boolean;
};

const DURATIONS = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180];

const toDraft = (s: Service): Draft => ({
  id: s.id,
  kind: s.kind,
  name: s.name,
  sub: s.sub ?? "",
  price: String(s.price),
  durationMin: String(s.durationMin),
  parts: s.parts ?? [],
  premium: !!s.premium,
});

const blank = (kind: "solo" | "pack"): Draft => ({ kind, name: "", sub: "", price: "", durationMin: kind === "pack" ? "45" : "30", parts: [], premium: false });

export function Prices({ notify }: { notify: (m: string, t?: "good" | "crit") => void }) {
  const [services, setServices] = useState<Service[] | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    api<{ services: Service[] }>("/api/barber/services")
      .then((r) => setServices(r.services))
      .catch((e) => {
        setServices([]);
        notifyRef.current((e as Error).message, "crit");
      });
  }, []);

  async function save(d: Draft) {
    setBusy(true);
    try {
      const r = await api<{ services: Service[] }>("/api/barber/services", {
        method: "POST",
        body: JSON.stringify({ ...d, price: Number(d.price.replace(",", ".")), durationMin: Number(d.durationMin) }),
      });
      setServices(r.services);
      setEditing(null);
      notify(d.id ? "Tsajjel ✓ — fel site taw" : "Tzed ✓ — fel site taw", "good");
    } catch (e) {
      notify((e as Error).message, "crit");
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: Service) {
    if (confirmDel !== s.id) {
      setConfirmDel(s.id);
      return;
    }
    setConfirmDel(null);
    setBusy(true);
    try {
      const r = await api<{ services: Service[] }>(`/api/barber/services?id=${encodeURIComponent(s.id)}`, { method: "DELETE" });
      setServices(r.services);
      if (editing?.id === s.id) setEditing(null);
      notify(`${s.name} tfassa5 ✓`, "good");
    } catch (e) {
      notify((e as Error).message, "crit");
    } finally {
      setBusy(false);
    }
  }

  if (!services) return <div className="d-skel h-72" aria-busy="true" />;

  const solos = services.filter((s) => s.kind === "solo");
  const packs = services.filter((s) => s.kind === "pack" && !s.premium);
  const vip = services.filter((s) => s.kind === "pack" && s.premium);

  const row = (s: Service) =>
    editing?.id === s.id ? (
      <Editor key={s.id} d={editing} solos={solos} busy={busy} onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} />
    ) : (
      <article key={s.id} className="d-card flex items-center gap-3 p-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{s.name}</span>
            {s.premium && <span className="d-pill d-pill-warn">👑 VIP</span>}
          </div>
          {s.sub && <div className="mt-0.5 truncate text-[12.5px] text-[var(--ink-2)]">{s.sub}</div>}
          <div className="mt-1 flex items-center gap-1 text-[12px] text-[var(--ink-3)]">
            <Icon name="clock" size={13} />
            {s.durationMin} d9i9a
          </div>
        </div>
        <div className="num shrink-0 text-right text-[20px] font-black">
          {s.price}
          <span className="ml-0.5 text-[11px] font-semibold text-[var(--ink-3)]">DT</span>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button type="button" className="d-btn d-btn-ghost d-btn-xs" disabled={busy} onClick={() => { setConfirmDel(null); setEditing(toDraft(s)); }}>
            Baddel
          </button>
          <button type="button" className={`d-btn d-btn-tone d-btn-xs ${confirmDel === s.id ? "is-solid" : ""}`} style={{ "--tone": "var(--crit)" } as React.CSSProperties} disabled={busy} onClick={() => remove(s)}>
            {confirmDel === s.id ? "Mta2ked?" : "Fassa5"}
          </button>
        </div>
      </article>
    );

  const adding = (kind: "solo" | "pack") => editing && !editing.id && editing.kind === kind;

  return (
    <div className="space-y-6">
      <section className="d-card d-rise p-4 lg:p-5">
        <CardHeader title="Les prix w les services" sub="Kol tbadil tsajlou yodhher fel site direct. Ghir enti (3EBCHI) tnajem tbaddel hné." />
        <p className="text-[12.5px] text-[var(--ink-3)]">
          Les réservations elli tsaru 9bal ma yetbaddlouch : yo93dou b l&apos;soum w l&apos;wa9t elli kenou.
        </p>
      </section>

      <Group
        title="Wa7dou"
        count={solos.length}
        tone="var(--s2)"
        action={!adding("solo") && <AddBtn label="Zid wa7da" onClick={() => setEditing(blank("solo"))} disabled={busy} />}
      >
        {adding("solo") && <Editor d={editing!} solos={solos} busy={busy} onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} />}
        {solos.map(row)}
      </Group>

      <Group
        title="Packs"
        count={packs.length + vip.length}
        tone="var(--accent)"
        action={!adding("pack") && <AddBtn label="Zid pack" onClick={() => setEditing(blank("pack"))} disabled={busy} />}
      >
        {adding("pack") && <Editor d={editing!} solos={solos} busy={busy} onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} />}
        {vip.map(row)}
        {packs.map(row)}
      </Group>
    </div>
  );
}

function Group({ title, count, tone, action, children }: { title: string; count: number; tone: string; action: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="d-rise">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="h-4 w-1 rounded-full" style={{ background: tone }} />
        <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
        <span className="d-pill d-pill-neutral">{count}</span>
        <span className="ml-auto">{action}</span>
      </div>
      <div className="grid gap-2.5 lg:grid-cols-2">{children}</div>
    </section>
  );
}

function AddBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" className="d-btn d-btn-primary d-btn-sm" onClick={onClick} disabled={disabled}>
      <Icon name="plus" size={16} stroke={2.4} />
      {label}
    </button>
  );
}

function Editor({
  d,
  solos,
  busy,
  onChange,
  onSave,
  onCancel,
}: {
  d: Draft;
  solos: Service[];
  busy: boolean;
  onChange: (d: Draft) => void;
  onSave: (d: Draft) => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...d, ...patch });
  const isPack = d.kind === "pack";
  const durations = DURATIONS.includes(Number(d.durationMin)) ? DURATIONS : [...DURATIONS, Number(d.durationMin)].sort((a, b) => a - b);
  const separate = d.parts.reduce((t, id) => t + (solos.find((s) => s.id === id)?.price ?? 0), 0);
  const priceNum = Number(d.price.replace(",", "."));
  const valid = d.name.trim().length >= 2 && d.price.trim() !== "" && Number.isFinite(priceNum) && priceNum >= 0;

  function togglePart(id: string) {
    const parts = d.parts.includes(id) ? d.parts.filter((x) => x !== id) : [...d.parts, id];
    // Wasf automatique tant qu'il suit le contenu du pack.
    const auto = (list: string[]) => list.map((x) => solos.find((s) => s.id === x)?.name).filter(Boolean).join(" + ");
    const sub = !d.sub || d.sub === auto(d.parts) ? auto(parts) : d.sub;
    set({ parts, sub });
  }

  return (
    <div className="d-card space-y-3.5 p-3.5 lg:col-span-2" style={{ borderColor: "var(--accent)" }}>
      <div className="eyebrow">{d.id ? `Baddel ${isPack ? "el pack" : "el service"}` : isPack ? "Pack jdid" : "Service wa7dou jdid"}</div>

      <Field label="Esm">
        <input className="d-input" value={d.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} placeholder={isPack ? "Ex : Pack Weekend" : "Ex : Soin wejh"} />
      </Field>

      <Field label="Wasf (description)">
        <input className="d-input" value={d.sub} maxLength={80} onChange={(e) => set({ sub: e.target.value })} placeholder={isPack ? "Ex : Hjema + Lahya" : "Ex : Coupe"} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Soum (DT)">
          <input className="d-input num" inputMode="decimal" value={d.price} onChange={(e) => set({ price: e.target.value.replace(/[^\d.,]/g, "") })} placeholder="Ex : 15" />
        </Field>
        <Field label="Wa9t (d9aye9)">
          <select className="d-input" value={d.durationMin} onChange={(e) => set({ durationMin: e.target.value })}>
            {durations.map((m) => (
              <option key={m} value={m}>{m} d9i9a</option>
            ))}
          </select>
        </Field>
      </div>

      {isPack && (
        <>
          <Field label="Chnowa fih (optionnel — ye7seb 9adech yrabba7 el client)">
            <div className="flex flex-wrap gap-2">
              {solos.map((s) => {
                const on = d.parts.includes(s.id);
                return (
                  <button key={s.id} type="button" onClick={() => togglePart(s.id)} aria-pressed={on}
                    className="rounded-xl border px-3 py-2 text-[13px] font-semibold transition-all"
                    style={{ borderColor: on ? "var(--accent)" : "var(--border)", background: on ? "var(--accent-soft)" : "transparent" }}>
                    {on ? "✓ " : ""}{s.name}
                  </button>
                );
              })}
            </div>
            {d.parts.length > 0 && valid && (
              <p className="mt-2 text-[12px] text-[var(--ink-3)]">
                Wa7dou : {separate} DT{separate > priceNum ? ` → el client yrabba7 ${Math.round((separate - priceNum) * 10) / 10} DT` : ""}
              </p>
            )}
          </Field>

          <label className="flex items-center justify-between gap-3 text-[14px]">
            <span>
              Pack VIP 👑
              <span className="block text-[12px] text-[var(--ink-3)]">Carte dorée el kbira fel site (pack wa7ed bark)</span>
            </span>
            <Switch checked={d.premium} onChange={(v) => set({ premium: v })} label="Pack VIP" />
          </label>
        </>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button type="button" className="d-btn d-btn-ghost" onClick={onCancel} disabled={busy}>Batel</button>
        <button type="button" className="d-btn d-btn-primary" onClick={() => onSave(d)} disabled={busy || !valid}>
          <Icon name="check" size={17} stroke={2.4} />
          {busy ? "…" : "Sajjel"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[12.5px] font-semibold text-[var(--ink-2)]">{label}</div>
      {children}
    </div>
  );
}
