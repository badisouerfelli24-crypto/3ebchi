"use client";

import { useCallback, useEffect, useState } from "react";
import { BARBERS, getBarber } from "@/config/site";
import Dashboard from "./dash/Dashboard";
import type { Me } from "./dash/lib";

export default function BarberPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/barber/me", { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      setMe(res.ok && d.ok ? d.me : null);
    } catch {
      setMe(null);
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center text-fg/60">
        Chargement…
      </main>
    );
  }

  if (!me) {
    return <Login onSuccess={load} />;
  }

  return <Dashboard me={me} onLogout={() => setMe(null)} />;
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
        <div className="font-display font-black text-4xl text-cyan">Espace hajem 🔒</div>
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
