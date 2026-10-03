"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { BARBERS, SERVICES, SITE, BOOKING_WINDOW_DAYS, getBarber, getService } from "@/config/site";
import { nextDays, labelDate, labelDateShort, weekdayOf } from "@/lib/time";
import { isClosedDay } from "@/lib/slots";
import { normalizeTunisianPhone, isValidName } from "@/lib/validation";
import { buildIcs } from "@/lib/ics";
import SectionHead from "./SectionHead";

type Slot = { time: string; available: boolean; reason?: string };
type SuccessData = { barber: string; service: string; date: string; time: string; durationMin: number };

const STEPS = ["Barber", "Service", "Nhar", "Wa9t", "Infos", "Confirmi"];
const DAYS_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export default function Booking() {
  const [step, setStep] = useState(1);
  const [barber, setBarber] = useState("");
  const [service, setService] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [honeypot, setHoneypot] = useState(""); // anti-spam : doit rester vide

  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState<SuccessData | null>(null);

  const days = useMemo(() => nextDays(BOOKING_WINDOW_DAYS).filter((d) => !isClosedDay(d)), []);

  // Raccourcis depuis les cartes Barbers / Services
  useEffect(() => {
    function onBarber(e: Event) {
      const id = (e as CustomEvent).detail as string;
      if (!getBarber(id)) return;
      setBarber(id);
      setStep(service ? 3 : 2);
    }
    function onService(e: Event) {
      const id = (e as CustomEvent).detail as string;
      if (!getService(id)) return;
      setService(id);
      setStep(barber ? 3 : 1);
    }
    window.addEventListener("select-barber", onBarber);
    window.addEventListener("select-service", onService);
    return () => {
      window.removeEventListener("select-barber", onBarber);
      window.removeEventListener("select-service", onService);
    };
  }, [barber, service]);

  const loadSlots = useCallback(async () => {
    if (!barber || !service || !date) return;
    setSlotsLoading(true);
    setSlotsError("");
    try {
      const res = await fetch(`/api/availability?barber=${barber}&date=${date}&service=${service}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Erreur");
      setSlots(data.slots || []);
    } catch {
      setSlotsError("Mochkla fel chargement. 3awed essaye.");
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [barber, service, date]);

  useEffect(() => {
    if (step === 4) loadSlots();
  }, [step, loadSlots]);

  async function submit() {
    setFormError("");
    const normPhone = normalizeTunisianPhone(phone);
    if (!isValidName(name)) {
      setFormError("Esmek mech valide (2 caractères minimum).");
      setStep(5);
      return;
    }
    if (!normPhone) {
      setFormError("Numrou mech valide. Format : 8 chiffres (+216 optionnel).");
      setStep(5);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barber, service, date, time, name: name.trim(), phone: normPhone, note: note.trim(), website: honeypot }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSuccess({ barber, service, date, time, durationMin: getService(service)!.durationMin });
        return;
      }
      if (data.code === "SLOT_TAKEN") {
        setFormError("Sorry, el wa9t hedha t5ass 😅 a5tar wa9t e5er.");
        setTime("");
        setStep(4);
        await loadSlots();
      } else if (data.code === "RATE_LIMIT") {
        setFormError("Barcha réservations. Stanna chwaya w 3awed.");
      } else {
        setFormError(data.message || "Mochkla. 3awed essaye.");
      }
    } catch {
      setFormError("Mochkla fel réseau. Les infos mte3ek mazelou mahfoudhin, 3awed essaye.");
    } finally {
      setSubmitting(false);
    }
  }

  function downloadIcs() {
    if (!success) return;
    const ics = buildIcs({
      date: success.date,
      startTime: success.time,
      durationMin: success.durationMin,
      barber: getBarber(success.barber)!.name,
      service: getService(success.service)!.name,
    });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "3ebchi-style-rdv.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setSuccess(null);
    setStep(1);
    setBarber("");
    setService("");
    setDate("");
    setTime("");
    setName("");
    setPhone("");
    setNote("");
    setFormError("");
  }

  const b = getBarber(barber);
  const svc = getService(service);

  return (
    <section id="booking" className="px-4 py-20 sm:px-6 sm:py-28" aria-label="Réservation">
      <div className="mx-auto max-w-6xl">
        <SectionHead n="04" label="Réservation" title="Réservi" outline="blastek" sub="6 étapes, 30 secondes. Confirmation directe." />

        {success ? (
          <div className="card mx-auto max-w-xl px-6 py-12 text-center sm:px-10" data-reveal>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-cyan via-violet to-pink text-3xl text-black">
              ✓
            </div>
            <h3 className="display mt-6 text-5xl">C&apos;est réservé!</h3>
            <p className="mt-4 text-lg text-fg/85">
              Nchoufek <strong>{labelDate(success.date)}</strong> 3la <strong>{success.time}</strong> m3a{" "}
              <strong>{getBarber(success.barber)!.name}</strong> 💈
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <button onClick={downloadIcs} className="btn btn-primary">
                📅 Zid l&apos;calendrier
              </button>
              <a href={SITE.mapsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                📍 Win tal9ana? (Maps)
              </a>
              <button onClick={reset} className="mt-2 text-sm text-muted underline underline-offset-4">
                Réservi marra o5ra
              </button>
            </div>
          </div>
        ) : (
          <div className="card grid overflow-hidden lg:grid-cols-[280px_1fr]" data-reveal>
            {/* Rail de progression */}
            <aside className="border-b border-line p-5 lg:border-b-0 lg:border-r lg:p-7">
              <div className="font-mono text-xs tracking-[0.2em] text-muted">
                STEP {String(step).padStart(2, "0")} / 06
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan via-violet to-pink transition-all duration-700"
                  style={{ width: `${(step / 6) * 100}%` }}
                />
              </div>
              <ol className="mt-6 hidden space-y-1 lg:block">
                {STEPS.map((s, i) => {
                  const n = i + 1;
                  const done = n < step;
                  return (
                    <li key={s}>
                      <button
                        disabled={n > step}
                        onClick={() => setStep(n)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                          n === step ? "bg-white/[0.06] text-fg" : done ? "text-fg/70 hover:bg-white/[0.03]" : "text-muted/50"
                        }`}
                      >
                        <span
                          className={`grid h-6 w-6 place-items-center rounded-full border font-mono text-[10px] ${
                            done ? "border-cyan bg-cyan text-black" : n === step ? "border-fg" : "border-line"
                          }`}
                        >
                          {done ? "✓" : n}
                        </span>
                        {s}
                      </button>
                    </li>
                  );
                })}
              </ol>
              {(b || svc || date) && (
                <div className="mt-5 flex flex-wrap gap-2 lg:mt-8">
                  {b && <span className="chip">✂️ {b.name}</span>}
                  {svc && <span className="chip">{svc.name}</span>}
                  {date && <span className="chip">📅 {labelDateShort(date)}</span>}
                  {time && <span className="chip">⏰ {time}</span>}
                </div>
              )}
            </aside>

            {/* Contenu de l'étape */}
            <div className="p-5 sm:p-8">
              {step === 1 && (
                <Step title="A5tar l'barber">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {BARBERS.map((x) => (
                      <Tile key={x.id} selected={barber === x.id} onClick={() => { setBarber(x.id); setStep(service ? 3 : 2); }}>
                        <div className="flex flex-col items-center gap-2 py-1 text-center">
                          {x.photo ? (
                            <Image src={x.photo} alt="" width={56} height={56} className="h-14 w-14 rounded-full object-cover" />
                          ) : (
                            <span className="grid h-14 w-14 place-items-center rounded-full bg-white/10 font-display font-black">{x.name.slice(0, 2)}</span>
                          )}
                          <span className="font-display font-extrabold">{x.name}</span>
                        </div>
                      </Tile>
                    ))}
                  </div>
                </Step>
              )}

              {step === 2 && (
                <Step title="A5tar l'service" onBack={() => setStep(1)}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SERVICES.map((s) => (
                      <Tile key={s.id} selected={service === s.id} onClick={() => { setService(s.id); setStep(3); }}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-display font-extrabold">{s.name}</div>
                            <div className="font-mono text-xs text-muted">{s.durationMin} min</div>
                          </div>
                          <div className="font-display text-2xl font-black">
                            {s.price}
                            <span className="ml-0.5 font-mono text-[10px] text-muted">DT</span>
                          </div>
                        </div>
                      </Tile>
                    ))}
                  </div>
                </Step>
              )}

              {step === 3 && (
                <Step title="A5tar nhar" onBack={() => setStep(2)}>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {days.map((d) => (
                      <Tile key={d} selected={date === d} onClick={() => { setDate(d); setTime(""); setStep(4); }}>
                        <div className="text-center">
                          <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">{DAYS_SHORT[weekdayOf(d)]}</div>
                          <div className="font-display text-2xl font-black">{labelDateShort(d)}</div>
                        </div>
                      </Tile>
                    ))}
                  </div>
                </Step>
              )}

              {step === 4 && (
                <Step title="A5tar wa9t" onBack={() => setStep(3)}>
                  <p className="mb-4 font-mono text-xs text-muted">
                    {b?.name} · {svc?.name} · {labelDate(date)}
                  </p>
                  {formError && <p className="mb-4 rounded-xl border border-pole/40 bg-pole/10 px-4 py-3 text-sm text-fg">{formError}</p>}
                  {slotsLoading && (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="h-12 animate-pulse rounded-xl bg-white/[0.05]" />
                      ))}
                    </div>
                  )}
                  {slotsError && (
                    <div className="py-4 text-center">
                      <p className="text-pole">{slotsError}</p>
                      <button onClick={loadSlots} className="mt-2 underline underline-offset-4">3awed</button>
                    </div>
                  )}
                  {!slotsLoading && !slotsError && slots.length === 0 && (
                    <p className="py-6 text-center text-muted">Kol chay ma3mour fi nhar hedha. A5tar nhar e5er.</p>
                  )}
                  {!slotsLoading && !slotsError && slots.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {slots.map((s) => (
                        <button
                          key={s.time}
                          disabled={!s.available}
                          onClick={() => { setTime(s.time); setFormError(""); setStep(5); }}
                          className={`rounded-xl border px-2 py-3 font-mono text-sm transition-all ${
                            s.available
                              ? "border-line hover:border-fg hover:bg-fg hover:text-black"
                              : "cursor-not-allowed border-transparent bg-white/[0.02] text-muted/40 line-through"
                          }`}
                        >
                          {s.time}
                          {!s.available && <span className="block text-[9px] no-underline">Ma3mour</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </Step>
              )}

              {step === 5 && (
                <Step title="Esmek + numrou" onBack={() => setStep(4)}>
                  <div className="space-y-4">
                    <Field id="bk-name" label="Esmek">
                      <input id="bk-name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Ex: Mohamed" className="input" />
                    </Field>
                    <Field id="bk-phone" label="Numrou téléphone">
                      <input id="bk-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="Ex: 20 123 456" className="input" />
                    </Field>
                    <Field id="bk-note" label="Note (optionnel)">
                      <textarea id="bk-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} placeholder="Ex: dégradé bas, barbe courte…" className="input" />
                    </Field>

                    {/* Honeypot anti-spam (invisible pour les humains) */}
                    <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                      <label htmlFor="website">Ne pas remplir</label>
                      <input id="website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
                    </div>

                    {formError && <p className="text-sm text-pole">{formError}</p>}

                    <button
                      onClick={() => {
                        setFormError("");
                        if (!isValidName(name)) return setFormError("Esmek mech valide.");
                        if (!normalizeTunisianPhone(phone)) return setFormError("Numrou mech valide (8 chiffres, +216 optionnel).");
                        setStep(6);
                      }}
                      className="btn btn-primary w-full"
                    >
                      Continuer →
                    </button>
                  </div>
                </Step>
              )}

              {step === 6 && (
                <Step title="Confirmi" onBack={() => setStep(5)}>
                  <dl className="divide-y divide-line rounded-2xl border border-line">
                    <Row k="Barber" v={b?.name} />
                    <Row k="Service" v={`${svc?.name} — ${svc?.price} DT`} />
                    <Row k="Nhar" v={labelDate(date)} />
                    <Row k="Wa9t" v={time} />
                    <Row k="Esmek" v={name} />
                    <Row k="Numrou" v={phone} />
                    {note.trim() && <Row k="Note" v={note} />}
                  </dl>
                  {formError && <p className="mt-4 text-sm text-pole">{formError}</p>}
                  <button onClick={submit} disabled={submitting} className="btn btn-primary mt-6 w-full text-lg disabled:opacity-60">
                    {submitting ? "Jari…" : "Confirmi l'réservation 💈"}
                  </button>
                </Step>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Step({ title, children, onBack }: { title: string; children: React.ReactNode; onBack?: () => void }) {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="grid h-9 w-9 place-items-center rounded-full border border-line hover:border-fg/40" aria-label="Retour">
            ←
          </button>
        )}
        <h3 className="font-display text-2xl font-black tracking-tight sm:text-3xl">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Tile({ children, selected, onClick }: { children: React.ReactNode; selected?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition-all duration-300 ${
        selected ? "border-fg bg-white/[0.07]" : "border-line hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/[0.03]"
      }`}
    >
      {children}
    </button>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-mono text-xs uppercase tracking-[0.15em] text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-3">
      <dt className="font-mono text-xs uppercase tracking-[0.15em] text-muted">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );
}
