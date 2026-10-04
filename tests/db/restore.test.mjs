/* =========================================================================
   TEST-ONLY: backup / restore safety (scripts/db-backup.sh).
   Runs ONLY against the disposable local cluster (tests/support/test-db.sh),
   through its Unix socket. Source DB = TESTDB_NAME (default app_test, already
   baseline + migrated + seeded with synthetic rows).
     TESTDB_DIR=... node --test tests/db/restore.test.mjs
   ========================================================================= */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIR = process.env.TESTDB_DIR;
if (!DIR) throw new Error("TESTDB_DIR required");
const PORT = process.env.TESTDB_PORT || "55432";
const SRC = process.env.TESTDB_NAME || "app_test";
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const url = (db) => `postgresql://postgres@/${db}?host=${DIR}&port=${PORT}`;
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "3ebchi-restore-test-"));
const TARGETS = ["rt_legacy", "rt_ok", "rt_fault", "rt_noperm", "rt_corrupt"];

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", cwd: REPO, ...opts });
}
function psql(db, sql) {
  const r = sh("psql", ["-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1", "-h", DIR, "-p", PORT, "-U", "postgres", "-d", db, "-c", sql]);
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
function psqlErr(db, sql) {
  const r = sh("psql", ["-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1", "-h", DIR, "-p", PORT, "-U", "postgres", "-d", db, "-c", sql]);
  return r.status === 0 ? null : r.stderr;
}
function tool(args, db, label, env = {}) {
  return sh("bash", ["scripts/db-backup.sh", ...args], {
    input: label + "\n",
    env: { ...process.env, DATABASE_URL: url(db), BACKUP_DIR: WORK, ...env },
  });
}
function freshTarget(db) {
  psql("postgres", `drop database if exists ${db}`);
  psql("postgres", `create database ${db}`);
  const r = sh("bash", ["tests/support/test-db.sh", "stubs"], { env: { ...process.env, TESTDB_NAME: db } });
  assert.equal(r.status, 0, r.stderr);
}
const tableCount = (db) => Number(psql(db, "select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r'"));
// anon/authenticated/public privileges on every public table + function (the security-relevant ACL surface)
const publicSurface = (db) =>
  psql(db, `select coalesce(string_agg(x, ',' order by x), '') from (
     select 'T:' || c.relname || ':' || r as x from pg_class c, unnest(array['anon','authenticated']) r
      where c.relnamespace='public'::regnamespace and c.relkind='r' and has_table_privilege(r, c.oid, 'select,insert,update,delete')
     union all
     select 'F:' || p.oid::regprocedure || ':' || r from pg_proc p, unnest(array['anon','authenticated']) r
      where p.pronamespace='public'::regnamespace and has_function_privilege(r, p.oid, 'execute')) s`);

let dump;
before(() => {
  psql(SRC, "insert into app_environment(name) values ('test') on conflict do nothing");
  const r = tool(["backup", "rtsrc"], SRC, "rtsrc");
  assert.equal(r.status, 0, r.stderr);
  dump = fs.readdirSync(WORK).filter((f) => f.endsWith(".dump")).map((f) => path.join(WORK, f))[0];
  assert.ok(dump && fs.existsSync(dump + ".manifest"));
  assert.equal(fs.statSync(dump).mode & 0o077, 0, "backup must be private (0600)");
});

after(() => {
  fs.rmSync(WORK, { recursive: true, force: true }); // synthetic dump: always removed, even if the DB is gone
  for (const db of TARGETS) psql("postgres", `drop database if exists ${db}`);
});

test("REPRODUCES the original defect: the old restore procedure left functions callable by anon", () => {
  freshTarget("rt_legacy");
  const r = sh("pg_restore", ["--no-owner", "--no-privileges", "-d", url("rt_legacy"), dump]);
  // (the old procedure ignored errors such as 'schema public already exists')
  assert.ok(tableCount("rt_legacy") > 0);
  assert.equal(
    psql("rt_legacy", "select has_function_privilege('anon', 'public.create_booking_v2(text,text,numeric,integer,date,time,text,text,text,uuid,text,integer,integer,integer)', 'execute')"),
    "t",
    "old procedure: anon can execute the booking function (the bug)"
  );
  assert.notEqual(publicSurface("rt_legacy"), "");
});

test("new restore: data, constraints, indexes and safe permissions in one validated transaction", () => {
  freshTarget("rt_ok");
  const r = tool(["restore", dump, "rt_ok"], "rt_ok", "rt_ok");
  assert.equal(r.status, 0, r.stderr + r.stdout);
  // data identical
  for (const t of ["bookings", "barbers", "blocked_slots", "app_environment", "app_schema_version"]) {
    assert.equal(psql("rt_ok", `select count(*) from public.${t}`), psql(SRC, `select count(*) from public.${t}`), t);
  }
  assert.equal(
    psql("rt_ok", "select string_agg(ref || status || client_name, ',' order by ref) from bookings"),
    psql(SRC, "select string_agg(ref || status || client_name, ',' order by ref) from bookings")
  );
  // constraints (incl. NOT VALID state) and indexes identical to the source
  const cons = "select string_agg(conname || ':' || convalidated, ',' order by conname) from pg_constraint where connamespace='public'::regnamespace";
  assert.equal(psql("rt_ok", cons), psql(SRC, cons));
  const idx = "select string_agg(indexname, ',' order by indexname) from pg_indexes where schemaname='public'";
  assert.equal(psql("rt_ok", idx), psql(SRC, idx));
  // no anon/authenticated surface at all; RLS on everywhere; extensions out of public
  assert.equal(publicSurface("rt_ok"), "");
  assert.equal(psql("rt_ok", "select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity"), "0");
  assert.equal(psql("rt_ok", "select count(*) from pg_extension where extname in ('btree_gist','pgcrypto') and extnamespace='public'::regnamespace"), "0");
  // behaviour: anon is refused, service_role works (booking + conflict + session RPC)
  assert.match(psqlErr("rt_ok", "set role anon; select count(*) from public.bookings") || "", /permission denied/);
  assert.match(psqlErr("rt_ok", "set role anon; select public.app_environment_name()") || "", /permission denied/);
  assert.match(psqlErr("rt_ok", "set role authenticated; select public.admin_session_validate('x', 1, 1)") || "", /permission denied/);
  const d = psql("rt_ok", "select (now() at time zone 'Africa/Tunis')::date + 9");
  const book = (time) =>
    JSON.parse(psql("rt_ok", `set role service_role; select public.create_booking_v2('achref','Hjema',8,30,'${d}','${time}','Synthetic Restore','21620000077','',null,null,10,600,0)`));
  assert.equal(book("10:00").ok, true);
  assert.equal(book("10:00").code, "SLOT_TAKEN");
  // the legacy (pre-v2) booking function is NOT re-enabled by a restore
  assert.equal(psql("rt_ok", "select has_function_privilege('service_role', 'public.create_booking(text,text,numeric,integer,date,time,text,text,text)', 'execute')"), "f");
  // preflight security checks pass on the restored copy
  const pf = JSON.parse(psql("rt_ok", "select public.release_preflight('pre-deploy')"));
  for (const c of pf.checks.filter((c) => /function|RLS|policies|extension|schema_version|label/.test(c.check))) assert.equal(c.ok, true, c.check);
});

test("injected failure after the data load: everything rolled back, target still empty, non-zero exit", () => {
  freshTarget("rt_fault");
  const r = tool(["restore", dump, "rt_fault"], "rt_fault", "rt_fault", { DB_RESTORE_TEST_FAULT: "after-data" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /ÉCHEC/);
  assert.equal(tableCount("rt_fault"), 0);
});

test("permission step missing: validation catches the unsafe state BEFORE commit (fail closed)", () => {
  freshTarget("rt_noperm");
  const r = tool(["restore", dump, "rt_noperm"], "rt_noperm", "rt_noperm", { DB_RESTORE_TEST_FAULT: "skip-permissions" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /VALIDATION/);
  assert.equal(tableCount("rt_noperm"), 0);
});

test("populated target is never overwritten; corrupted or unlisted dumps are refused", () => {
  const before = psql(SRC, "select count(*) from bookings");
  const r = tool(["restore", dump, SRC], SRC, SRC);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /jamais d'écrasement/);
  assert.equal(psql(SRC, "select count(*) from bookings"), before);

  freshTarget("rt_corrupt");
  const bad = path.join(WORK, "corrupt.dump");
  const buf = fs.readFileSync(dump);
  buf[buf.length - 10] ^= 0xff;
  fs.writeFileSync(bad, buf);
  fs.copyFileSync(dump + ".manifest", bad + ".manifest");
  const r2 = tool(["restore", bad, "rt_corrupt"], "rt_corrupt", "rt_corrupt");
  assert.notEqual(r2.status, 0);
  assert.match(r2.stderr, /SHA-256/);
  fs.rmSync(bad + ".manifest");
  const r3 = tool(["restore", bad, "rt_corrupt"], "rt_corrupt", "rt_corrupt");
  assert.notEqual(r3.status, 0);
  assert.match(r3.stderr, /manifeste absent/);
  assert.equal(tableCount("rt_corrupt"), 0);
});

test("wrong confirmation label aborts before touching the target", () => {
  freshTarget("rt_fault");
  const r = tool(["restore", dump, "rt_fault"], "rt_fault", "not-the-label");
  assert.notEqual(r.status, 0);
  assert.equal(tableCount("rt_fault"), 0);
});
