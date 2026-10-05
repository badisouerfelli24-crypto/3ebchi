"use client";

import { smoothScrollTo } from "@/lib/smoothScroll";
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { BARBERS, SITE, BOOKING_WINDOW_DAYS, getBarber, type Service } from "@/config/site";
import { nextDays, labelDate, labelDateShort, weekdayOf } from "@/lib/time";
import { isClosedDay } from "@/lib/slots";
import { normalizeTunisianPhone, isValidName } from "@/lib/validation";
import SectionHead from "./SectionHead";
import Ticket, { type TicketData } from "./Ticket";

type Slot = { time: string; available: boolean; reason?: string };

/* ------------------------------------------------------------------------
   Tickets gardés dans le navigateur (localStorage) jusqu'à la FIN du
   rendez-vous : le client peut quitter le site et revenir, son coupon est
   toujours là. Ensuite il disparaît tout seul.
   ------------------------------------------------------------------------ */
type StoredTicket = TicketData & { endsAt: number };
const TICKETS_KEY = "3ebchi:tickets";

/** Fin du rendez-vous (timestamp ms) — date/heure exprimées à Tunis. */
function endsAtTunis(date: string, time: string, durationMin: number): number {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, h, mi);
  // Décalage de Tunis à cet instant (UTC+1, calculé plutôt que codé en dur).
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: SITE.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date(asUtc)).map((x) => [x.type, x.value])
  );
  const seen = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return asUtc - (seen - asUtc) + durationMin * 60_000;
}

function readTickets(): StoredTicket[] {
  try {
    const list = JSON.parse(localStorage.getItem(TICKETS_KEY) || "[]");
    return Array.isArray(list) ? list.filter((t) => t && typeof t.endsAt === "number" && t.endsAt > Date.now()) : [];
  } catch {
    return [];
  }
}

function writeTickets(list: StoredTicket[]) {
  try {
    if (list.length) localStorage.setItem(TICKETS_KEY, JSON.stringify(list));
    else localStorage.removeItem(TICKETS_KEY);
  } catch {}
}

const STEPS = ["Hajem", "Service", "Nhar", "Wa9t", "Infos", "Confirmi"];
const DAYS_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export default function Booking({ services }: { services: Service[] }) {
  const getService = (id: string) => services.find((s) => s.id === id);
  const [step, setStep] = useState(1);
  const [barber, setBarber] = useState("");
  const [service, setService] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  // Heure choisie depuis le widget LIVE du hero (validée une fois le service choisi)
  const [prefTime, setPrefTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [honeypot, setHoneypot] = useState(""); // anti-spam : doit rester vide

  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [tickets, setTickets] = useState<StoredTicket[]>([]);
  const [showForm, setShowForm] = useState(false);

  // Tickets encore valides au chargement, puis nettoyage quand un rendez-vous se termine.
  useEffect(() => {
    const prune = () => {
      const list = readTickets();
      writeTickets(list);
      setTickets(list);
    };
    prune();
    const t = setInterval(prune, 30_000);
    return () => clearInterval(t);
  }, []);

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
      setStep(!barber ? 1 : date && prefTime ? 4 : 3);
    }
    // Depuis le widget LIVE : hajem + nhar + wa9t déjà choisis
    function onPrefill(e: Event) {
      const d = (e as CustomEvent).detail as { barber: string; date: string; time: string };
      if (!getBarber(d.barber)) return;
      setBarber(d.barber);
      setDate(d.date);
      setTime("");
      setSlots([]);
      setPrefTime(d.time);
      setFormError("");
      setStep(service ? 4 : 2);
    }
    window.addEventListener("select-barber", onBarber);
    window.addEventListener("select-service", onService);
    window.addEventListener("prefill-booking", onPrefill);
    return () => {
      window.removeEventListener("select-barber", onBarber);
      window.removeEventListener("select-service", onService);
      window.removeEventListener("prefill-booking", onPrefill);
    };
  }, [barber, service, date, prefTime]);

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

  // Heure pré-choisie (widget LIVE) : si elle convient au service -> étape 5
  useEffect(() => {
    if (step !== 4 || !prefTime || slotsLoading || slotsError || slots.length === 0) return;
    const ok = slots.find((s) => s.time === prefTime && s.available);
    if (ok) {
      setTime(prefTime);
      setStep(5);
    } else {
      setFormError(`El wa9t ${prefTime} ma ykaffich l'service hedha — a5tar wa9t e5er.`);
    }
    setPrefTime("");
  }, [step, prefTime, slots, slotsLoading, slotsError]);

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
        const bx = getBarber(barber)!;
        const sx = getService(service)!;
        const ticket: StoredTicket = {
          ref: data.ref || "",
          name: name.trim(),
          hajem: bx.name,
          hajemPhoto: bx.photo,
          service: sx.name,
          price: sx.price,
          durationMin: sx.durationMin,
          date,
          time,
          endsAt: endsAtTunis(date, time, sx.durationMin),
        };
        const list = [ticket, ...readTickets().filter((t) => t.ref !== ticket.ref)];
        writeTickets(list);
        setTickets(list);
        setShowForm(false);
        clearForm();
        // ramener le ticket à l'écran
        requestAnimationFrame(() => smoothScrollTo("booking"));
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

  function clearForm() {
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

  // "Réservi marra o5ra" : le(s) ticket(s) restent affichés, le formulaire s'ouvre en dessous.
  function bookAgain() {
    clearForm();
    setShowForm(true);
  }

  const b = getBarber(barber);
  const svc = getService(service);

  return (
    <section id="booking" className="px-4 py-20 sm:px-6 sm:py-28" aria-label="Réservation">
      <div className="mx-auto max-w-6xl">
        <SectionHead n="04" label="Réservation" title="Réservi" outline="blastek" sub="6 étapes, 30 secondes. Confirmation directe." />

        {tickets.length > 0 && (
          <div className="mx-auto max-w-md space-y-14">
            {tickets.map((t, i) => (
              <div key={t.ref || i}>
                <div className="mb-6 text-center">
                  {i === 0 && <h3 className="display text-5xl">C&apos;est réservé!</h3>}
                  <p className="mt-3 text-fg/85">
                    Nchoufek <strong>{labelDate(t.date)}</strong> 3la <strong>{t.time}</strong> m3a <strong>{t.hajem}</strong> 💈
                  </p>
                </div>
                <Ticket t={t} />
              </div>
            ))}

            <div>
              <a href={SITE.mapsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost w-full !px-3 text-sm">
                📍 Maps
              </a>
              {!showForm && (
                <button onClick={bookAgain} className="mx-auto mt-5 block text-sm text-muted underline underline-offset-4">
                  Réservi marra o5ra
                </button>
              )}
            </div>
          </div>
        )}

        {(tickets.length === 0 || showForm) && (
          <div className={`card grid overflow-hidden lg:grid-cols-[280px_1fr] ${tickets.length ? "mt-14" : ""}`}>
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
                <Step title="A5tar l'hajem">
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
                    {services.map((s) => (
                      <Tile key={s.id} vip={s.premium} selected={service === s.id} onClick={() => { setService(s.id); setStep(date && prefTime ? 4 : 3); }}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className={`font-display font-extrabold ${s.premium ? "text-[#f5d17a]" : ""}`}>
                              {s.premium && "👑 "}
                              {s.name}
                            </div>
                            <div className="text-xs text-fg/60">{s.sub}</div>
                            <div className="font-mono text-xs text-muted">{s.durationMin} min</div>
                          </div>
                          <div className={`font-display text-2xl font-black ${s.premium ? "text-[#f5d17a]" : ""}`}>
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
                      <Tile key={d} selected={date === d} onClick={() => { setDate(d); setTime(""); setPrefTime(""); setSlots([]); setStep(4); }}>
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
                    <Row k="Hajem" v={b?.name} />
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

function Tile({ children, selected, onClick, vip }: { children: React.ReactNode; selected?: boolean; onClick: () => void; vip?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition-all duration-300 ${vip ? "tile-vip sm:col-span-2 " : ""}${
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
