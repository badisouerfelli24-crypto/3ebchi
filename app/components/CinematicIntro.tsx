"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { BARBERS } from "@/config/site";

/* Séquence silencieuse (34 s @ 12 i/s) découpée en images dans
   public/assets/sequence/{d,m}/0001.webp… — d = 16:9 desktop, m = 4:3 mobile. */
const FRAMES = 408;
const FPS = 12;

/* Chapitres de la séquence (en secondes). Chaque chapitre reçoit la même
   longueur de scroll, même si les clips n'ont pas la même durée. */
const CHAPTERS = [
  { id: "intro", t0: 0, t1: 4.65 },
  { id: "3ebchi", t0: 4.65, t1: 12.35 },
  { id: "achref", t0: 12.35, t1: 20.25 },
  { id: "brag", t0: 20.25, t1: 24.35 },
  { id: "imed", t0: 24.35, t1: 34 },
] as const;
const N = CHAPTERS.length;
const HOLD = 0.78; // part du chapitre où le panneau reste en place avant de glisser

const smooth = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function frameUrl(set: "d" | "m", i: number) {
  return `/assets/sequence/${set}/${String(i + 1).padStart(4, "0")}.webp`;
}

export default function CinematicIntro() {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const bar = useRef<HTMLDivElement>(null);
  const ticks = useRef<(HTMLSpanElement | null)[]>([]);
  const hint = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = root.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    const set = desktop ? "d" : "m";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---------- chargement progressif des images ----------
       Premier affichage : les 18 premières images (début du chapitre 1) + une
       image-clé toutes les 24 (≈ 35 images) pour que n'importe quelle position
       ait immédiatement une image proche à afficher. Dès que le visiteur fait
       défiler l'intro : on charge une fenêtre autour de la position courante
       (72 images devant dans le sens du défilement, 24 derrière), 6 au plus en
       parallèle ; les téléchargements devenus lointains (saut rapide) sont
       annulés. Toutes les images restent atteignables ; un visiteur qui ne fait
       pas défiler ne télécharge plus les 408 images. */
    const imgs: (HTMLImageElement | null)[] = new Array(FRAMES).fill(null);
    const status = new Uint8Array(FRAMES); // 0 à charger, 1 en cours, 2 ok, 3 échec définitif
    const fails = new Uint8Array(FRAMES);
    const inflight = new Map<number, HTMLImageElement>();
    let alive = true;
    let current = 0;
    let zoom = 1;
    let engaged = false;
    let dir = 1;
    const INITIAL_HEAD = 18;
    const KEYSTEP = 24;
    const AHEAD = 72;
    const BEHIND = 24;
    const MAX_PARALLEL = 6;

    function wanted(): number {
      if (status[current] === 0) return current;
      if (!engaged) {
        for (let i = 0; i < INITIAL_HEAD; i++) if (status[i] === 0) return i;
      }
      for (let i = 0; i < FRAMES; i += KEYSTEP) if (status[i] === 0) return i;
      if (!engaged) return -1;
      for (let d = 1; d <= AHEAD; d++) {
        const a = current + dir * d;
        if (a >= 0 && a < FRAMES && status[a] === 0) return a;
        const b = current - dir * d;
        if (d <= BEHIND && b >= 0 && b < FRAMES && status[b] === 0) return b;
      }
      return -1;
    }

    function inWindow(i: number) {
      if (i % KEYSTEP === 0) return true;
      if (!engaged) return i < INITIAL_HEAD;
      const off = (i - current) * dir;
      return off >= -BEHIND && off <= AHEAD;
    }

    function pump() {
      if (!alive) return;
      // annule ce qui n'est plus utile après un saut rapide
      for (const [i, im] of inflight) {
        if (!inWindow(i)) {
          im.onload = im.onerror = null;
          im.src = "";
          inflight.delete(i);
          status[i] = 0;
        }
      }
      while (inflight.size < MAX_PARALLEL) {
        const i = wanted();
        if (i < 0) break;
        start(i);
      }
    }

    function start(i: number) {
      status[i] = 1;
      const im = new Image();
      im.decoding = "async";
      inflight.set(i, im);
      im.onload = () => {
        if (!alive) return;
        inflight.delete(i);
        status[i] = 2;
        imgs[i] = im;
        if (i === 0 || Math.abs(i - current) < KEYSTEP) draw();
        pump();
      };
      im.onerror = () => {
        if (!alive) return;
        inflight.delete(i);
        fails[i]++;
        status[i] = fails[i] >= 2 ? 3 : 0; // une nouvelle tentative, puis l'image voisine sert
        pump();
      };
      im.src = frameUrl(set, i);
    }

    function setCurrent(i: number) {
      if (i === current) return;
      dir = i > current ? 1 : -1;
      current = i;
      if (!engaged && i > 0) engaged = true;
      pump();
    }
    pump();

    function nearest(i: number) {
      for (let d = 0; d < FRAMES; d++) {
        if (imgs[i - d]) return imgs[i - d];
        if (imgs[i + d]) return imgs[i + d];
      }
      return null;
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(cv.clientWidth * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);
      draw();
    }

    function draw() {
      const im = nearest(current);
      const W = cv.width;
      const H = cv.height;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      if (!im) return;
      cv.classList.add("ready"); // fondu d'entrée dès la première image
      // desktop : "cover" plein écran ; mobile : "contain" (le cadre est déjà en 4:3)
      const s = desktop ? Math.max(W / im.width, H / im.height) : Math.min(W / im.width, H / im.height);
      const bw = im.width * s;
      const bh = im.height * s;
      const bx = (W - bw) / 2;
      const by = (H - bh) / 2;
      // le zoom numérique se fait vers le haut du cadre, là où passent les ciseaux
      const ox = W / 2;
      const oy = by + bh * 0.12;
      ctx.drawImage(im, ox + (bx - ox) * zoom, oy + (by - oy) * zoom, bw * zoom, bh * zoom);
    }

    /* ---------- progression ---------- */
    function render(p: number) {
      const c = clamp01(p) * N;
      const i = Math.min(N - 1, Math.floor(c));
      const l = c - i;
      const ch = CHAPTERS[i];
      setCurrent(Math.min(FRAMES - 1, Math.round((ch.t0 + l * (ch.t1 - ch.t0)) * FPS)));

      // zoom numérique sur les passages de ciseaux (fin d'un chapitre → début du suivant)
      let z = 0;
      if (i < N - 1 && l > HOLD) z = smooth((l - HOLD) / (1 - HOLD));
      else if (i > 0 && l < 0.14) z = 1 - smooth(l / 0.14);
      zoom = 1 + (reduce ? 0 : 0.22) * z;
      draw();

      // position des panneaux : ils restent en place, puis glissent pendant le passage
      const pos = i + (l > HOLD && i < N - 1 ? smooth((l - HOLD) / (1 - HOLD)) : 0);
      panels.current.forEach((pn, k) => {
        if (!pn) return;
        const d = k - pos; // 0 = panneau actif
        const o = clamp01(1 - Math.abs(d) * 1.6);
        pn.style.opacity = String(o);
        pn.style.visibility = o < 0.02 ? "hidden" : "visible";
        pn.style.transform = desktop ? `translate3d(${d * 70}vw,0,0)` : `translate3d(0,${d * 18}vh,0)`;
        pn.style.pointerEvents = Math.abs(d) < 0.3 ? "auto" : "none";
      });
      if (bar.current) bar.current.style.transform = `scaleX(${clamp01(p)})`;
      ticks.current.forEach((t, k) => t?.classList.toggle("on", Math.round(pos) === k));
      if (hint.current) hint.current.style.opacity = String(clamp01(1 - p * 14));
    }

    /* ---------- Lenis + ScrollTrigger ---------- */
    let lenis: Lenis | null = null;
    const tick = (t: number) => lenis?.raf(t * 1000);
    if (!reduce) {
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
    }

    const st = ScrollTrigger.create({
      trigger: el,
      start: "top top",
      end: "bottom bottom",
      scrub: reduce ? true : 0.4,
      onUpdate: (self) => render(self.progress),
    });

    resize();
    render(0);
    window.addEventListener("resize", resize);

    return () => {
      alive = false;
      for (const im of inflight.values()) {
        im.onload = im.onerror = null;
        im.src = "";
      }
      inflight.clear();
      window.removeEventListener("resize", resize);
      st.kill();
      if (lenis) {
        gsap.ticker.remove(tick);
        lenis.destroy();
        delete (window as unknown as { __lenis?: Lenis }).__lenis;
      }
    };
  }, []);

  function book(id: string) {
    window.dispatchEvent(new CustomEvent("select-barber", { detail: id }));
    const lenis = (window as unknown as { __lenis?: Lenis }).__lenis;
    const target = document.getElementById("booking");
    if (!target) return;
    if (lenis) lenis.scrollTo(target, { duration: 1.6 });
    else target.scrollIntoView({ behavior: "smooth" });
  }

  function skip() {
    const lenis = (window as unknown as { __lenis?: Lenis }).__lenis;
    const top = document.getElementById("top");
    if (!top) return;
    if (lenis) lenis.scrollTo(top, { duration: 1.4 });
    else top.scrollIntoView({ behavior: "smooth" });
  }

  const hajema = CHAPTERS.slice(1).map((c) => BARBERS.find((b) => b.id === c.id)!);

  return (
    <section ref={root} id="intro" className="cine" aria-label="3ebchi style — intro">
      <div className="cine-stage">
        <canvas ref={canvas} className="cine-canvas" aria-hidden />
        <div className="cine-vignette" aria-hidden />

        {/* Chapitre 0 : la marque */}
        <div ref={(n) => { panels.current[0] = n; }} className="cine-panel cine-panel--intro">
          <p className="font-mono text-[11px] tracking-[0.3em] text-cyan">BARBERSHOP · TUNIS</p>
          <p className="display mt-3 text-[15vw] leading-[0.85] md:text-[8.5vw]">
            3EBCHI
            <br />
            <span className="outline-text">STYLE</span> 💈
          </p>
          <p className="mt-4 max-w-sm text-sm text-fg/70 md:text-base">Coupe propre, style 3ebchi. Scrolli w 3aref l&apos;équipe.</p>
        </div>

        {/* Chapitres 1-4 : un hajem chacun */}
        {hajema.map((b, k) => (
          <div key={b.id} ref={(n) => { panels.current[k + 1] = n; }} className="cine-panel cine-panel--hajem">
            <p className="font-mono text-[11px] tracking-[0.3em] text-cyan">
              0{k + 1} / 04 · HAJEM{b.isOwner ? " · FOUNDER" : ""}
            </p>
            <h2 className="display mt-2 text-[13vw] leading-[0.85] md:text-[6.5vw]">{b.name}</h2>
            <p className="mt-2 text-sm text-fg/70 md:text-base">{b.tagline}</p>
            <button type="button" onClick={() => book(b.id)} className="cine-cta">
              <span>
                Réservi m3a <b>{b.name}</b>
              </span>
              <span aria-hidden className="cine-cta-arrow">→</span>
            </button>
          </div>
        ))}

        {/* progression horizontale (desktop) + noms */}
        <div className="cine-progress" aria-hidden>
          <div className="cine-ticks">
            {["3EBCHI", ...hajema.map((b) => b.name)].map((n, k) => (
              <span key={n} ref={(t) => { ticks.current[k] = t; }}>{k === 0 ? "INTRO" : n}</span>
            ))}
          </div>
          <div className="cine-track">
            <div ref={bar} className="cine-bar" />
          </div>
        </div>

        <div ref={hint} className="cine-hint" aria-hidden>
          <span className="cine-hint-line" />
          scroll
        </div>
        <button type="button" onClick={skip} className="cine-skip">
          Skip ↓
        </button>
      </div>
    </section>
  );
}
