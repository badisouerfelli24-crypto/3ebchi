/* =========================================================================
   TEST-ONLY: migration upgrade path, old-app compatibility during the
   cutover window, password provisioning SQL, preflight and the post-cutover
   cleanup. Uses throw-away databases in the disposable local cluster only.
     TESTDB_DIR=... node --test tests/db/migration.test.mjs
   ========================================================================= */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import path from "node:path";
import bcrypt from "bcryptjs";

const DIR = process.env.TESTDB_DIR;
if (!DIR) throw new Error("TESTDB_DIR required");
const PORT = process.env.TESTDB_PORT || "55432";
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const MIG = "supabase/migrations/20261004120000_security_hardening.sql";
const DBS = ["mig_up", "mig_fresh", "mig_lock"];
// Synthetic, test-only passwords (never used anywhere else).
const PW = { "3ebchi": "synthetic Owner phrase lemon river 81", achref: "synthetic staff phrase cedar moon 42", brag: "synthetic staff phrase olive sky 17", imed: "synthetic staff phrase amber road 66" };

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", cwd: REPO, ...opts });
const psqlArgs = (db) => ["-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1", "-h", DIR, "-p", PORT, "-U", "postgres", "-d", db];
function psql(db, sql) {
  const r = run("psql", [...psqlArgs(db), "-c", sql]);
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
function psqlFile(db, file) {
  return run("psql", [...psqlArgs(db), "-f", file]);
}
function freshDb(db, mode) {
  psql("postgres", `drop database if exists ${db}`);
  psql("postgres", `create database ${db}`);
  const r = run("bash", ["tests/support/test-db.sh", mode], { env: { ...process.env, TESTDB_NAME: db } });
  assert.equal(r.status, 0, r.stderr);
}
function snapshot(db) {
  return psql(db, `select string_agg(concat_ws('|', id, barber, service, price, duration_min, date, start_time, client_name, phone, note, status, ref, slot), E'\\n' order by ref) from bookings`)
    + "\n" + psql(db, "select string_agg(concat_ws('|', barber, date, start_time, end_time, reason), E'\\n' order by barber, date) from blocked_slots")
    + "\n" + psql(db, "select string_agg(concat_ws('|', id, name, is_owner, pin_hash), E'\\n' order by id) from barbers");
}
function setPasswordSql(id, pw) {
  const r = run("npx", ["tsx", "scripts/set-password.ts", id], { input: pw + "\n" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
function applySql(db, sql) {
  const r = run("psql", [...psqlArgs(db)], { input: sql });
  return r;
}
const preflight = (db, phase = "pre-deploy") => JSON.parse(psql(db, `select public.release_preflight('${phase}')`));
const failing = (pf) => pf.checks.filter((c) => !c.ok).map((c) => c.check).sort();

after(() => {
  for (const db of DBS) psql("postgres", `drop database if exists ${db}`);
});

test("upgrade from the audited schema keeps every record; legacy-invalid rows stay, constraint left NOT VALID", () => {
  freshDb("mig_up", "baseline");
  assert.equal(psqlFile("mig_up", "tests/support/seed-synthetic.sql").status, 0);
  const ph = bcrypt.hashSync("4242", 4);
  psql("mig_up", `update barbers set pin_hash = '${ph}'`);
  const before = snapshot("mig_up");

  const r = psqlFile("mig_up", MIG);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /PRÉ-CONTRÔLE : 1 réservation/);
  assert.match(r.stderr, /bookings_name_len laissée NOT VALID/);
  assert.equal(snapshot("mig_up"), before, "bookings, blocks, barbers (incl. PIN hashes) unchanged");
  assert.equal(psql("mig_up", "select string_agg(conname, ',') from pg_constraint where connamespace='public'::regnamespace and not convalidated"), "bookings_name_len");
  // done / cancelled / past rows untouched and the slot exclusion constraint unchanged
  assert.equal(psql("mig_up", "select count(*) from bookings where status in ('done','cancelled')"), "3");

  // rerun is a no-op
  const r2 = psqlFile("mig_up", MIG);
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(snapshot("mig_up"), before);
  assert.equal(psql("mig_up", "select count(*) from app_schema_version"), "1");
});

test("cutover window: the OLD deployed app keeps working against the migrated schema", () => {
  // what the old app does, as service_role: PIN lookup, legacy booking RPC, dashboard reads/updates, blocks
  const d = psql("mig_up", "select (now() at time zone 'Africa/Tunis')::date + 5");
  assert.match(psql("mig_up", "set role service_role; select pin_hash from barbers where id = 'achref'"), /^\$2[aby]\$/);
  const legacy = JSON.parse(psql("mig_up", `set role service_role; select public.create_booking('brag','Hjema',8,30,'${d}','09:30','Old App Client','21620000111','')`));
  assert.equal(legacy.ok, true);
  const conflict = run("psql", [...psqlArgs("mig_up"), "-c", `set role service_role; select public.create_booking('brag','Hjema',8,30,'${d}','09:30','Old App Two','21620000112','')`]);
  assert.match(conflict.stderr, /SLOT_TAKEN/, "legacy conflict error shape unchanged");
  psql("mig_up", `set role service_role; update bookings set status = 'done' where ref = '${legacy.ref}'`);
  psql("mig_up", `set role service_role; insert into blocked_slots (barber, date, start_time, end_time, reason) values ('brag', '${d}', '18:00', '19:00', 'old app block')`);
  psql("mig_up", "set role service_role; select id, barber, service, price, duration_min, date, start_time, client_name, phone, note, status, ref from bookings where date >= current_date order by date limit 50");
  // the new app's RPC sees the old app's booking (shared exclusion constraint)
  const v2 = JSON.parse(psql("mig_up", `set role service_role; select public.create_booking_v2('brag','Hjema',8,30,'${d}','18:00','New App Client','21620000113','',null,null,10,600,0)`));
  assert.equal(v2.code, "SLOT_TAKEN", "blocks created by the old app are honoured by v2");
});

test("password provisioning SQL: atomic, revokes sessions, keeps ids and bookings, rejects unknown ids", () => {
  const bookingsBefore = psql("mig_up", "select string_agg(id || barber, ',' order by id) from bookings");
  // a pre-existing session for achref must be revoked by setting the password
  psql("mig_up", "update barbers set password_hash = 'scrypt$v=1$n=16384,r=8,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' where id = 'achref'");
  psql("mig_up", `select public.admin_session_create('achref', '${"a".repeat(64)}', 3600, null, null, null)`);
  assert.notEqual(psql("mig_up", `select public.admin_session_validate('${"a".repeat(64)}', 3600, 300)`), "");

  for (const [id, pw] of Object.entries(PW)) {
    const sql = setPasswordSql(id, pw);
    assert.doesNotMatch(sql, new RegExp(pw), "plaintext never printed");
    const r = applySql("mig_up", sql);
    assert.equal(r.status, 0, r.stderr);
  }
  assert.equal(psql("mig_up", `select coalesce(public.admin_session_validate('${"a".repeat(64)}', 3600, 300)::text, 'null')`), "null");
  assert.equal(psql("mig_up", "select count(*) from admin_sessions where barber='achref' and revoked_at is null"), "0");
  assert.equal(psql("mig_up", "select string_agg(id || barber, ',' order by id) from bookings"), bookingsBefore);
  assert.equal(psql("mig_up", "select count(*) from barbers where password_hash like 'scrypt$v=1$n=131072,r=8,p=1$%'"), "4");

  // unknown barber id: SQL fails, nothing changes (barber id comes from config; simulate a DB missing a row)
  const sql = setPasswordSql("imed", PW.imed).replace(/'imed'/g, "'ghost'");
  const r = applySql("mig_up", sql);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /introuvable/);
  // policy refuses weak passwords before producing anything
  const weak = run("npx", ["tsx", "scripts/set-password.ts", "brag"], { input: "4242\n" });
  assert.notEqual(weak.status, 0);
  assert.equal(weak.stdout.includes("update public.barbers"), false);
});

test("preflight: fails until label + passwords exist, then passes; post-cutover phase requires the cleanup", () => {
  psql("mig_up", "delete from app_environment");
  assert.deepEqual(failing(preflight("mig_up")), ["app_environment label set"]);
  psql("mig_up", "insert into app_environment (name) values ('test')");
  assert.equal(preflight("mig_up").ok, true);
  // relabelling silently is impossible (single row; insert fails)
  assert.throws(() => psql("mig_up", "insert into app_environment (name) values ('production')"));
  // an active barber without a password fails the preflight
  psql("mig_up", "update barbers set password_hash = null where id = 'brag'");
  assert.deepEqual(failing(preflight("mig_up")), ["every active barber has a password"]);
  psql("mig_up", "update barbers set active = false where id = 'brag'");
  assert.equal(preflight("mig_up").ok, true, "disabled accounts do not need a password");
  const pf = preflight("mig_up", "post-cutover");
  assert.deepEqual(failing(pf), ["legacy PIN hashes cleared", "legacy create_booking not callable by service_role"]);
  // the Node wrapper exits non-zero on failure (separation check with identical refs)
  const sep = run("node", ["scripts/release-preflight.mjs", "separation", "https://abcdefghijklmnopqrst.supabase.co", "https://abcdefghijklmnopqrst.supabase.co/"]);
  assert.equal(sep.status, 1);
  const sep2 = run("node", ["scripts/release-preflight.mjs", "separation", "https://abcdefghijklmnopqrst.supabase.co", "https://tsrqponmlkjihgfedcba.supabase.co"]);
  assert.equal(sep2.status, 0);
  const env = run("node", ["scripts/release-preflight.mjs", "env"], { env: { PATH: process.env.PATH } });
  assert.equal(env.status, 1, "missing settings fail");
  assert.doesNotMatch(env.stdout, /test-local/);
});

test("post-cutover cleanup refuses until the owner has logged in with a password, then clears PINs only", () => {
  psql("mig_up", "update barbers set active = true where id = 'brag'");
  const brag = setPasswordSql("brag", PW.brag);
  assert.equal(applySql("mig_up", brag).status, 0);
  const pinsBefore = psql("mig_up", "select count(*) from barbers where pin_hash is not null");
  const r = psqlFile("mig_up", "supabase/release/post_cutover_cleanup.sql");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /aucune connexion du propriétaire/);
  assert.equal(psql("mig_up", "select count(*) from barbers where pin_hash is not null"), pinsBefore, "nothing changed");

  // owner logs in through the new flow (session created after the password was set)
  psql("mig_up", `select public.admin_session_create('3ebchi', '${"b".repeat(64)}', 3600, null, null, null)`);
  const bookings = psql("mig_up", "select count(*) || '/' || string_agg(ref, ',' order by ref) from bookings");
  const r2 = psqlFile("mig_up", "supabase/release/post_cutover_cleanup.sql");
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(psql("mig_up", "select count(*) from barbers where pin_hash is not null"), "0");
  assert.equal(psql("mig_up", "select has_function_privilege('service_role', 'public.create_booking(text,text,numeric,integer,date,time,text,text,text)', 'execute')"), "f");
  assert.equal(psql("mig_up", "select count(*) || '/' || string_agg(ref, ',' order by ref) from bookings"), bookings);
  assert.equal(preflight("mig_up", "post-cutover").ok, true);
  // the new flow still works after the cleanup
  const d = psql("mig_up", "select (now() at time zone 'Africa/Tunis')::date + 6");
  assert.equal(JSON.parse(psql("mig_up", `set role service_role; select public.create_booking_v2('achref','Hjema',8,30,'${d}','11:00','After Cutover','21620000114','',null,null,10,600,0)`)).ok, true);
});

test("fresh install: every constraint validated, preflight only waits for label and passwords", () => {
  freshDb("mig_fresh", "baseline");
  const r = psqlFile("mig_fresh", MIG);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(psql("mig_fresh", "select count(*) from pg_constraint where connamespace='public'::regnamespace and not convalidated"), "0");
  assert.deepEqual(failing(preflight("mig_fresh")), ["app_environment label set", "every active barber has a password", "exactly one usable owner account"]);
  // the original baseline script can still be re-run afterwards (history preserved)
  assert.equal(psqlFile("mig_fresh", "supabase/migration.sql").status, 0);
});

test("migration is all-or-nothing: blocked by live traffic it times out and leaves the schema untouched", async () => {
  freshDb("mig_lock", "baseline");
  // an open transaction holding a lock on bookings (like a slow request)
  const holder = spawn("psql", [...psqlArgs("mig_lock")], { stdio: ["pipe", "ignore", "ignore"] });
  holder.stdin.write("begin; lock table public.bookings in row exclusive mode; select pg_sleep(30);\n");
  await new Promise((r) => setTimeout(r, 800));
  const r = psqlFile("mig_lock", MIG);
  holder.kill("SIGINT");
  holder.stdin.end();
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /lock timeout/);
  assert.equal(psql("mig_lock", "select count(*) from information_schema.columns where table_name='barbers' and column_name='password_hash'"), "0");
  assert.equal(psql("mig_lock", "select to_regclass('public.admin_sessions') is null"), "t");
  await new Promise((r) => setTimeout(r, 500));
  psql("mig_lock", "select pg_terminate_backend(pid) from pg_stat_activity where datname='mig_lock' and pid <> pg_backend_pid()");
  const r2 = psqlFile("mig_lock", MIG);
  assert.equal(r2.status, 0, "retry after the traffic is gone succeeds");
});
