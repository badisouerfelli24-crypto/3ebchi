"use client";

import { useCallback, useEffect, useState } from "react";
import { BARBERS, getBarber } from "@/config/site";
import { PASSWORD_MIN_LENGTH } from "@/lib/securityConfig";
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
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Même règle que la politique serveur (lib/password.ts) : longueur en
  // caractères Unicode. Le serveur reste seul juge ; ceci évite juste un envoi inutile.
  const longEnough = [...password].length >= PASSWORD_MIN_LENGTH;

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy || !longEnough) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/barber/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barber, password }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        onSuccess();
      } else {
        setError(d.message || "Erreur");
        setPassword("");
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
        <p className="mt-2 text-fg/60">A5tar esmek w da5el mot de passe mte3ek</p>
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
          <form onSubmit={submit}>
            <p className="mb-3 text-center text-fg/80">
              Barber : <strong className="text-cyan">{getBarber(barber)?.name}</strong>{" "}
              <button type="button" onClick={() => { setBarber(""); setPassword(""); setError(""); }} className="ml-2 text-sm underline text-fg/50">
                changer
              </button>
            </p>
            {/* Identifiant invisible : permet aux gestionnaires de mots de passe
                d'associer le mot de passe au bon compte. */}
            <input type="text" name="username" autoComplete="username" value={barber} readOnly hidden />
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              aria-label="Mot de passe (15 caractères minimum)"
              className="w-full rounded-md border-2 border-white/20 bg-bg px-4 py-4 text-center font-display font-black text-xl tracking-[0.15em] text-fg focus:border-cyan"
              placeholder="Mot de passe"
            />
            {error && <p className="mt-3 text-center text-pole">{error}</p>}
            <button
              type="submit"
              disabled={busy || !longEnough}
              className="mt-4 w-full rounded-md bg-fg px-6 py-3 font-display font-bold text-xl tracking-wide text-black disabled:opacity-50"
            >
              {busy ? "…" : "Daxel"}
            </button>
          </form>
        )}
      </div>

      <a href="/" className="mt-6 text-sm text-fg/40 underline">
        ← Retour au site
      </a>
    </main>
  );
}
