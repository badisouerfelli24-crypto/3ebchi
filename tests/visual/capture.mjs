/* =========================================================================
   TEST-ONLY visual + network capture (run BEFORE and AFTER a change, then
   compare with tests/visual/compare.mjs).
   - Talks only to BASE_URL (a local `next start` wired to the local test DB).
   - Uses synthetic data/credentials passed through env (never real ones).
   Env:
     BASE_URL            e.g. http://localhost:3200
     OUT_DIR             output folder (screenshots + metrics.json)
     OWNER_ID/OWNER_SECRET, STAFF_ID/STAFF_SECRET   synthetic admin credentials
     TESTDB_PSQL         shell prefix to run SQL in the local test DB (for the
                         booking-conflict scenario), e.g. "tests/support/test-db.sh psql"
   ========================================================================= */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(execSync("npm root -g").toString().trim() + "/playwright");

const BASE = process.env.BASE_URL || "http://localhost:3200";
const OUT = process.env.OUT_DIR;
if (!OUT) throw new Error("OUT_DIR required");
fs.mkdirSync(OUT, { recursive: true });
const sql = (q) => execSync(`${process.env.TESTDB_PSQL} -tA -c ${JSON.stringify(q)}`, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();

function tunisDatePlus(days) {
  const now = new Date();
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + days, 12));
  return { iso: d.toISOString().slice(0, 10), short: `${d.getUTCDate()}/${d.getUTCMonth() + 1}` };
}

const metrics = {};
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

async function newPage(kind) {
  const vp = kind === "mob" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const ctx = await browser.newContext({ viewport: vp, isMobile: kind === "mob", hasTouch: kind === "mob", deviceScaleFactor: 1, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  // FREEZE=1: disable CSS animations/transitions (grain, drift, marquee…) so
  // BEFORE/AFTER screenshots are deterministic. Applied identically to both builds.
  if (process.env.FREEZE === "1") {
    await page.addInitScript(() => {
      const css = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
      const add = () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); };
      if (document.head) add(); else document.addEventListener("DOMContentLoaded", add);
    });
  }
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || /Content Security Policy|Refused to/.test(m.text())) errors.push("console: " + m.text());
  });
  return { ctx, page, errors };
}

async function scrollTo(page, y) {
  await page.evaluate((v) => (window.__lenis ? window.__lenis.scrollTo(v, { immediate: true }) : window.scrollTo(0, v)), y);
}

const ONLY = process.env.ONLY || "all";
for (const kind of (ONLY === "all" || ONLY === "ui" ? ["desk", "mob"] : [])) {
  /* ---------- A. initial load transfer (no scroll) ---------- */
  {
    const { ctx, page, errors } = await newPage(kind);
    const reqs = [];
    page.on("requestfinished", async (r) => {
      const s = await r.sizes().catch(() => null);
      reqs.push({ url: r.url(), bytes: s ? s.responseBodySize : 0 });
    });
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.waitForTimeout(8000);
    const frames = reqs.filter((r) => r.url.includes("/assets/sequence/"));
    metrics[`${kind}_initial`] = {
      requests: reqs.length,
      bytes: reqs.reduce((a, r) => a + r.bytes, 0),
      frameRequests: frames.length,
      frameBytes: frames.reduce((a, r) => a + r.bytes, 0),
      desktopFrames: frames.filter((r) => r.url.includes("/sequence/d/")).length,
      mobileFrames: frames.filter((r) => r.url.includes("/sequence/m/")).length,
      nextSlotsCalls: reqs.filter((r) => r.url.includes("/api/next-slots")).length,
    };
    await page.screenshot({ path: path.join(OUT, `${kind}-01-initial.png`) });

    /* ---------- B. scroll through the intro (forward, then reverse, then fast jump) ---------- */
    const H = await page.evaluate(() => document.getElementById("intro").offsetHeight - innerHeight);
    for (const [label, f] of [["30", 0.3], ["70", 0.7]]) {
      await scrollTo(page, Math.round(H * f));
      await page.waitForTimeout(3500);
      await page.screenshot({ path: path.join(OUT, `${kind}-02-intro-${label}.png`) });
    }
    // full forward pass then reverse, checking the canvas is never blank
    const blanks = [];
    for (let f = 0; f <= 1.0001; f += 0.05) {
      await scrollTo(page, Math.round(H * f));
      await page.waitForTimeout(120);
      blanks.push(await page.evaluate(() => {
        const c = document.querySelector(".cine-canvas");
        const x = c.getContext("2d").getImageData(c.width / 2, c.height / 3, 1, 1).data;
        return x[0] + x[1] + x[2];
      }));
    }
    await scrollTo(page, 0);
    await page.waitForTimeout(300);
    await scrollTo(page, Math.round(H * 0.95)); // fast jump
    await page.waitForTimeout(150);
    const afterJump = await page.evaluate(() => getComputedStyle(document.querySelector(".cine-canvas")).opacity);
    await page.waitForTimeout(6000);
    const allFrames = reqs.filter((r) => r.url.includes("/assets/sequence/"));
    metrics[`${kind}_fullscroll`] = {
      frameRequests: new Set(allFrames.map((r) => r.url)).size,
      frameBytes: allFrames.reduce((a, r) => a + r.bytes, 0),
      darkSamplesDuringScroll: blanks.filter((v) => v === 0).length,
      samples: blanks.length,
      canvasOpacityAfterJump: afterJump,
    };
    metrics[`${kind}_errors_home`] = errors.slice(0, 20);
    await ctx.close();
  }

  /* ---------- C. sections ---------- */
  {
    const { ctx, page, errors } = await newPage(kind);
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const total = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < total; y += 500) {
      await scrollTo(page, y);
      await page.waitForTimeout(40);
    }
    for (const [label, sel] of [["03-hero", "#top"], ["04-barbers", "#barbers"], ["05-prices", "#prix"]]) {
      const top = await page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top + scrollY, sel);
      await scrollTo(page, top - 70);
      await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(OUT, `${kind}-${label}.png`) });
    }

    /* ---------- D. booking flow (success) ---------- */
    const day = tunisDatePlus(2);
    const top = await page.evaluate(() => document.getElementById("booking").getBoundingClientRect().top + scrollY);
    await scrollTo(page, top - 70);
    await page.waitForTimeout(1200);
    const bk = page.locator("#booking");
    await bk.locator("button", { hasText: "ACHREF" }).first().click();
    await bk.locator("button", { hasText: "Hjema" }).first().click();
    await bk.locator("button", { hasText: day.short }).first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, `${kind}-06-slots.png`) });
    await bk.locator("button", { hasText: "12:00" }).first().click();
    await page.fill("#bk-name", "Visual Test");
    await page.fill("#bk-phone", "20 999 001");
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `${kind}-07-form.png`) });
    await bk.locator("button", { hasText: "Continuer" }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${kind}-08-confirm.png`) });
    await bk.locator("button", { hasText: "Confirmi l'réservation" }).click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, `${kind}-09-ticket.png`) });
    metrics[`${kind}_booking_ticket_visible`] = await page.locator("text=Visual Test").count();

    /* ---------- E. booking conflict presentation ---------- */
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(1200);
    const top2 = await page.evaluate(() => document.getElementById("booking").getBoundingClientRect().top + scrollY);
    await scrollTo(page, top2 - 70);
    await page.waitForTimeout(800);
    await bk.locator("button", { hasText: "ACHREF" }).first().click();
    await bk.locator("button", { hasText: "Hjema" }).first().click();
    await bk.locator("button", { hasText: day.short }).first().click();
    await page.waitForTimeout(1500);
    await bk.locator("button", { hasText: "12:30" }).first().click();
    await page.fill("#bk-name", "Visual Conflict");
    await page.fill("#bk-phone", "20 999 002");
    await bk.locator("button", { hasText: "Continuer" }).click();
    // someone else takes the slot meanwhile (direct SQL in the local test DB)
    sql(`insert into bookings (barber, service, price, duration_min, date, start_time, client_name, phone, status, ref) values ('achref','Hjema',8,30,'${day.iso}','12:30','Visual Other','21620999003','confirmed','3B-VISOT${kind === "mob" ? "M" : "D"}')`);
    await bk.locator("button", { hasText: "Confirmi l'réservation" }).click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, `${kind}-10-conflict.png`) });
    sql(`delete from bookings where client_name in ('Visual Test','Visual Conflict','Visual Other')`);
    metrics[`${kind}_errors_flow`] = errors.slice(0, 20);
    await ctx.close();
  }

  /* ---------- F. admin: login screen, owner and staff dashboards ---------- */
  {
    const { ctx, page, errors } = await newPage(kind);
    await page.goto(BASE + "/barber", { waitUntil: "load" });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `${kind}-11-login-pick.png`) });
    await page.locator("button", { hasText: "3EBCHI" }).first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${kind}-12-login-secret.png`) });
    for (const [label, id, secret] of [["13-owner", process.env.OWNER_ID, process.env.OWNER_SECRET], ["15-staff", process.env.STAFF_ID, process.env.STAFF_SECRET]]) {
      const r = await page.request.post(BASE + "/api/barber/login", { data: { barber: id, pin: secret, password: secret }, headers: { Origin: BASE } });
      metrics[`${kind}_login_${id}`] = r.status();
      await page.goto(BASE + "/barber", { waitUntil: "load" });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, `${kind}-${label}-dashboard.png`), fullPage: true });
      if (label === "13-owner") {
        await page.locator("button", { hasText: "Voir tous" }).first().click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, `${kind}-14-owner-all.png`), fullPage: true });
      }
      await page.request.post(BASE + "/api/barber/logout", { headers: { Origin: BASE } });
    }
    metrics[`${kind}_errors_admin`] = errors.slice(0, 20);
    await ctx.close();
  }
}

/* ---------- G. LIVE widget polling with a fake clock (desktop) ---------- */
if (ONLY === "all" || ONLY === "polling") {
  const { ctx, page } = await newPage("desk");
  // Count real fetch() calls made by the page (Playwright request events can
  // report a request more than once under the fake clock).
  await page.addInitScript(() => {
    window.__nsCalls = 0;
    const f = window.fetch;
    window.fetch = function (u) {
      if (String(u).includes("/api/next-slots")) window.__nsCalls++;
      return f.apply(this, arguments);
    };
  });
  let calls = 0;
  const sync = async () => (calls = await page.evaluate(() => window.__nsCalls));
  page.on("requestfinished", () => {});
  await page.clock.install();
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  // bring the LIVE widget into the viewport (it sits below the intro)
  const toWidget = () =>
    page.evaluate(() => {
      const el = document.querySelector(".live-card");
      const y = el.getBoundingClientRect().top + scrollY - 120;
      window.__lenis ? window.__lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y);
    });
  await toWidget();
  await page.waitForTimeout(800);
  await sync();
  const c0 = calls;
  for (let i = 0; i < 10; i++) { await page.clock.fastForward(60_000); await page.waitForTimeout(150); } // 10 visible minutes
  await page.waitForTimeout(500);
  await sync();
  const visible10 = calls - c0;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await sync();
  const c1 = calls;
  for (let i = 0; i < 30; i++) { await page.clock.fastForward(60_000); await page.waitForTimeout(100); } // 30 hidden minutes
  await page.waitForTimeout(500);
  await sync();
  const hidden30 = calls - c1;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await sync();
  const c2 = calls;
  for (let i = 0; i < 2; i++) { await page.clock.fastForward(60_000); await page.waitForTimeout(150); }
  await page.waitForTimeout(500);
  await sync();
  const afterVisible2 = calls - c2;
  // widget scrolled out of view (tab still visible) for 10 minutes, then back
  await page.evaluate(() => (window.__lenis ? window.__lenis.scrollTo(0, { immediate: true }) : window.scrollTo(0, 0)));
  await page.waitForTimeout(500);
  await sync();
  const c3 = calls;
  for (let i = 0; i < 10; i++) { await page.clock.fastForward(60_000); await page.waitForTimeout(100); }
  await sync();
  const offscreen10 = calls - c3;
  await toWidget();
  await page.waitForTimeout(800);
  await sync();
  metrics.live_polling = { initialCalls: c0, visible10min: visible10, hidden30min: hidden30, afterVisible2min: afterVisible2, offscreen10min: offscreen10, onReturnIntoView: calls - c3 - offscreen10 };
  await ctx.close();
}

const mfile = path.join(OUT, "metrics.json");
const prev = fs.existsSync(mfile) ? JSON.parse(fs.readFileSync(mfile, "utf8")) : {};
fs.writeFileSync(mfile, JSON.stringify({ ...prev, ...metrics }, null, 2));
console.log(JSON.stringify(metrics, null, 2));
await browser.close();
