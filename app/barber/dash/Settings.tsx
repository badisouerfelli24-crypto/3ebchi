"use client";

import { useEffect, useState } from "react";
import { BARBERS } from "@/config/site";
import { api, barberColor, type Me } from "./lib";
import { Icon, Switch, Avatar, Segmented, CardHeader } from "./ui";

type PushState = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "unconfigured";

function urlB64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function swRegistration() {
  return navigator.serviceWorker.register("/barber-sw.js", { scope: "/barber" });
}

export function Settings({
  me,
  theme,
  onTheme,
  sound,
  onSound,
  notify,
}: {
  me: Me;
  theme: "dark" | "light";
  onTheme: (t: "dark" | "light") => void;
  sound: boolean;
  onSound: (v: boolean) => void;
  notify: (m: string, t?: "good" | "crit") => void;
}) {
  const [push, setPush] = useState<PushState>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [muted, setMuted] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const team = BARBERS.filter((b) => b.id !== me.id);

  useEffect(() => {
    (async () => {
      try {
        const d = await api<{ publicKey: string | null; mutedTeam: string[] }>("/api/barber/push");
        setPublicKey(d.publicKey);
        setMuted(d.mutedTeam);
        const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const standalone =
          window.matchMedia("(display-mode: standalone)").matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true;
        if (!d.publicKey) return setPush("unconfigured");
        if (!supported) return setPush(ios && !standalone ? "ios-install" : "unsupported");
        if (Notification.permission === "denied") return setPush("denied");
        const reg = await swRegistration();
        const sub = await reg.pushManager.getSubscription();
        setPush(sub ? "on" : "off");
      } catch {
        setPush("unsupported");
      }
    })();
  }, []);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPush(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await swRegistration();
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(publicKey) }));
      await api("/api/barber/push", { method: "POST", body: JSON.stringify({ action: "subscribe", subscription: sub.toJSON() }) });
      setPush("on");
      notify("Notifications activées sur cet appareil", "good");
    } catch (e) {
      notify((e as Error).message || "Impossible d'activer", "crit");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await swRegistration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api("/api/barber/push", { method: "POST", body: JSON.stringify({ action: "unsubscribe", endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setPush("off");
    } catch (e) {
      notify((e as Error).message, "crit");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    try {
      await api("/api/barber/push", { method: "POST", body: JSON.stringify({ action: "test" }) });
      notify("Notification de test envoyée", "good");
    } catch (e) {
      notify((e as Error).message, "crit");
    }
  }

  async function toggleMember(id: string, on: boolean) {
    const next = on ? muted.filter((x) => x !== id) : [...muted, id];
    const before = muted;
    setMuted(next);
    try {
      await api("/api/barber/push", { method: "POST", body: JSON.stringify({ action: "mute", mutedTeam: next }) });
    } catch (e) {
      setMuted(before);
      notify((e as Error).message, "crit");
    }
  }

  async function logout() {
    await fetch("/api/barber/logout", { method: "POST" });
    location.reload();
  }

  const status: Record<PushState, { text: string; pill: string }> = {
    loading: { text: "…", pill: "d-pill-neutral" },
    on: { text: "Activées", pill: "d-pill-good" },
    off: { text: "Désactivées", pill: "d-pill-neutral" },
    denied: { text: "Bloquées", pill: "d-pill-crit" },
    unsupported: { text: "Non supportées", pill: "d-pill-neutral" },
    "ios-install": { text: "À installer", pill: "d-pill-warn" },
    unconfigured: { text: "Non configurées", pill: "d-pill-warn" },
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
      <section className="d-card d-rise p-4 lg:p-5">
        <CardHeader title="Apparence" sub="Mode sombre par défaut" />
        <Segmented
          label="Thème"
          value={theme}
          onChange={onTheme}
          options={[
            { value: "dark", label: <span className="flex items-center justify-center gap-2"><Icon name="moon" size={15} />Sombre</span> },
            { value: "light", label: <span className="flex items-center justify-center gap-2"><Icon name="sun" size={15} />Clair</span> },
          ]}
        />
      </section>

      <section className="d-card d-rise p-4 lg:row-span-2 lg:p-5">
        <CardHeader
          title="Notifications"
          sub="Gratuites · une alerte à chaque nouvelle réservation"
          right={<span className={`d-pill ${status[push].pill}`}>{status[push].text}</span>}
        />

        {push === "ios-install" && (
          <Hint>
            Sur iPhone : touche <b>Partager</b> puis <b>« Sur l&apos;écran d&apos;accueil »</b>, ouvre 3EBCHI Pro depuis l&apos;icône, puis reviens ici pour activer.
          </Hint>
        )}
        {push === "denied" && <Hint>Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur, puis recharge la page.</Hint>}
        {push === "unsupported" && <Hint>Ce navigateur ne supporte pas les notifications push. Les alertes s&apos;affichent quand le dashboard est ouvert.</Hint>}
        {push === "unconfigured" && <Hint>Les clés VAPID ne sont pas encore configurées sur le serveur (voir README). Les alertes dans l&apos;app fonctionnent déjà.</Hint>}

        {(push === "off" || push === "on") && (
          <div className="flex flex-wrap gap-2">
            {push === "off" ? (
              <button type="button" onClick={enable} disabled={busy} className="d-btn d-btn-primary flex-1">
                <Icon name="bell" size={17} />Activer sur cet appareil
              </button>
            ) : (
              <>
                <button type="button" onClick={test} className="d-btn d-btn-primary flex-1"><Icon name="sparkles" size={17} />Tester</button>
                <button type="button" onClick={disable} disabled={busy} className="d-btn d-btn-ghost"><Icon name="bellOff" size={17} />Désactiver</button>
              </>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
          <span>
            <span className="block text-[14px] font-medium">Son dans l&apos;app</span>
            <span className="block text-[12px] text-[var(--ink-3)]">Petit bip quand le dashboard est ouvert</span>
          </span>
          <Switch checked={sound} onChange={onSound} label="Son dans l'app" />
        </div>

        {me.isOwner && (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <div className="mb-1 text-[14px] font-medium">Réservations de l&apos;équipe</div>
            <p className="mb-3 text-[12px] text-[var(--ink-3)]">
              Choisis de qui tu reçois les notifications. Chaque hajem reçoit toujours les siennes.
            </p>
            <ul className="space-y-1">
              {team.map((b) => {
                const on = !muted.includes(b.id);
                return (
                  <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-[var(--card-hi)]">
                    <span className="flex items-center gap-2.5 text-[14px] font-medium">
                      <Avatar name={b.name} photo={b.photo} color={barberColor(b.id)} size={28} />
                      {b.name}
                      {!on && <span className="d-pill d-pill-neutral"><Icon name="bellOff" size={11} />coupé</span>}
                    </span>
                    <Switch checked={on} onChange={(v) => toggleMember(b.id, v)} label={`Notifications de ${b.name}`} />
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <section className="d-card d-rise p-4 lg:p-5">
        <CardHeader title="Compte" sub={`Connecté en tant que ${me.name}`} />
        <div className="flex flex-wrap gap-2">
          <a href="/" className="d-btn d-btn-ghost flex-1"><Icon name="home" size={17} />Voir le site</a>
          <button type="button" onClick={logout} className="d-btn d-btn-tone flex-1" style={{ "--tone": "var(--crit)" } as React.CSSProperties}>
            <Icon name="logout" size={17} />Se déconnecter
          </button>
        </div>
      </section>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 rounded-xl px-3 py-2.5 text-[13px] leading-relaxed text-[var(--ink-2)]" style={{ background: "var(--card-hi)" }}>
      {children}
    </p>
  );
}
