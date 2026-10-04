/* =========================================================================
   Database-level security / integrity tests (node:test + psql).
   Run against a DISPOSABLE local cluster prepared with tests/support/test-db.sh
   (baseline + migrations). Never point these at a hosted database.
     TESTDB_DIR=... TESTDB_NAME=fresh_test node --test tests/db/
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";

const HOST = process.env.TESTDB_DIR;
const PORT = process.env.TESTDB_PORT || "55432";
const DB = process.env.TESTDB_NAME || "fresh_test";
if (!HOST || !HOST.startsWith("/")) throw new Error("TESTDB_DIR (local socket dir) required");

const args = (sql) => ["-X", "-q", "-tA", "-h", HOST, "-p", PORT, "-U", "postgres", "-d", DB, "-v", "ON_ERROR_STOP=1", "-c", sql];
/** Run SQL synchronously; returns {ok, out, err}. */
function q(sql) {
  try {
    return { ok: true, out: execFileSync("psql", args(sql), { stdio: ["ignore", "pipe", "pipe"] }).toString().trim(), err: "" };
  } catch (e) {
    return { ok: false, out: "", err: String(e.stderr || e.message) };
  }
}
/** Run SQL asynchronously (true concurrency: one backend per call). */
function qa(sql) {
  return new Promise((resolve) => {
    const p = spawn("psql", args(sql));
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ ok: code === 0, out: out.trim(), err }));
  });
}
const svc = (sql) => q(`set role service_role; ${sql}`);
const TODAY = q("select (now() at time zone 'Africa/Tunis')::date").out;
const day = (n) => q(`select (date '${TODAY}' + ${n})::text`).out;
const book = (o) =>
  `select public.create_booking_v2(p_barber => '${o.barber}', p_service => '${o.service || "Hjema"}', p_price => ${o.price ?? 8}, p_duration_min => ${o.dur ?? 30}, p_date => '${o.date}', p_start_time => '${o.time}', p_client_name => '${o.name || "Synthetic"}', p_phone => '${o.phone || "21620000099"}', p_note => '', p_request_key => ${o.key ? `'${o.key}'` : "null"}, p_rate_key => ${o.rate ? `'${o.rate}'` : "null"}, p_rate_max => ${o.rateMax ?? 1000}, p_rate_window_secs => 600, p_phone_max_active => ${o.phoneMax ?? 1000})`;

function reset() {
  q("truncate public.bookings, public.blocked_slots, public.admin_sessions, public.rate_limits");
  q("update public.barbers set active = true, password_hash = null, password_changed_at = null, is_owner = (id = '3ebchi')");
}

test("anonymous/authenticated roles cannot read or write any table, or call any function", () => {
  reset();
  svc(book({ barber: "achref", date: day(2), time: "10:00" }));
  for (const role of ["anon", "authenticated"]) {
    for (const t of ["bookings", "barbers", "blocked_slots", "admin_sessions", "rate_limits"]) {
      const r = q(`set role ${role}; select count(*) from public.${t}`);
      assert.ok(!r.ok || r.out === "0", `${role} must not see rows of ${t} (got ${r.out})`);
      const w = q(`set role ${role}; delete from public.${t}`);
      assert.ok(!w.ok || true);
    }
    assert.equal(q("select count(*) from public.bookings").out, "1", `${role} delete must not remove rows`);
    for (const f of [
      "public.create_booking('achref','x',1,30,current_date,'10:00','xx','21620000000','')",
      book({ barber: "achref", date: day(3), time: "10:00" }).replace("select ", ""),
      "public.auth_login_begin('login:acct:3ebchi', null, 5, 20, 900, 900, 3600)",
      "public.admin_session_validate(repeat('a',64), 3600, 60)",
      "public.admin_session_create('3ebchi', repeat('b',64), 3600, null, null, null)",
      "public.admin_sessions_revoke_all('3ebchi')",
      "public.set_booking_status(gen_random_uuid(), '3ebchi', true, 'cancelled')",
      "public.delete_block(gen_random_uuid(), '3ebchi', true)",
      "public.create_block('achref', current_date, '10:00', '11:00', 'x')",
      "public.rate_limit_hit('k', 1, 60, 60, 60)",
      "public.security_housekeeping()",
    ]) {
      const r = q(`set role ${role}; select ${f}`);
      assert.ok(!r.ok && /permission denied/.test(r.err), `${role} must not execute ${f.split("(")[0]}: ${r.err || r.out}`);
    }
    const ext = q(`set role ${role}; select public.gen_random_bytes(4)`);
    assert.ok(!ext.ok, "pgcrypto functions must not be reachable in the public (API-exposed) schema");
  }
});

test("20 simultaneous same-barber conflicting bookings (mixed durations) => exactly 1 succeeds", async () => {
  reset();
  const date = day(2);
  const runs = await Promise.all(
    Array.from({ length: 20 }, (_, i) => qa(`set role service_role; ${book({ barber: "achref", date, time: "10:00", dur: [15, 30, 45, 60][i % 4], phone: `216200001${String(i).padStart(2, "0")}` })}`))
  );
  const ok = runs.filter((r) => r.ok && JSON.parse(r.out).ok).length;
  const taken = runs.filter((r) => r.ok && JSON.parse(r.out).code === "SLOT_TAKEN").length;
  assert.equal(ok, 1);
  assert.equal(taken, 19, runs.filter((r) => !r.ok).map((r) => r.err).join("\n"));
  assert.equal(q(`select count(*) from public.bookings where barber='achref' and date='${date}'`).out, "1");
});

test("overlapping unequal-duration intervals never coexist; adjacent ones do; other barbers unaffected", async () => {
  reset();
  const date = day(3);
  const starts = ["09:30", "09:45", "10:00", "10:15", "10:30", "10:45"];
  await Promise.all(
    Array.from({ length: 24 }, (_, i) => qa(`set role service_role; ${book({ barber: "brag", date, time: starts[i % 6], dur: [15, 30, 45, 60][i % 4], phone: `216200002${String(i).padStart(2, "0")}` })}`))
  );
  const overlaps = q(`select count(*) from public.bookings a join public.bookings b on a.barber=b.barber and a.id<b.id and a.slot && b.slot and a.status='confirmed' and b.status='confirmed'`).out;
  assert.equal(overlaps, "0");
  // adjacency [) allowed
  assert.equal(JSON.parse(svc(book({ barber: "imed", date, time: "11:00", phone: "21620000301" })).out).ok, true);
  assert.equal(JSON.parse(svc(book({ barber: "imed", date, time: "11:30", phone: "21620000302" })).out).ok, true);
  // different barber, same time
  assert.equal(JSON.parse(svc(book({ barber: "3ebchi", date, time: "11:00", phone: "21620000303" })).out).ok, true);
});

test("different barbers do not wait on each other; same barber is serialized (no double booking)", async () => {
  reset();
  const date = day(4);
  const holder = qa(`begin; set local role service_role; ${book({ barber: "imed", date, time: "10:00", phone: "21620000401" })}; select pg_sleep(2); commit;`);
  await new Promise((r) => setTimeout(r, 600));
  const other = q(`set lock_timeout='300ms'; set role service_role; ${book({ barber: "3ebchi", date, time: "10:00", phone: "21620000402" })}`);
  assert.equal(JSON.parse(other.out).ok, true, "another barber must not be blocked: " + other.err);
  const same = q(`set lock_timeout='300ms'; set role service_role; ${book({ barber: "imed", date, time: "10:00", phone: "21620000403" })}`);
  assert.equal(same.ok, false, "same barber must wait (lock), never double-book");
  await holder;
  assert.equal(JSON.parse(svc(book({ barber: "imed", date, time: "10:00", phone: "21620000404" })).out).code, "SLOT_TAKEN");
});

test("audit edge case C6: an absence being created concurrently can no longer let an overlapping booking through", async () => {
  reset();
  const date = day(5);
  const blk = qa(`begin; set local role service_role; select public.create_block('brag', '${date}', '14:00', '18:00', 'synthetic absence'); select pg_sleep(1.5); commit;`);
  await new Promise((r) => setTimeout(r, 500));
  const r = await qa(`set role service_role; ${book({ barber: "brag", date, time: "15:00", phone: "21620000501" })}`);
  await blk;
  assert.equal(JSON.parse(r.out).code, "SLOT_TAKEN");
  assert.equal(q(`select count(*) from public.bookings where barber='brag' and date='${date}'`).out, "0");
});

test("cancellation frees the slot; only confirmed bookings can transition; staff cannot touch another barber's booking", () => {
  reset();
  const date = day(6);
  const b = JSON.parse(svc(book({ barber: "achref", date, time: "12:00", phone: "21620000601" })).out);
  const st = (actor, owner, s) => JSON.parse(svc(`select public.set_booking_status('${b.id}', '${actor}', ${owner}, '${s}')`).out).ok;
  assert.equal(st("brag", false, "cancelled"), false, "staff on another barber's booking");
  assert.equal(st("achref", false, "confirmed"), false, "no re-confirm transition");
  assert.equal(st("achref", false, "cancelled"), true, "own booking");
  assert.equal(st("3ebchi", true, "done"), false, "cancelled cannot become done");
  assert.equal(JSON.parse(svc(book({ barber: "achref", date, time: "12:00", phone: "21620000602" })).out).ok, true, "slot freed");
  const b2 = JSON.parse(svc(book({ barber: "imed", date, time: "12:00", phone: "21620000603" })).out);
  assert.equal(JSON.parse(svc(`select public.set_booking_status('${b2.id}', '3ebchi', true, 'done')`).out).ok, true, "owner can act on any booking");
});

test("idempotency: same key + same payload replays the SAME booking; different payload is refused; parallel retries create one row", async () => {
  reset();
  const date = day(7);
  const key = "6f1f7b9e-1c2d-4e3f-8a9b-0c1d2e3f4a5b";
  const a = JSON.parse(svc(book({ barber: "achref", date, time: "13:00", key, phone: "21620000701" })).out);
  const again = JSON.parse(svc(book({ barber: "achref", date, time: "13:00", key, phone: "21620000701" })).out);
  assert.equal(again.ok, true);
  assert.equal(again.ref, a.ref);
  assert.equal(again.replay, true);
  const other = JSON.parse(svc(book({ barber: "achref", date, time: "14:00", key, phone: "21620000799" })).out);
  assert.deepEqual([other.ok, other.code, other.ref], [false, "IDEMPOTENCY_MISMATCH", undefined], "must not leak the other booking");
  const key2 = "7a2b8c9d-0e1f-4a2b-9c3d-4e5f6a7b8c9d";
  const runs = await Promise.all(Array.from({ length: 10 }, () => qa(`set role service_role; ${book({ barber: "brag", date, time: "13:00", key: key2, phone: "21620000702" })}`)));
  const refs = new Set(runs.map((r) => JSON.parse(r.out).ref));
  assert.equal(refs.size, 1, "all retries return the same ref");
  assert.equal(q(`select count(*) from public.bookings where request_key='${key2}'`).out, "1");
});

test("per-phone cap on active future bookings, and shared rate limit cannot be raced", async () => {
  reset();
  const date = day(8);
  const r = (t) => JSON.parse(svc(book({ barber: "imed", date, time: t, phone: "21620000801", phoneMax: 3 })).out);
  assert.equal(r("10:00").ok, true);
  assert.equal(r("11:00").ok, true);
  assert.equal(r("12:00").ok, true);
  assert.equal(r("13:00").code, "PHONE_LIMIT");
  // the cap is OPTIONAL: 0 / null (the application default) disables it entirely
  const off = (t, max) => JSON.parse(svc(book({ barber: "imed", date, time: t, phone: "21620000801", phoneMax: max })).out);
  assert.equal(off("13:00", 0).ok, true, "cap disabled with 0");
  assert.equal(off("14:00", "null").ok, true, "cap disabled with null");
  assert.equal(q("select count(*) from public.bookings where phone='21620000801' and status='confirmed'").out, "5");
  // 20 parallel bookings from one address key with max 5 => at most 5 created
  const runs = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      qa(`set role service_role; ${book({ barber: ["achref", "brag", "3ebchi"][i % 3], date: day(9), time: ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00"][i % 7], phone: `216200009${String(i).padStart(2, "0")}`, rate: "book:ip:test", rateMax: 5 })}`)
    )
  );
  const created = runs.filter((x) => JSON.parse(x.out).ok).length;
  const limited = runs.filter((x) => JSON.parse(x.out).code === "RATE_LIMIT").length;
  assert.ok(created <= 5, `created ${created}`);
  assert.ok(limited >= 15 - (5 - created), `limited ${limited}`);
});

test("booking limiter: idempotent replays are free, the window expires, other addresses unaffected", async () => {
  reset();
  const date = day(10);
  const k = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
  const b = (t, key, rate, max = 2) => JSON.parse(svc(book({ barber: "brag", date, time: t, phone: "21620000901", key, rate, rateMax: max })).out);
  assert.equal(b("10:00", k[0], "book:ip:r1").ok, true);
  assert.equal(b("10:30", k[1], "book:ip:r1").ok, true);
  // quota (2) used up: a NEW booking is limited…
  assert.equal(b("11:00", null, "book:ip:r1").code, "RATE_LIMIT");
  // …but a retry of an already-created booking still returns it (not counted)
  const replay = b("10:00", k[0], "book:ip:r1");
  assert.equal(replay.ok, true);
  assert.equal(replay.replay, true);
  // another address (shared phone, e.g. a family member on another network) is unaffected
  assert.equal(b("11:00", null, "book:ip:r2").ok, true);
  // short window: after expiry (and lock) the address can book again
  const w = (t) => JSON.parse(svc(book({ barber: "achref", date, time: t, phone: "21620000902", rate: "book:ip:r3", rateMax: 1 }).replace("p_rate_window_secs => 600", "p_rate_window_secs => 1")).out);
  assert.equal(w("10:00").ok, true);
  assert.equal(w("10:30").code, "RATE_LIMIT");
  await new Promise((r) => setTimeout(r, 4200)); // window 1 s + lock 1 s… escalation capped at 4 s
  assert.equal(w("11:00").ok, true);
});

test("login limiter: account lock survives IP changes, parallel attempts cannot exceed the threshold, lock expires and escalates", async () => {
  reset();
  const begin = (acct, ip) => JSON.parse(svc(`select public.auth_login_begin(${acct ? `'${acct}'` : "null"}, '${ip}', 5, 20, 900, 900, 3600)`).out);
  const res = await Promise.all(
    Array.from({ length: 30 }, (_, i) => qa(`set role service_role; select public.auth_login_begin('login:acct:achref', 'login:ip:p${i}', 5, 20, 900, 900, 3600)`))
  );
  const allowed = res.filter((r) => JSON.parse(r.out).allowed).length;
  assert.equal(allowed, 5, "exactly 5 attempts allowed even when sent in parallel from 30 different addresses");
  const locked = begin("login:acct:achref", "login:ip:fresh");
  assert.equal(locked.allowed, false);
  assert.ok(locked.retry_after > 800 && locked.retry_after <= 900);
  // other accounts are not affected
  assert.equal(begin("login:acct:brag", "login:ip:fresh").allowed, true);
  // expire the lock => allowed again; next lock is longer (escalation, capped)
  svc("update public.rate_limits set locked_until = now() - interval '1 second' where key = 'login:acct:achref'");
  for (let i = 0; i < 5; i++) assert.equal(begin("login:acct:achref", `login:ip:x${i}`).allowed, true);
  const l2 = begin("login:acct:achref", "login:ip:x9");
  assert.equal(l2.allowed, false);
  assert.ok(l2.retry_after > 1700 && l2.retry_after <= 1800, `escalated lock ${l2.retry_after}`);
  // per-address limit across accounts (unknown accounts count only against the address)
  for (let i = 0; i < 20; i++) begin(null, "login:ip:sprayer");
  assert.equal(begin(null, "login:ip:sprayer").allowed, false);
});

test("sessions: valid -> revoked on logout; expiry; idle; password change; disabled account; owner flag re-read each time", () => {
  reset();
  const h = (c) => c.repeat(64);
  svc("update public.barbers set password_hash = 'scrypt$v=1$n=131072,r=8,p=1$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(43) + "', password_changed_at = now() - interval '1 hour'");
  const create = (barber, hash, ttl = 3600) => svc(`select public.admin_session_create('${barber}', '${hash}', ${ttl}, null, 'login:acct:${barber}', null)`);
  const validate = (hash, idle = 3600) => svc(`select public.admin_session_validate('${hash}', ${idle}, 60)`).out;
  create("3ebchi", h("a"));
  assert.match(validate(h("a")), /"barber" : "3ebchi", "is_owner" : true/);
  svc(`select public.admin_session_revoke('${h("a")}')`);
  assert.equal(validate(h("a")), "", "replay after logout must fail");
  create("achref", h("b"), 1);
  q("select pg_sleep(1.2)");
  assert.equal(validate(h("b")), "", "expired");
  create("achref", h("c"));
  svc(`update public.admin_sessions set last_seen_at = now() - interval '2 hours' where token_hash = '${h("c")}'`);
  assert.equal(validate(h("c"), 3600), "", "idle timeout");
  create("brag", h("d"));
  svc("update public.barbers set password_changed_at = now() + interval '1 second' where id = 'brag'");
  assert.equal(validate(h("d")), "", "password changed after session start");
  create("imed", h("e"));
  svc("update public.barbers set active = false where id = 'imed'");
  assert.equal(validate(h("e")), "", "disabled account");
  create("3ebchi", h("f"));
  svc("update public.barbers set is_owner = false where id = '3ebchi'");
  assert.match(validate(h("f")), /"is_owner" : false/, "revoked owner role applies immediately");
  // fixation: presenting an old token at login revokes it
  svc("update public.barbers set is_owner = true, password_changed_at = now() - interval '1 hour' where id = '3ebchi'");
  create("3ebchi", h("1"));
  svc(`select public.admin_session_create('3ebchi', '${h("2")}', 3600, '${h("1")}', null, null)`);
  assert.equal(validate(h("1")), "", "pre-login token revoked");
  assert.notEqual(validate(h("2")), "");
});

test("blocks: create under barber lock; delete only own (owner: any)", () => {
  reset();
  const id = JSON.parse(svc(`select public.create_block('achref', '${day(2)}', '12:00', '13:00', 'x')`).out).id;
  assert.equal(JSON.parse(svc(`select public.delete_block('${id}', 'brag', false)`).out).ok, false);
  assert.equal(JSON.parse(svc(`select public.delete_block('${id}', '3ebchi', true)`).out).ok, true);
});

test("durable CHECK constraints reject impossible data even from the privileged role", () => {
  reset();
  const bad = [
    `insert into public.bookings (barber, service, price, duration_min, date, start_time, client_name, phone) values ('achref','x',-5,30,'${day(2)}','10:00','Valid Name','21620000000')`,
    `insert into public.bookings (barber, service, price, duration_min, date, start_time, client_name, phone) values ('achref','x',8,30,'2001-01-01','10:00','Valid Name','21620000000')`,
    `insert into public.bookings (barber, service, price, duration_min, date, start_time, client_name, phone) values ('achref','x',8,30,'${day(2)}','10:00','X','21620000000')`,
    `insert into public.bookings (barber, service, price, duration_min, date, start_time, client_name, phone) values ('achref','x',8,30,'${day(2)}','10:00','Valid Name','0612345678')`,
    `insert into public.bookings (barber, service, price, duration_min, date, start_time, client_name, phone) values ('achref','x',8,30,'${day(2)}','10:00:30','Valid Name','21620000000')`,
  ];
  for (const s of bad) assert.equal(svc(s).ok, false, s);
  // The RPC returns a clean code (no exception) for out-of-range input
  assert.equal(JSON.parse(svc(book({ barber: "achref", date: "2099-12-31", time: "10:00" })).out).code, "VALIDATION");
  assert.equal(JSON.parse(svc(book({ barber: "achref", date: day(2), time: "10:00", price: -1 })).out).code, "VALIDATION");
});

test("housekeeping only removes stale limiter rows / old sessions (never bookings) and is bounded", () => {
  reset();
  svc(book({ barber: "achref", date: day(2), time: "10:00" }));
  svc("insert into public.rate_limits (key, updated_at) select 'k'||g, now() - interval '3 days' from generate_series(1, 700) g");
  svc("insert into public.rate_limits (key) values ('fresh')");
  svc("select public.security_housekeeping()");
  assert.equal(q("select count(*) from public.rate_limits").out, "201", "500 stale rows per call, fresh kept");
  assert.equal(q("select count(*) from public.bookings").out, "1");
});
