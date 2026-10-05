"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { SITE } from "@/config/site";
import { labelDate } from "@/lib/time";

export type TicketData = {
  ref: string;
  name: string;
  hajem: string;
  hajemPhoto?: string;
  service: string;
  price: number;
  durationMin: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
};

/* ------------------------------------------------------------------------
   Dessin du ticket en PNG (Canvas 2D, aucune librairie externe).
   1080 x 1620 px — format "story" lisible sur téléphone.
   ------------------------------------------------------------------------ */
const W = 1080;
const H = 1620;

function cssFont(varName: string, fallback: string) {
  const v = getComputedStyle(document.body).getPropertyValue(varName).trim();
  return v || fallback;
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new window.Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function renderTicketPng(t: TicketData): Promise<Blob> {
  const display = cssFont("--font-display", "system-ui, sans-serif");
  const mono = cssFont("--font-mono", "ui-monospace, monospace");
  try {
    await Promise.all([
      document.fonts.load(`900 80px ${display}`),
      document.fonts.load(`800 40px ${display}`),
      document.fonts.load(`500 30px ${mono}`),
    ]);
  } catch {}

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;

  // Fond + halos
  ctx.fillStyle = "#0a0a0b";
  ctx.fillRect(0, 0, W, H);
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(10,10,11,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  glow(W - 80, 120, 700, "rgba(167,139,250,0.35)");
  glow(80, H - 200, 650, "rgba(255,59,59,0.18)");
  glow(W / 2, H / 2, 600, "rgba(34,211,238,0.08)");

  // Carte
  const cx = 70, cy = 90, cw = W - 140, ch = H - 180;
  roundRect(ctx, cx, cy, cw, ch, 48);
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.stroke();

  // Bande barber-pole à gauche
  ctx.save();
  roundRect(ctx, cx, cy, 26, ch, 0);
  ctx.clip();
  const stripes = ["#ff3b3b", "#f5f5f4", "#1d4ed8", "#f5f5f4"];
  for (let i = -40; i < ch / 22 + 40; i++) {
    ctx.fillStyle = stripes[((i % 4) + 4) % 4];
    ctx.beginPath();
    const y = cy + i * 22;
    ctx.moveTo(cx, y);
    ctx.lineTo(cx + 26, y - 26);
    ctx.lineTo(cx + 26, y - 4);
    ctx.lineTo(cx, y + 22);
    ctx.fill();
  }
  ctx.restore();

  const L = cx + 80; // marge gauche du contenu
  const R = cx + cw - 60;

  // En-tête
  ctx.fillStyle = "#f5f5f4";
  ctx.font = `900 54px ${display}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("3EBCHI STYLE", L, cy + 110);
  const brandW = ctx.measureText("3EBCHI STYLE").width;
  ctx.fillStyle = "#22d3ee";
  ctx.fillText(".", L + brandW + 4, cy + 110);
  ctx.font = `500 26px ${mono}`;
  ctx.fillStyle = "#22d3ee";
  ctx.fillText("// TICKET DE RÉSERVATION", L, cy + 160);

  // Grand numéro (aberration chromatique)
  ctx.font = `900 118px ${display}`;
  const refY = cy + 330;
  ctx.fillStyle = "rgba(34,211,238,0.6)";
  ctx.fillText(t.ref, L - 4, refY);
  ctx.fillStyle = "rgba(244,114,182,0.6)";
  ctx.fillText(t.ref, L + 4, refY);
  ctx.fillStyle = "#f5f5f4";
  ctx.fillText(t.ref, L, refY);
  ctx.font = `500 24px ${mono}`;
  ctx.fillStyle = "#a1a1aa";
  ctx.fillText("NUMÉRO DE RÉSERVATION", L, refY + 50);

  // Ligne perforée
  const perfY = cy + 470;
  ctx.setLineDash([14, 14]);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.moveTo(cx + 40, perfY);
  ctx.lineTo(cx + cw - 40, perfY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#0a0a0b";
  ctx.beginPath();
  ctx.arc(cx, perfY, 30, 0, Math.PI * 2);
  ctx.arc(cx + cw, perfY, 30, 0, Math.PI * 2);
  ctx.fill();

  // Hajem (photo ronde + nom)
  const photo = t.hajemPhoto ? await loadImg(t.hajemPhoto) : null;
  const py = perfY + 70;
  if (photo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(L + 70, py + 70, 70, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(photo, L, py, 140, 140);
    ctx.restore();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#22d3ee";
    ctx.beginPath();
    ctx.arc(L + 70, py + 70, 72, 0, Math.PI * 2);
    ctx.stroke();
  }
  const tx = photo ? L + 180 : L;
  ctx.font = `500 24px ${mono}`;
  ctx.fillStyle = "#a1a1aa";
  ctx.fillText("HAJEM", tx, py + 50);
  ctx.font = `900 72px ${display}`;
  ctx.fillStyle = "#f5f5f4";
  ctx.fillText(t.hajem, tx, py + 125);

  // Lignes d'infos
  const rows: [string, string][] = [
    ["ESMEK", t.name],
    ["SERVICE", `${t.service} · ${t.durationMin} min`],
    ["NHAR", labelDate(t.date)],
    ["WA9T", t.time],
    ["PRIX", `${t.price} DT`],
  ];
  let ry = py + 240;
  for (const [k, v] of rows) {
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(L, ry - 58);
    ctx.lineTo(R, ry - 58);
    ctx.stroke();
    ctx.font = `500 24px ${mono}`;
    ctx.fillStyle = "#a1a1aa";
    ctx.fillText(k, L, ry);
    ctx.font = `800 ${k === "WA9T" ? 64 : 42}px ${display}`;
    ctx.fillStyle = k === "WA9T" ? "#22d3ee" : "#f5f5f4";
    const tw = ctx.measureText(v).width;
    ctx.fillText(v, Math.max(L + 220, R - tw), ry + (k === "WA9T" ? 8 : 2));
    ry += 118;
  }

  // Pied
  ctx.font = `500 24px ${mono}`;
  ctx.fillStyle = "#a1a1aa";
  ctx.fillText("Werri l'ticket hedha fel salon 💈", L, cy + ch - 110);
  ctx.fillStyle = "#71717a";
  ctx.fillText(`${SITE.city} · #3EBCHI_STYLE`, L, cy + ch - 66);

  return new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
}

/* ------------------------------------------------------------------------
   Carte affichée à l'écran + un seul gros bouton (sticky) pour enregistrer
   le ticket en IMAGE. Sur téléphone, on passe par la feuille de partage
   (« Enregistrer l'image » -> Photos) ; sinon, téléchargement du PNG.
   ------------------------------------------------------------------------ */
export default function Ticket({ t }: { t: TicketData }) {
  const [busy, setBusy] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const fileName = `3ebchi-ticket-${t.ref}.png`;

  useEffect(() => {
    try {
      const f = new File([new Blob()], "x.png", { type: "image/png" });
      // Feuille de partage uniquement sur écran tactile (Photos sur iPhone / Android).
      setCanShare(!!navigator.canShare?.({ files: [f] }) && matchMedia("(pointer: coarse)").matches);
    } catch {}
  }, []);

  async function saveImage() {
    setBusy(true);
    try {
      const blob = await renderTicketPng(t);
      if (canShare) {
        try {
          await navigator.share({ files: [new File([blob], fileName, { type: "image/png" })], title: "Ticket 3ebchi style" });
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return; // partage annulé
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="ticket-in relative overflow-hidden rounded-[28px] border border-white/12 bg-white/[0.045]">
        {/* bande barber-pole */}
        <div className="pole absolute inset-y-0 left-0 w-2.5 !rounded-none !shadow-none" aria-hidden />

        <div className="px-7 pb-6 pt-7 pl-9">
          <div className="flex items-center justify-between">
            <div className="font-display text-lg font-black">
              3EBCHI STYLE<span className="text-cyan">.</span>
            </div>
            <span className="rounded-full border border-cyan/40 bg-cyan/10 px-2.5 py-1 font-mono text-[10px] tracking-[0.15em] text-cyan">
              CONFIRMÉ ✓
            </span>
          </div>
          <div className="mt-6 font-mono text-[11px] tracking-[0.2em] text-muted">NUMÉRO DE RÉSERVATION</div>
          <div className="display chroma mt-2 select-all text-5xl sm:text-6xl">{t.ref}</div>
        </div>

        {/* perforation */}
        <div className="relative h-0 border-t-2 border-dashed border-white/15" aria-hidden>
          <span className="absolute -left-4 -top-4 h-8 w-8 rounded-full bg-bg" />
          <span className="absolute -right-4 -top-4 h-8 w-8 rounded-full bg-bg" />
        </div>

        <div className="px-7 pb-7 pt-6 pl-9">
          <div className="flex items-center gap-4">
            {t.hajemPhoto && (
              <Image src={t.hajemPhoto} alt="" width={64} height={64} className="h-16 w-16 rounded-full border-2 border-cyan object-cover" />
            )}
            <div>
              <div className="font-mono text-[11px] tracking-[0.2em] text-muted">HAJEM</div>
              <div className="display text-3xl">{t.hajem}</div>
            </div>
          </div>

          <dl className="mt-5 divide-y divide-line">
            <TRow k="Esmek" v={t.name} />
            <TRow k="Service" v={`${t.service} · ${t.durationMin} min`} />
            <TRow k="Nhar" v={labelDate(t.date)} />
            <TRow k="Wa9t" v={t.time} big />
            <TRow k="Prix" v={`${t.price} DT`} />
          </dl>

          <p className="mt-5 font-mono text-xs text-muted">Werri l&apos;ticket hedha fel salon 💈</p>
        </div>
      </div>

      {/* Bouton sticky : reste visible en bas de l'écran tant que le ticket est là. */}
      <div className="sticky bottom-3 z-30 mt-5 pb-[env(safe-area-inset-bottom)]">
        <button
          onClick={saveImage}
          disabled={busy}
          className="btn btn-primary min-h-[72px] w-full flex-col !gap-1 !rounded-3xl !px-5 !py-4 text-center text-lg leading-tight shadow-2xl disabled:opacity-60 sm:text-xl"
        >
          {busy ? (
            "…"
          ) : (
            <>
              <span>⬇ Maghir matsob el coupon, el réservation mte3ek mahech confirmé</span>
              <span className="text-[12px] font-semibold opacity-60">Télécharger en image (PNG)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function TRow({ k, v, big }: { k: string; v: string; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">{k}</dt>
      <dd className={`text-right font-display font-extrabold ${big ? "text-3xl text-cyan" : "text-base"}`}>{v}</dd>
    </div>
  );
}
