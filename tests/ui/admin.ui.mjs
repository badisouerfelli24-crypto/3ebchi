/* =========================================================================
   TEST-ONLY: real browser checks of the admin login screen and dashboard
   (Playwright + Chromium) against a LOCAL `next start` wired to the
   disposable test database. Synthetic passwords only (passed through env).
     BASE_URL=http://localhost:3201 TESTDB_DIR=... TESTDB_NAME=app_test \
     OWNER_PW=... STAFF_PW=... BRAG_PW=... IMED_PW=... OUT_DIR=... node tests/ui/admin.ui.mjs
   Exit code 0 = every check passed.
   ========================================================================= */
import { createRequire } from "node:module";
import { execSync, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(execSync("npm root -g").toString().trim() + "/playwright");
const BASE = process.env.BASE_URL || "http://localhost:3201";
const OUT = process.env.OUT_DIR || "";
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const COOKIE = "__Host-3ebchi_admin";
const PW = { "3ebchi": process.env.OWNER_PW, achref: process.env.STAFF_PW, brag: process.env.BRAG_PW, imed: process.env.IMED_PW };
const NAMES = { "3ebchi": "3EBCHI", achref: "ACHREF", brag: "BRAG", imed: "BAFFI" };
for (const [k, v] of Object.entries(PW)) if (!v) throw new Error(`password for ${k} missing in env`);
const sql = (s) =>
  execFileSync("psql", ["-X", "-q", "-tA", "-h", process.env.TESTDB_DIR, "-p", "55432", "-U", "postgres", "-d", process.env.TESTDB_NAME || "app_test", "-v", "ON_ERROR_STOP=1", "-c", s]).toString().trim();
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + " :: " + (e && e.message ? e.message.split("\n")[0] : e)]);
  }
}

// synthetic fixtures (removed at the end)
sql("delete from rate_limits");
const day = sql("select ((now() at time zone 'Africa/Tunis')::date + 3)::text");
sql(`delete from bookings where client_name like 'Synthetic UI%'; delete from blocked_slots where reason like 'synthetic ui%'`);
sql(`insert into bookings (barber, service, price, duration_min, date, start_time, client_name, phone, status, ref) values
  ('achref','Hjema',8,30,'${day}','09:00','Synthetic UI Achref','21620000501','confirmed','3B-UIACH1'),
  ('brag','Hjema',8,30,'${day}','09:00','Synthetic UI Brag','21620000502','confirmed','3B-UIBRG1')`);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

async function openLogin(kind, id) {
  const vp = kind === "mob" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const ctx = await browser.newContext({ viewport: vp, isMobile: kind === "mob", hasTouch: kind === "mob", deviceScaleFactor: 1 });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => /Content Security Policy|Refused to/.test(m.text()) && errors.push(m.text()));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE + "/barber", { waitUntil: "load" });
  await page.locator("button", { hasText: NAMES[id] }).first().click();
  return { ctx, page, errors };
}
async function typeAndSubmit(page, pw, how = "fill") {
  const input = page.getByLabel("Mot de passe (15 caractères minimum)");
  if (how === "paste") {
    await page.evaluate((t) => navigator.clipboard.writeText(t), pw);
    await input.focus();
    await page.keyboard.press("Control+V");
  } else {
    await input.fill(pw);
  }
  await input.press("Enter");
}
const cookieOf = async (ctx) => (await ctx.cookies()).find((c) => c.name === COOKIE);

for (const kind of ["desk", "mob"]) {
  await check(`${kind}: login screen is a masked, password-manager friendly field; short input keeps the button disabled`, async () => {
    const { ctx, page } = await openLogin(kind, "3ebchi");
    const input = page.getByLabel("Mot de passe (15 caractères minimum)");
    assert.equal(await input.getAttribute("type"), "password");
    assert.equal(await input.getAttribute("autocomplete"), "current-password");
    assert.equal(await input.getAttribute("inputmode"), null, "no numeric keypad");
    assert.equal(await input.getAttribute("maxlength"), null, "no length truncation");
    assert.equal(await page.locator('input[autocomplete="username"]').inputValue(), "3ebchi");
    const btn = page.locator("button", { hasText: "Daxel" });
    assert.equal(await btn.isDisabled(), true, "empty");
    await input.fill("letters and 123"); // 15 chars incl. letters/spaces accepted by the field
    assert.equal(await input.inputValue(), "letters and 123");
    await input.fill("fourteen chars");
    assert.equal(await btn.isDisabled(), true, "14 chars");
    if (OUT) await page.screenshot({ path: path.join(OUT, `${kind}-login-password.png`) });
    await ctx.close();
  });

  await check(`${kind}: wrong password => generic message, no cookie; empty => nothing sent`, async () => {
    const { ctx, page } = await openLogin(kind, "achref");
    let posts = 0;
    page.on("request", (r) => r.url().endsWith("/api/barber/login") && posts++);
    await page.getByLabel("Mot de passe (15 caractères minimum)").press("Enter");
    await page.waitForTimeout(300);
    assert.equal(posts, 0);
    await typeAndSubmit(page, "synthetic but wrong phrase 00");
    await page.getByText("Mot de passe ghalet").waitFor({ timeout: 8000 });
    assert.equal(await cookieOf(ctx), undefined);
    assert.equal(await page.getByLabel("Mot de passe (15 caractères minimum)").inputValue(), "", "field cleared");
    if (OUT) await page.screenshot({ path: path.join(OUT, `${kind}-login-wrong.png`) });
    await ctx.close();
  });
}

// The dashboard (app/barber/dash) calls the API from the browser with the session
// cookie: run those same calls from the logged-in page so cookies/Origin are real.
const apiFromPage = (page, url, init = {}) =>
  page.evaluate(
    async ([u, i]) => {
      const r = await fetch(u, { ...i, headers: i.body ? { "Content-Type": "application/json" } : undefined });
      let j = null;
      try { j = await r.json(); } catch {}
      return { status: r.status, json: j };
    },
    [url, init]
  );
async function loginThroughScreen(kind, id) {
  sql("delete from rate_limits");
  const o = await openLogin(kind, id);
  await typeAndSubmit(o.page, PW[id], "paste");
  await o.page.waitForResponse((r) => r.url().endsWith("/api/barber/me") && r.status() === 200, { timeout: 10000 });
  await o.page.getByText(`Ahla ${NAMES[id]}`).first().waitFor({ state: "attached", timeout: 10000 }); // dashboard header (both layouts)
  return o;
}

for (const id of ["3ebchi", "achref", "brag", "imed"]) {
  await check(`${id}: logs in through the screen (pasted password) and reaches the new dashboard with the right role`, async () => {
    const { ctx, page, errors } = await loginThroughScreen(id === "3ebchi" ? "desk" : "mob", id);
    const c = await cookieOf(ctx);
    assert.ok(c && c.httpOnly && c.secure && c.sameSite === "Strict");
    const me = await apiFromPage(page, "/api/barber/me");
    assert.equal(me.json.me.id, id);
    assert.equal(me.json.me.isOwner, id === "3ebchi");
    const shop = await apiFromPage(page, "/api/barber/stats?scope=shop");
    assert.equal(shop.status, id === "3ebchi" ? 200 : 403, "shop scope is owner-only");
    const own = await apiFromPage(page, `/api/barber/agenda?scope=${id}`);
    assert.equal(own.status, 200);
    if (id !== "3ebchi") {
      const other = await apiFromPage(page, `/api/barber/agenda?scope=${id === "brag" ? "achref" : "brag"}`);
      assert.equal(other.status, 403, "staff cannot read another barber's agenda");
    }
    const names = JSON.stringify(own.json);
    if (id === "achref") assert.ok(names.includes("Synthetic UI Achref") && !names.includes("Synthetic UI Brag"));
    if (id === "brag") assert.ok(names.includes("Synthetic UI Brag") && !names.includes("Synthetic UI Achref"));
    assert.deepEqual(errors, []);
    if (OUT) await page.screenshot({ path: path.join(OUT, `ui-dashboard-${id}.png`), fullPage: true });
    await ctx.close();
  });
}

await check("staff actions through the dashboard API: block create + delete, cancel own booking; cannot touch another barber's booking", async () => {
  const { ctx, page } = await loginThroughScreen("mob", "achref");
  const day = sql("select ((now() at time zone 'Africa/Tunis')::date + 4)::text");
  const d = sql(`select extract(dow from date '${day}')`) === "1" ? sql("select ((now() at time zone 'Africa/Tunis')::date + 5)::text") : day;
  const b = await apiFromPage(page, "/api/barber/block", { method: "POST", body: JSON.stringify({ date: d, fullDay: false, start_time: "15:00", end_time: "16:00", reason: "synthetic ui block" }) });
  assert.equal(b.status, 200, JSON.stringify(b.json));
  const id = sql("select id from blocked_slots where reason='synthetic ui block' and barber='achref'");
  assert.ok(id);
  const del = await apiFromPage(page, `/api/barber/block?id=${id}`, { method: "DELETE" });
  assert.equal(del.status, 200);
  assert.equal(sql("select count(*) from blocked_slots where reason='synthetic ui block'"), "0");
  const own = sql("select id from bookings where ref='3B-UIACH1'");
  const other = sql("select id from bookings where ref='3B-UIBRG1'");
  assert.equal((await apiFromPage(page, "/api/barber/outcome", { method: "POST", body: JSON.stringify({ id: other, outcome: "cancelled" }) })).status, 403);
  assert.equal(sql("select status from bookings where ref='3B-UIBRG1'"), "confirmed");
  assert.equal((await apiFromPage(page, "/api/barber/outcome", { method: "POST", body: JSON.stringify({ id: own, outcome: "cancelled" }) })).status, 200);
  assert.equal(sql("select status from bookings where ref='3B-UIACH1'"), "cancelled");
  sql("update bookings set status='confirmed', outcome_at=null where ref='3B-UIACH1'");
  await ctx.close();
});

await check("owner: shop-wide stats/agenda, cancels another barber's booking", async () => {
  const { ctx, page } = await loginThroughScreen("desk", "3ebchi");
  const ag = await apiFromPage(page, "/api/barber/agenda?scope=shop");
  assert.equal(ag.status, 200);
  assert.ok(JSON.stringify(ag.json).includes("Synthetic UI Brag"));
  const other = sql("select id from bookings where ref='3B-UIBRG1'");
  assert.equal((await apiFromPage(page, "/api/barber/outcome", { method: "POST", body: JSON.stringify({ id: other, outcome: "cancelled" }) })).status, 200);
  assert.equal(sql("select status from bookings where ref='3B-UIBRG1'"), "cancelled");
  if (OUT) await page.screenshot({ path: path.join(OUT, "ui-owner-dashboard.png"), fullPage: true });
  await ctx.close();
});

await check("logout revokes the session; replaying the old cookie is refused", async () => {
  const { ctx, page } = await loginThroughScreen("mob", "brag");
  const old = (await cookieOf(ctx)).value;
  assert.equal((await apiFromPage(page, "/api/barber/logout", { method: "POST" })).status, 200);
  const r = await fetch(BASE + "/api/barber/me", { headers: { cookie: `${COOKIE}=${old}` } });
  assert.equal(r.status, 401);
  await ctx.close();
});

await check("server-side revocation and disabled account take effect immediately", async () => {
  const { ctx, page } = await loginThroughScreen("mob", "achref");
  sql("select public.admin_sessions_revoke_all('achref')");
  assert.equal((await apiFromPage(page, "/api/barber/me")).status, 401);
  const own = sql("select id from bookings where ref='3B-UIACH1'");
  assert.equal((await apiFromPage(page, "/api/barber/outcome", { method: "POST", body: JSON.stringify({ id: own, outcome: "cancelled" }) })).status, 401);
  assert.equal(sql("select status from bookings where ref='3B-UIACH1'"), "confirmed");
  await ctx.close();
  sql("update barbers set active=false where id='imed'");
  try {
    const o = await openLogin("mob", "imed");
    await typeAndSubmit(o.page, PW.imed);
    await o.page.getByText("Mot de passe ghalet").waitFor({ timeout: 8000 });
    await o.ctx.close();
  } finally {
    sql("update barbers set active=true where id='imed'");
  }
});

await check("privacy page and booking-step link render with the site styles, no CSP errors", async () => {
  for (const kind of ["desk", "mob"]) {
    const vp = kind === "mob" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => (m.type() === "error" || /Content Security Policy/.test(m.text())) && errors.push(m.text()));
    const res = await page.goto(BASE + "/confidentialite", { waitUntil: "load" });
    assert.equal(res.status(), 200);
    await page.getByText("Ce qu'on enregistre").waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, "no horizontal scroll");
    if (OUT) await page.screenshot({ path: path.join(OUT, `${kind}-privacy.png`), fullPage: true });
    await page.goto(BASE + "/", { waitUntil: "load" });
    const footerLink = page.locator("footer a", { hasText: "Confidentialité" });
    assert.equal(await footerLink.count(), 1);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

sql(`delete from bookings where client_name like 'Synthetic UI%'; delete from blocked_slots where reason like 'synthetic ui%'; delete from rate_limits`);
await browser.close();
for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
