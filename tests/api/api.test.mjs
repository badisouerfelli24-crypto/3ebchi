/* =========================================================================
   API-level tests through the REAL Next.js route handlers.
   Setup (all local, synthetic):
     - disposable Postgres (tests/support/test-db.sh) with baseline + migrations,
       synthetic passwords provisioned with scripts/set-password.ts
     - tests/support/pgrest-shim.mjs on 127.0.0.1:54321 (SHIM pid in SHIM_PID)
     - TWO `next start` instances (APP_A, APP_B) sharing that DB, started with
       TRUST_PROXY_HEADERS=1 so the test can simulate client addresses the way
       Vercel provides them.
   Env: APP_A, APP_B, TESTDB_DIR, TESTDB_NAME, OWNER_PW, STAFF_PW, SHIM_PID
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFileSync } from "node:child_process";

const A = process.env.APP_A || "http://localhost:3201";
const B = process.env.APP_B || "http://localhost:3202";
const OWNER_PW = process.env.OWNER_PW;
const STAFF_PW = process.env.STAFF_PW;
// `next start` runs with NODE_ENV=production => hardened cookie name (Secure, __Host- prefix)
const COOKIE = process.env.SESSION_COOKIE_NAME || "__Host-3ebchi_admin";
const sql = (s) =>
  execFileSync("psql", ["-X", "-q", "-tA", "-h", process.env.TESTDB_DIR, "-p", "55432", "-U", "postgres", "-d", process.env.TESTDB_NAME || "app_test", "-v", "ON_ERROR_STOP=1", "-c", s])
    .toString()
    .trim();
let ipSeq = 10;
const nextIp = () => `198.51.100.${ipSeq++ % 250}`;

async function call(base, path, { method = "GET", body, cookie, ip = nextIp(), origin = base, headers = {} } = {}) {
  const h = { "x-forwarded-for": ip, ...headers };
  if (origin) h.origin = origin;
  if (body !== undefined) h["content-type"] ??= "application/json";
  if (cookie) h.cookie = `${COOKIE}=${cookie}`;
  const res = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body), redirect: "manual" });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  const set = res.headers.get("set-cookie") || "";
  const token = (new RegExp(`${COOKIE}=([^;]*)`).exec(set) || [])[1];
  return { status: res.status, json, headers: res.headers, setCookie: set, token };
}
const login = (base, barber, password, opts = {}) => call(base, "/api/barber/login", { method: "POST", body: { barber, password }, ...opts });
// Removes ONLY rows created by these tests (seed rows use refs 3B-SYNA..), and limiter state.
const resetThrottle = () =>
  sql("delete from rate_limits; delete from bookings where client_name like 'Synthetic%' and ref not like '3B-SYNA%'; delete from blocked_slots where reason <> 'synthetic pause'");
function tunisDay(n) {
  return sql(`select ((now() at time zone 'Africa/Tunis')::date + ${n})::text`);
}
function openDay(min = 1) {
  // next day (>= today+min) that is not Monday (Monday closed)
  for (let n = min; n < 14; n++) if (sql(`select extract(dow from (now() at time zone 'Africa/Tunis')::date + ${n})`) !== "1") return tunisDay(n);
}
const uuid = () => crypto.randomUUID();

/* ------------------------------ AUTH ------------------------------ */

test("correct password logs in with a hardened cookie; legacy 4-digit PIN no longer works", async () => {
  resetThrottle();
  const ok = await login(A, "3ebchi", OWNER_PW);
  assert.equal(ok.status, 200);
  assert.ok(ok.token && ok.token.length === 43);
  assert.match(ok.setCookie, /HttpOnly/i);
  assert.match(ok.setCookie, /SameSite=strict/i);
  assert.match(ok.setCookie, /Path=\//);
  assert.match(ok.setCookie, /Secure/i);
  assert.match(ok.setCookie, /^__Host-/);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  for (const body of [{ barber: "3ebchi", pin: "4242" }, { barber: "3ebchi", password: "4242" }]) {
    const r = await call(A, "/api/barber/login", { method: "POST", body });
    assert.equal(r.status, 401, JSON.stringify(body));
  }
});

test("failures are generic and malformed/oversized/cross-site requests are rejected before any work", async () => {
  resetThrottle();
  const unknown = await login(A, "nobody", "whatever whatever whatever");
  const wrong = await login(A, "brag", "a wrong but long password value");
  assert.equal(unknown.status, 401);
  assert.equal(wrong.status, 401);
  assert.deepEqual(unknown.json, wrong.json, "same body for unknown account and wrong password");
  assert.equal((await login(A, "brag", "x".repeat(200))).status, 401, "over-long password rejected without hashing");
  assert.equal((await call(A, "/api/barber/login", { method: "POST", body: JSON.stringify({ barber: "brag", password: "y".repeat(5000) }) })).status, 400, "oversized body");
  assert.equal((await call(A, "/api/barber/login", { method: "POST", body: "{not json" })).status, 400);
  assert.equal((await call(A, "/api/barber/login", { method: "POST", body: "barber=brag", headers: { "content-type": "application/x-www-form-urlencoded" } })).status, 400);
  assert.equal((await login(A, "brag", STAFF_PW, { origin: "https://evil.example" })).status, 403, "cross-site");
  assert.equal((await login(A, "brag", STAFF_PW, { origin: null })).status, 403, "missing Origin on cookie-auth route");
});

test("shared lockout across two app instances and changing addresses; cooldown expiry restores access", async () => {
  resetThrottle();
  const results = [];
  for (let i = 0; i < 7; i++) results.push((await login(i % 2 ? B : A, "achref", "definitely not the password " + i, { ip: `203.0.113.${i + 1}` })).status);
  assert.deepEqual(results.slice(0, 5), [401, 401, 401, 401, 401]);
  assert.deepEqual(results.slice(5), [429, 429], "6th+ attempt locked even from new addresses / other instance");
  const right = await login(B, "achref", STAFF_PW, { ip: "203.0.113.200" });
  assert.equal(right.status, 429, "even the right password is refused while the account is locked");
  assert.ok(Number(right.headers.get("retry-after")) > 0);
  // owner-controlled recovery / natural expiry
  sql("update rate_limits set locked_until = now() - interval '1 second' where key = 'login:acct:achref'");
  assert.equal((await login(A, "achref", STAFF_PW)).status, 200);
});

test("simultaneous attempts cannot race past the account threshold", async () => {
  resetThrottle();
  const res = await Promise.all(Array.from({ length: 16 }, (_, i) => login(i % 2 ? A : B, "brag", "parallel wrong guess " + i, { ip: `192.0.2.${i + 1}` })));
  const checked = res.filter((r) => r.status === 401).length;
  const locked = res.filter((r) => r.status === 429).length;
  assert.equal(checked, 5, `only 5 reached the password check (got ${checked})`);
  assert.equal(locked, 11);
});

test("address-level limit stops spraying across accounts from one address", async () => {
  resetThrottle();
  const ip = "198.18.0.9";
  const statuses = [];
  for (let i = 0; i < 22; i++) statuses.push((await login(i % 2 ? A : B, ["nobody", "ghost", "x"][i % 3], "spray attempt value " + i, { ip })).status);
  assert.equal(statuses.filter((s) => s === 401).length, 20);
  assert.equal(statuses.at(-1), 429);
});

test("session fixation: a pre-set cookie is never adopted; a fresh random token is issued and the old one revoked", async () => {
  resetThrottle();
  const first = await login(A, "imed", process.env.IMED_PW);
  assert.equal(first.status, 200);
  const second = await login(B, "imed", process.env.IMED_PW, { cookie: first.token });
  assert.equal(second.status, 200);
  assert.notEqual(second.token, first.token);
  assert.equal((await call(A, "/api/barber/bookings", { cookie: first.token })).status, 401, "pre-login token revoked");
  assert.equal((await call(A, "/api/barber/bookings", { cookie: second.token })).status, 200);
  const forged = "A".repeat(43);
  assert.equal((await call(A, "/api/barber/bookings", { cookie: forged })).status, 401);
});

test("logout revokes server-side (replaying the old cookie fails), clears cookie with same attributes", async () => {
  resetThrottle();
  const s = await login(A, "brag", process.env.BRAG_PW);
  assert.equal((await call(B, "/api/barber/bookings", { cookie: s.token })).status, 200);
  const out = await call(B, "/api/barber/logout", { method: "POST", cookie: s.token });
  assert.equal(out.status, 200);
  assert.match(out.setCookie, /Max-Age=0/);
  assert.match(out.setCookie, /HttpOnly/i);
  assert.match(out.setCookie, /SameSite=strict/i);
  assert.equal((await call(A, "/api/barber/bookings", { cookie: s.token })).status, 401, "replay after logout");
});

test("password change, disabled account, expiry and removed owner role take effect on the next request", async () => {
  resetThrottle();
  const staff = await login(A, "achref", STAFF_PW);
  const owner = await login(A, "3ebchi", OWNER_PW);
  // password change (what the provisioning SQL does)
  sql("update barbers set password_changed_at = now() where id = 'achref'; select admin_sessions_revoke_all('achref')");
  assert.equal((await call(A, "/api/barber/bookings", { cookie: staff.token })).status, 401);
  // disabled
  sql("update barbers set password_changed_at = now() - interval '1 hour' where id = 'achref'");
  const staff2 = await login(B, "achref", STAFF_PW);
  sql("update barbers set active = false where id = 'achref'");
  assert.equal((await call(B, "/api/barber/bookings", { cookie: staff2.token })).status, 401);
  assert.equal((await login(B, "achref", STAFF_PW)).status, 401, "disabled account cannot log in");
  sql("update barbers set active = true where id = 'achref'");
  // owner role removed in DB => no more 'all' view
  const allBefore = await call(A, "/api/barber/bookings?all=1", { cookie: owner.token });
  assert.equal(allBefore.json.viewingAll, true);
  sql("update barbers set is_owner = false where id = '3ebchi'");
  const allAfter = await call(A, "/api/barber/bookings?all=1", { cookie: owner.token });
  assert.equal(allAfter.json.viewingAll, false);
  assert.equal(allAfter.json.me.isOwner, false);
  assert.ok(allAfter.json.bookings.every((b) => b.barber === "3ebchi"));
  sql("update barbers set is_owner = true where id = '3ebchi'");
  // expiry
  sql(`update admin_sessions set expires_at = now() - interval '1 second' where barber = '3ebchi'`);
  assert.equal((await call(A, "/api/barber/bookings", { cookie: owner.token })).status, 401);
});

test("limiter/database outage fails closed (no unlimited attempts, no fake success)", async () => {
  resetThrottle();
  process.kill(Number(process.env.SHIM_PID), "SIGUSR2"); // outage ON
  try {
    assert.equal((await login(A, "3ebchi", OWNER_PW)).status, 503);
    const day = openDay(2);
    const b = await call(A, "/api/book", { method: "POST", body: { barber: "imed", service: "hjema", date: day, time: "17:00", name: "Synthetic Outage", phone: "20 111 222", requestKey: uuid() } });
    assert.equal(b.status, 500);
    assert.equal(b.json.ok, false);
  } finally {
    process.kill(Number(process.env.SHIM_PID), "SIGUSR2"); // outage OFF
  }
  assert.equal((await login(A, "3ebchi", OWNER_PW)).status, 200);
});

/* --------------------------- AUTHORIZATION --------------------------- */

test("authorization: unauthenticated, wrong staff and owner on every privileged route", async () => {
  resetThrottle();
  const day = openDay(2);
  const id = (barber, time) => sql(`insert into bookings (barber, service, price, duration_min, date, start_time, client_name, phone, ref) values ('${barber}','Hjema',8,30,'${day}','${time}','Synthetic Authz','21620555000','3B-AZ${barber.slice(0, 2).toUpperCase()}${time.replace(":", "")}') returning id`).split("\n")[0];
  const bragBooking = id("brag", "18:00");
  const achrefBooking = id("achref", "18:00");
  const bragBlock = sql(`insert into blocked_slots (barber, date, start_time, end_time) values ('brag','${day}','19:00','20:00') returning id`).split("\n")[0];

  for (const [m, p, body] of [["GET", "/api/barber/bookings"], ["POST", "/api/barber/action", { id: bragBooking, action: "cancel" }], ["POST", "/api/barber/block", { date: day, fullDay: true }], ["DELETE", `/api/barber/block?id=${bragBlock}`]]) {
    assert.equal((await call(A, p, { method: m, body })).status, 401, `${m} ${p} unauthenticated`);
  }
  const staff = (await login(A, "achref", STAFF_PW)).token;
  const list = await call(A, "/api/barber/bookings?all=1", { cookie: staff });
  assert.equal(list.json.viewingAll, false);
  assert.ok(list.json.bookings.length > 0 && list.json.bookings.every((b) => b.barber === "achref"), "staff sees only own bookings");
  assert.ok(list.json.blocked.every((b) => b.barber === "achref"));
  assert.equal(list.json.stats, null);
  assert.equal((await call(A, "/api/barber/action", { method: "POST", cookie: staff, body: { id: bragBooking, action: "cancel" } })).status, 404);
  assert.equal(sql(`select status from bookings where id = '${bragBooking}'`), "confirmed", "other barber's booking unchanged");
  assert.equal((await call(A, `/api/barber/block?id=${bragBlock}`, { method: "DELETE", cookie: staff })).status, 404);
  assert.equal(sql(`select count(*) from blocked_slots where id = '${bragBlock}'`), "1");
  assert.equal((await call(A, "/api/barber/action", { method: "POST", cookie: staff, body: { id: "not-a-uuid", action: "cancel" } })).status, 400);
  assert.equal((await call(A, "/api/barber/action", { method: "POST", cookie: staff, body: { id: achrefBooking, action: "cancel" }, origin: "https://evil.example" })).status, 403, "CSRF");
  assert.equal((await call(A, "/api/barber/action", { method: "POST", cookie: staff, body: { id: achrefBooking, action: "cancel" } })).status, 200, "own booking");

  const owner = (await login(B, "3ebchi", OWNER_PW)).token;
  const all = await call(B, "/api/barber/bookings?all=1", { cookie: owner });
  assert.equal(all.json.viewingAll, true);
  assert.ok(new Set(all.json.bookings.map((b) => b.barber)).size > 1);
  assert.ok(all.json.stats);
  assert.equal(all.headers.get("cache-control"), "no-store, private");
  assert.equal((await call(B, "/api/barber/action", { method: "POST", cookie: owner, body: { id: bragBooking, action: "done" } })).status, 200);
  assert.equal((await call(B, `/api/barber/block?id=${bragBlock}`, { method: "DELETE", cookie: owner })).status, 200);
  // block creation: validation + own barber only
  assert.equal((await call(A, "/api/barber/block", { method: "POST", cookie: staff, body: { date: "2027-02-30", fullDay: true } })).status, 400);
  assert.equal((await call(A, "/api/barber/block", { method: "POST", cookie: staff, body: { date: day, start_time: "12:75", end_time: "13:00" } })).status, 400);
  assert.equal((await call(A, "/api/barber/block", { method: "POST", cookie: staff, body: { date: day, start_time: "12:00", end_time: "13:00", barber: "brag" } })).status, 200);
  assert.equal(sql(`select barber from blocked_slots where date = '${day}' and start_time = '12:00'`), "achref", "barber field from the client is ignored");
});

test("admin routes stay hidden on non-admin hosts (defence in depth, not authorization)", async () => {
  const status = await new Promise((resolve) => {
    const r = http.request({ host: "127.0.0.1", port: new URL(A).port, path: "/api/barber/bookings", headers: { host: "3ebchi-style-badis4.vercel.app" } }, (res) => resolve(res.statusCode));
    r.end();
  });
  assert.equal(status, 404);
});

/* ------------------------------ BOOKING ------------------------------ */

test("valid booking succeeds; price/duration/status/barber tampering is ignored (server values stored)", async () => {
  resetThrottle();
  const day = openDay(2);
  const r = await call(A, "/api/book", { method: "POST", body: { barber: "imed", service: "pack3_complet", date: day, time: "10:00", name: "  Synthetic   Valid  ", phone: "+216 20 333 444", note: "ok", price: 0, durationMin: 5, duration_min: 5, status: "done", requestKey: uuid() } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.match(r.json.ref, /^3B-[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(sql(`select price || '|' || duration_min || '|' || status || '|' || client_name || '|' || phone from bookings where ref = '${r.json.ref}'`), "15|60|confirmed|Synthetic Valid|21620333444");
});

test("invalid booking inputs are rejected with 400 (dates, window, past, grid, closed, overrun, unknown, sizes)", async () => {
  resetThrottle();
  const day = openDay(2);
  const monday = (() => {
    for (let n = 1; n < 14; n++) if (sql(`select extract(dow from (now() at time zone 'Africa/Tunis')::date + ${n})`) === "1") return tunisDay(n);
  })();
  const nowTunis = sql("select to_char(now() at time zone 'Africa/Tunis', 'HH24:MI')");
  const base = { barber: "brag", service: "hjema", date: day, time: "11:00", name: "Synthetic Invalid", phone: "20 444 555" };
  const cases = [
    ["impossible date", { date: "2027-02-30" }],
    ["far future 2099", { date: "2099-01-06" }],
    ["beyond 14-day window", { date: tunisDay(20) }],
    ["yesterday", { date: tunisDay(-1) }],
    ["off-grid time", { time: "11:07" }],
    ["impossible time", { time: "10:75" }],
    ["before opening", { time: "08:00" }],
    ["service overruns closing (60 min at 20:30)", { service: "pack3_complet", time: "20:30" }],
    ["closed Monday", { date: monday }],
    ["unknown barber", { barber: "ghost" }],
    ["unknown service", { service: "free_cut" }],
    ["name too short", { name: "X" }],
    ["name too long", { name: "N".repeat(61) }],
    ["phone invalid", { phone: "0612345678" }],
    ["malformed requestKey", { requestKey: "not-a-uuid" }],
  ];
  if (nowTunis > "10:30" && nowTunis < "20:00" && sql("select extract(dow from now() at time zone 'Africa/Tunis')") !== "1") cases.push(["past time today", { date: tunisDay(0), time: "10:00" }]);
  for (const [label, patch] of cases) {
    const r = await call(A, "/api/book", { method: "POST", body: { ...base, ...patch } });
    assert.equal(r.status, 400, `${label}: ${JSON.stringify(r.json)}`);
    assert.equal(r.json.ok, false);
  }
  assert.equal((await call(A, "/api/book", { method: "POST", body: JSON.stringify({ ...base, note: "n".repeat(6000) }) })).status, 400, "oversized body");
  assert.equal((await call(A, "/api/book", { method: "POST", body: "{bad" })).status, 400);
  assert.equal((await call(A, "/api/book", { method: "POST", body: base, origin: "https://evil.example" })).status, 403);
  assert.equal(sql(`select count(*) from bookings where client_name like 'Synthetic Invalid%'`), "0");
});

test("20 simultaneous API bookings for the same slot on two instances => exactly one appointment", async () => {
  resetThrottle();
  const day = openDay(3);
  const res = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      call(i % 2 ? A : B, "/api/book", { method: "POST", ip: `100.64.0.${i + 1}`, body: { barber: "3ebchi", service: ["hjema", "pack2_basic", "pack3_complet", "lahya"][i % 4], date: day, time: "15:00", name: "Synthetic Race " + i, phone: `20 7${String(i).padStart(2, "0")} 000`, requestKey: uuid() } })
    )
  );
  assert.equal(res.filter((r) => r.status === 200).length, 1);
  assert.equal(res.filter((r) => r.status === 409 && r.json.code === "SLOT_TAKEN").length, 19);
  assert.equal(sql(`select count(*) from bookings where barber='3ebchi' and date='${day}' and client_name like 'Synthetic Race%'`), "1");
});

test("retries after an uncertain outcome return the same booking; reused key with other data does not leak", async () => {
  resetThrottle();
  const day = openDay(4);
  const key = uuid();
  const body = { barber: "achref", service: "hjema", date: day, time: "16:00", name: "Synthetic Retry", phone: "20 999 888", requestKey: key };
  const [r1, r2] = await Promise.all([call(A, "/api/book", { method: "POST", body }), call(B, "/api/book", { method: "POST", body })]);
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(r1.json.ref, r2.json.ref, "double click / retry => same ticket");
  const r3 = await call(A, "/api/book", { method: "POST", body });
  assert.equal(r3.json.ref, r1.json.ref);
  const other = await call(A, "/api/book", { method: "POST", body: { ...body, time: "17:00", phone: "20 999 777" } });
  assert.equal(other.status, 409);
  assert.equal(other.json.ref, undefined);
  assert.equal(sql(`select count(*) from bookings where client_name = 'Synthetic Retry'`), "1");
});

test("booking limits: one phone may book for a whole family; per-address limit shared by both instances; replays free; honeypot stores nothing", async () => {
  resetThrottle();
  const day = openDay(5);
  // default config: NO per-phone cap (BOOKING_MAX_ACTIVE_PER_PHONE unset => 0 => disabled)
  const statuses = [];
  for (const t of ["10:00", "11:00", "12:00", "13:00", "14:00"]) statuses.push((await call(statuses.length % 2 ? A : B, "/api/book", { method: "POST", body: { barber: "brag", service: "hjema", date: day, time: t, name: "Synthetic Family", phone: "20 123 999", requestKey: uuid() } })).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200], "5 future bookings on one phone (family) are accepted");
  resetThrottle();
  const ip = "100.100.0.1";
  const s2 = [];
  const keys = [];
  const body = (i) => ({ barber: "imed", service: "lahya", date: openDay(6), time: ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00"][i], name: "Synthetic Addr", phone: `20 55${i} 000`, requestKey: (keys[i] ??= uuid()) });
  for (let i = 0; i < 7; i++) s2.push((await call(i % 2 ? A : B, "/api/book", { method: "POST", ip, body: body(i) })).status);
  assert.deepEqual(s2, [200, 200, 200, 200, 200, 200, 429], "6 per 10 min per address, across both instances");
  const replay = await call(A, "/api/book", { method: "POST", ip, body: body(2) });
  assert.equal(replay.status, 200, "a retry of an already-created booking is not blocked by the address limit");
  assert.equal(sql("select count(*) from bookings where client_name = 'Synthetic Addr'"), "6");
  // other addresses (same shop wifi is the documented trade-off; a different one is unaffected)
  assert.equal((await call(B, "/api/book", { method: "POST", ip: "100.100.0.2", body: { ...body(6), requestKey: uuid() } })).status, 200);
  // invalid requests are rejected before the shared limiter and do not use the quota
  resetThrottle();
  for (let i = 0; i < 8; i++) assert.equal((await call(A, "/api/book", { method: "POST", ip: "100.100.0.3", body: { ...body(0), date: "2020-01-01", requestKey: uuid() } })).status, 400);
  assert.equal(sql("select count(*) from rate_limits where key like 'book:%'"), "0");
  const hp = await call(A, "/api/book", { method: "POST", body: { barber: "imed", service: "lahya", date: openDay(6), time: "16:00", name: "Synthetic Bot", phone: "20 666 000", website: "http://spam" } });
  assert.equal(hp.json.ok, true);
  assert.equal(sql("select count(*) from bookings where client_name = 'Synthetic Bot'"), "0");
});

test("environment safeguard: an instance whose DATA_ENVIRONMENT differs from the database label refuses all data access", { skip: !process.env.APP_MISLABELLED }, async () => {
  const C = process.env.APP_MISLABELLED;
  const r = await call(C, "/api/next-slots");
  assert.equal(r.status >= 500, true);
  const l = await login(C, "3ebchi", OWNER_PW);
  assert.equal(l.status >= 500, true);
  assert.equal(l.token, undefined);
  const b = await call(C, "/api/book", { method: "POST", body: { barber: "imed", service: "hjema", date: openDay(2), time: "17:30", name: "Synthetic Mislabel", phone: "20 111 333", requestKey: uuid() } });
  assert.equal(b.status, 500);
  assert.equal(sql("select count(*) from bookings where client_name = 'Synthetic Mislabel'"), "0");
});

test("public endpoints expose slot times only, validate dates and set the intended cache headers", async () => {
  const day = openDay(2);
  const av = await call(A, `/api/availability?barber=achref&service=hjema&date=${day}`);
  assert.equal(av.status, 200);
  assert.ok(av.json.slots.every((s) => Object.keys(s).every((k) => ["time", "available", "reason"].includes(k))));
  assert.equal(av.headers.get("cache-control"), "no-store");
  assert.equal((await call(A, "/api/availability?barber=achref&service=hjema&date=2099-01-06")).status, 400);
  assert.equal((await call(A, "/api/availability?barber=achref&service=hjema&date=2027-02-30")).status, 400);
  const ns = await call(A, "/api/next-slots");
  assert.equal(ns.status, 200);
  assert.match(ns.headers.get("cache-control"), /public.*s-maxage=30/);
  const raw = JSON.stringify(ns.json);
  assert.ok(!/client_name|phone|Synthetic/.test(raw), "no client data in the public widget feed");
});

test("security headers on pages and APIs; no framework fingerprint", async () => {
  for (const p of ["/", "/barber", "/api/next-slots"]) {
    const r = await fetch(A + p);
    assert.match(r.headers.get("content-security-policy") || "", /frame-ancestors 'none'/, p);
    assert.equal(r.headers.get("x-frame-options"), "DENY");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("x-powered-by"), null);
  }
  const f = await fetch(A + "/assets/sequence/d/0001.webp");
  assert.match(f.headers.get("cache-control") || "", /max-age=86400/);
});
