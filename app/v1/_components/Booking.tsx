"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BARBERS,
  SERVICES,
  SITE,
  getBarber,
  getService,
} from "@/config/site";
import { nextDays, labelDate, labelDateShort, weekdayOf } from "@/lib/time";
import { isClosedDay } from "@/lib/slots";
import { normalizeTunisianPhone, isValidName } from "@/lib/validation";
import { buildIcs } from "@/lib/ics";
import { BOOKING_WINDOW_DAYS } from "@/config/site";

type Slot = { time: string; available: boolean; reason?: string };

type SuccessData = {
  barber: string;
  service: string;
  date: string;
  time: string;
  durationMin: number;
};

export default function Booking() {
  const [step, setStep] = useState(1);
  const [barber, setBarber] = useState<string>("");
  const [service, setService] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
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

  // Jours ouvrés dans la fenêtre de réservation
  const days = useMemo(
    () => nextDays(BOOKING_WINDOW_DAYS).filter((d) => !isClosedDay(d)),
    []
  );

  // Préselection depuis les cartes barbiers ("Réservi m3ah")
  useEffect(() => {
    function onPick(e: Event) {
      const id = (e as CustomEvent).detail as string;
      if (getBarber(id)) {
        setBarber(id);
        setStep(2);
      }
    }
    window.addEventListener("select-barber", onPick);
    return () => window.removeEventListener("select-barber", onPick);
  }, []);

  const loadSlots = useCallback(async () => {
    if (!barber || !service || !date) return;
    setSlotsLoading(true);
    setSlotsError("");
    try {
      const res = await fetch(
        `/api/availability?barber=${barber}&date=${date}&service=${service}`,
        { cache: "no-store" }
      );
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

  // Charge les créneaux à l'arrivée sur l'étape 4
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
        body: JSON.stringify({
          barber,
          service,
          date,
          time,
          name: name.trim(),
          phone: normPhone,
          note: note.trim(),
          website: honeypot, // honeypot
        }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        const svc = getService(service)!;
        setSuccess({ barber, service, date, time, durationMin: svc.durationMin });
        return;
      }

      if (data.code === "SLOT_TAKEN") {
        setFormError(
          "Sorry, el wa9t hedha t5ass 😅 a5tar wa9t e5er."
        );
        setTime("");
        setStep(4);
        await loadSlots();
      } else if (data.code === "RATE_LIMIT") {
        setFormError("Barcha réservations. Stanna chwaya w 3awed.");
      } else {
        setFormError(data.message || "Mochkla. 3awed essaye.");
      }
    } catch {
      setFormError("Mochkla fel réseau. Form mte3ek mazel mahfoudh, 3awed essaye.");
    } finally {
      setSubmitting(false);
    }
  }

  function downloadIcs() {
    if (!success) return;
    const b = getBarber(success.barber)!;
    const s = getService(success.service)!;
    const ics = buildIcs({
      date: success.date,
      startTime: success.time,
      durationMin: success.durationMin,
      barber: b.name,
      service: s.name,
    });
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
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

  // ---------------- SUCCESS ----------------
  if (success) {
    const b = getBarber(success.barber)!;
    return (
      <section id="booking" className="px-5 py-16" aria-label="Réservation confirmée">
        <div className="mx-auto max-w-lg">
          <div className="tape-card rounded-xl px-6 py-10 text-center">
            <div className="text-6xl">✅</div>
            <h2 className="mt-4 font-marker text-3xl text-spray">C&apos;est réservé!</h2>
            <p className="mt-4 text-lg text-chalk/90">
              Nchoufek <strong className="text-spray">{labelDate(success.date)}</strong>{" "}
              3la <strong className="text-spray">{success.time}</strong> m3a{" "}
              <strong className="text-spray">{b.name}</strong> 💈
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <button onClick={downloadIcs} className="spray-btn rounded-md bg-spray px-6 py-3 font-bebas text-xl tracking-wide text-ink">
                📅 Add to calendar (.ics)
              </button>
              <a href={SITE.mapsUrl} target="_blank" rel="noopener noreferrer" className="spray-btn rounded-md border-2 border-chalk/60 px-6 py-3 font-bebas text-xl tracking-wide text-chalk">
                📍 Win tal9ana? (Maps)
              </a>
              <button onClick={reset} className="mt-2 text-sm text-chalk/60 underline">
                Réservi marra o5ra
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ---------------- STEPPER ----------------
  const barberName = getBarber(barber)?.name;
  const svc = getService(service);

  return (
    <section id="booking" className="px-5 py-16" aria-label="Réservation">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <span className="sticker text-base">💈 Réservation</span>
          <h2 className="mt-4 font-marker text-4xl text-chalk sm:text-5xl">
            <span className="tag-underline">Réservi</span> blastek
          </h2>
        </div>

        {/* Progress */}
        <ol className="mb-8 flex items-center justify-center gap-2" aria-label="Étapes">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <li
              key={n}
              className={`h-2 w-8 rounded-full ${
                n <= step ? "bg-spray" : "bg-chalk/15"
              }`}
              aria-current={n === step ? "step" : undefined}
            />
          ))}
        </ol>

        <div className="tape-card rounded-xl p-5 sm:p-7">
          {/* STEP 1 — barbier */}
          {step === 1 && (
            <Step title="A5tar l'barber 🦍">
              <div className="grid grid-cols-2 gap-3">
                {BARBERS.map((b) => (
                  <BigButton
                    key={b.id}
                    selected={barber === b.id}
                    onClick={() => {
                      setBarber(b.id);
                      setStep(2);
                    }}
                  >
                    <span className="font-marker text-2xl text-spray">{b.name}</span>
                    <span className="mt-1 block text-xs text-chalk/60">{b.tagline}</span>
                  </BigButton>
                ))}
              </div>
            </Step>
          )}

          {/* STEP 2 — service */}
          {step === 2 && (
            <Step title="A5tar l'service ✂️" onBack={() => setStep(1)}>
              <div className="grid grid-cols-1 gap-3">
                {SERVICES.map((s) => (
                  <BigButton
                    key={s.id}
                    selected={service === s.id}
                    onClick={() => {
                      setService(s.id);
                      setStep(3);
                    }}
                  >
                    <span className="flex items-center justify-between">
                      <span>
                        <span className="font-bebas text-xl tracking-wide text-chalk">
                          {s.name}
                        </span>
                        <span className="ml-2 text-xs text-chalk/50">{s.durationMin} min</span>
                      </span>
                      <span className="font-marker text-2xl text-spray">
                        {s.price} <span className="text-sm text-hot">DT</span>
                      </span>
                    </span>
                  </BigButton>
                ))}
              </div>
            </Step>
          )}

          {/* STEP 3 — jour */}
          {step === 3 && (
            <Step title="A5tar nhar 📅" onBack={() => setStep(2)}>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {days.map((d) => {
                  const wd = weekdayOf(d);
                  const dayShort = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"][wd];
                  return (
                    <BigButton
                      key={d}
                      selected={date === d}
                      onClick={() => {
                        setDate(d);
                        setTime("");
                        setStep(4);
                      }}
                    >
                      <span className="block font-bebas text-lg tracking-wide text-spray">
                        {dayShort}
                      </span>
                      <span className="block text-sm text-chalk">{labelDateShort(d)}</span>
                    </BigButton>
                  );
                })}
              </div>
            </Step>
          )}

          {/* STEP 4 — heure */}
          {step === 4 && (
            <Step title="A5tar wa9t ⏰" onBack={() => setStep(3)}>
              <p className="mb-3 text-sm text-chalk/60">
                {barberName} · {svc?.name} · {labelDate(date)}
              </p>
              {slotsLoading && <p className="py-6 text-center text-chalk/60">Chargement…</p>}
              {slotsError && (
                <div className="py-4 text-center">
                  <p className="text-hot">{slotsError}</p>
                  <button onClick={loadSlots} className="mt-2 underline">
                    3awed
                  </button>
                </div>
              )}
              {!slotsLoading && !slotsError && slots.length === 0 && (
                <p className="py-6 text-center text-chalk/60">
                  Ma famech créneaux fi nhar hedha. A5tar nhar e5er.
                </p>
              )}
              {!slotsLoading && !slotsError && slots.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((s) => (
                    <button
                      key={s.time}
                      disabled={!s.available}
                      onClick={() => {
                        setTime(s.time);
                        setStep(5);
                      }}
                      className={`rounded-md border-2 px-2 py-3 font-bebas text-lg tracking-wide transition ${
                        s.available
                          ? "border-spray/60 text-chalk hover:bg-spray hover:text-ink"
                          : "cursor-not-allowed border-chalk/10 text-chalk/30 line-through"
                      }`}
                    >
                      {s.time}
                      {!s.available && (
                        <span className="block text-[10px] no-underline">Ma3mour</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </Step>
          )}

          {/* STEP 5 — coordonnées */}
          {step === 5 && (
            <Step title="Esmek + numrou 📱" onBack={() => setStep(4)}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="bk-name" className="mb-1 block font-bebas text-lg tracking-wide text-chalk/80">
                    Esmek
                  </label>
                  <input
                    id="bk-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    className="w-full rounded-md border-2 border-chalk/20 bg-ink px-4 py-3 text-chalk focus:border-spray"
                    placeholder="Ex: Mohamed"
                  />
                </div>
                <div>
                  <label htmlFor="bk-phone" className="mb-1 block font-bebas text-lg tracking-wide text-chalk/80">
                    Numrou téléphone
                  </label>
                  <input
                    id="bk-phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    className="w-full rounded-md border-2 border-chalk/20 bg-ink px-4 py-3 text-chalk focus:border-spray"
                    placeholder="Ex: 20 123 456"
                  />
                </div>
                <div>
                  <label htmlFor="bk-note" className="mb-1 block font-bebas text-lg tracking-wide text-chalk/80">
                    Note (optionnel)
                  </label>
                  <textarea
                    id="bk-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    maxLength={300}
                    className="w-full rounded-md border-2 border-chalk/20 bg-ink px-4 py-3 text-chalk focus:border-spray"
                    placeholder="Ex: dégradé bas, barbe courte…"
                  />
                </div>

                {/* Honeypot anti-spam (caché aux humains) */}
                <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
                  <label htmlFor="website">Ne pas remplir</label>
                  <input
                    id="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                  />
                </div>

                {formError && <p className="text-hot">{formError}</p>}

                <button
                  onClick={() => {
                    setFormError("");
                    if (!isValidName(name)) {
                      setFormError("Esmek mech valide.");
                      return;
                    }
                    if (!normalizeTunisianPhone(phone)) {
                      setFormError("Numrou mech valide (8 chiffres, +216 optionnel).");
                      return;
                    }
                    setStep(6);
                  }}
                  className="spray-btn w-full rounded-md bg-spray px-6 py-3 font-bebas text-xl tracking-wide text-ink"
                >
                  Continuer →
                </button>
              </div>
            </Step>
          )}

          {/* STEP 6 — confirmation */}
          {step === 6 && (
            <Step title="Confirmi 💈" onBack={() => setStep(5)}>
              <dl className="space-y-2 text-chalk/90">
                <Row k="Barber" v={barberName} />
                <Row k="Service" v={`${svc?.name} — ${svc?.price} DT`} />
                <Row k="Nhar" v={labelDate(date)} />
                <Row k="Wa9t" v={time} />
                <Row k="Esmek" v={name} />
                <Row k="Numrou" v={phone} />
                {note.trim() && <Row k="Note" v={note} />}
              </dl>

              {formError && <p className="mt-4 text-hot">{formError}</p>}

              <button
                onClick={submit}
                disabled={submitting}
                className="spray-btn mt-6 w-full rounded-md bg-hot px-6 py-4 font-bebas text-2xl tracking-wide text-chalk disabled:opacity-60"
              >
                {submitting ? "Jari…" : "Confirmi l'réservation 💈"}
              </button>
              <p className="mt-3 text-center text-xs text-chalk/50">
                En confirmant, {time} m3a {barberName} yetsajjel bismek.
              </p>
            </Step>
          )}
        </div>
      </div>
    </section>
  );
}

function Step({
  title,
  children,
  onBack,
}: {
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="rounded-md border border-chalk/20 px-3 py-1 text-sm text-chalk/70 hover:border-spray"
            aria-label="Retour"
          >
            ← Back
          </button>
        )}
        <h3 className="font-marker text-2xl text-spray">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function BigButton({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border-2 px-4 py-4 text-left transition ${
        selected
          ? "border-spray bg-spray/10"
          : "border-chalk/15 hover:border-spray/70 hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex justify-between border-b border-chalk/10 pb-2">
      <dt className="text-chalk/50">{k}</dt>
      <dd className="font-bebas text-lg tracking-wide text-chalk">{v}</dd>
    </div>
  );
}
