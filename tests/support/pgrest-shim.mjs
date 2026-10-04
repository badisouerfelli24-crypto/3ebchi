#!/usr/bin/env node
/* =========================================================================
   TEST-ONLY PostgREST subset over a LOCAL disposable PostgreSQL.
   -------------------------------------------------------------------------
   Purpose: let the real Next.js route handlers (which use supabase-js over
   HTTP) run against a real local database during integration / browser
   tests, because PostgREST/Docker are not available in the test machine.

   Safety:
   - Only connects through `psql` to the Unix-socket cluster given by
     PGHOST/PGPORT/PGDATABASE (must be a local socket directory). It refuses
     to start if PGHOST looks like a network host.
   - Every statement runs as the stub role `service_role` (what the server's
     secret key does on Supabase). Anonymous Data-API behaviour is tested
     separately with `set role anon` directly in SQL.
   - Supports only what this app uses: GET with eq/neq/gte/lte/gt/lt/is/in
     filters + select + order + limit, POST/PATCH/DELETE on tables, and
     POST /rest/v1/rpc/<fn> with named JSON arguments.

   This is an EMULATION. It is not proof of identical hosted PostgREST
   behaviour (headers, error codes, role switching via JWT). See
   docs/audits/REMEDIATION_REPORT.md for the limitations.
   ========================================================================= */

import http from "node:http";
import { spawn } from "node:child_process";

const PORT = Number(process.env.SHIM_PORT || 54321);
const PGHOST = process.env.PGHOST || "";
if (!PGHOST.startsWith("/")) {
  console.error("pgrest-shim: PGHOST must be a local Unix-socket directory (absolute path). Refusing to start.");
  process.exit(2);
}
const PSQL = process.env.PSQL || "psql";
let failNext = Number(process.env.SHIM_FAIL_EVERY || 0); // >0 => simulate DB outage for every request
const IDENT = /^[a-z_][a-z0-9_]*$/;

function lit(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function filterSql(col, raw) {
  if (!IDENT.test(col)) throw new Error(`bad column ${col}`);
  const m = /^(eq|neq|gte|lte|gt|lt|is|in)\.(.*)$/s.exec(raw);
  if (!m) throw new Error(`bad filter ${col}=${raw}`);
  const [, op, val] = m;
  const ops = { eq: "=", neq: "<>", gte: ">=", lte: "<=", gt: ">", lt: "<" };
  if (op === "is") return `${col} is ${val === "null" ? "null" : val === "true" ? "true" : "false"}`;
  if (op === "in") {
    const items = val.replace(/^\(|\)$/g, "").split(",").map((s) => lit(s.replace(/^"|"$/g, "")));
    return `${col} in (${items.join(",")})`;
  }
  return `${col} ${ops[op]} ${lit(val)}`;
}

function runSql(sql) {
  return new Promise((resolve) => {
    const p = spawn(PSQL, ["-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1", "-c", "\\set VERBOSITY verbose", "-c", "set role service_role", "-c", sql], {
      env: { ...process.env, PGCONNECT_TIMEOUT: "5" },
    });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, out: out.trim(), err }));
  });
}

function pgError(err) {
  const m = /ERROR:\s+([0-9A-Z]{5}):\s+(.*)/.exec(err);
  const code = m ? m[1] : "XX000";
  const message = m ? m[2].trim() : err.trim().split("\n")[0];
  const status = code === "P0001" ? 400 : code === "23505" ? 409 : code === "42501" ? 403 : code.startsWith("22") || code.startsWith("23") ? 400 : 500;
  return { status, body: { code, message, details: null, hint: null } };
}

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  try {
    if (failNext > 0) return send(res, 503, { code: "PGRST000", message: "simulated database outage" });
    const url = new URL(req.url, "http://shim");
    let body = "";
    for await (const c of req) body += c;
    const json = body ? JSON.parse(body) : undefined;

    const rpc = /^\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)$/.exec(url.pathname);
    if (rpc) {
      const args = Object.entries(json || {}).map(([k, v]) => {
        if (!IDENT.test(k)) throw new Error("bad arg");
        return `${k} => ${lit(v)}`;
      });
      const r = await runSql(`select coalesce(to_json(public.${rpc[1]}(${args.join(", ")})), 'null'::json)`);
      if (r.code !== 0) {
        const e = pgError(r.err);
        return send(res, e.status, e.body);
      }
      return send(res, 200, JSON.parse(r.out || "null"));
    }

    const tbl = /^\/rest\/v1\/([a-z_][a-z0-9_]*)$/.exec(url.pathname);
    if (!tbl) return send(res, 404, { message: "not found" });
    const table = `public.${tbl[1]}`;
    const where = [];
    let select = "*";
    let order = "";
    let limit = "";
    for (const [k, v] of url.searchParams) {
      if (k === "select") {
        const cols = v.split(",").map((c) => c.trim());
        if (!cols.every((c) => c === "*" || IDENT.test(c))) throw new Error("bad select");
        select = cols.join(", ");
      } else if (k === "order") {
        order =
          " order by " +
          v
            .split(",")
            .map((o) => {
              const [c, dir] = o.split(".");
              if (!IDENT.test(c)) throw new Error("bad order");
              return `${c} ${dir === "desc" ? "desc" : "asc"}`;
            })
            .join(", ");
      } else if (k === "limit") {
        limit = ` limit ${Number(v) | 0}`;
      } else if (k === "columns" || k === "on_conflict") {
        // ignored
      } else {
        where.push(filterSql(k, v));
      }
    }
    const w = where.length ? ` where ${where.join(" and ")}` : "";
    const single = (req.headers["accept"] || "").includes("vnd.pgrst.object");

    let sql;
    if (req.method === "GET") {
      sql = `select coalesce(json_agg(t), '[]'::json) from (select ${select} from ${table}${w}${order}${limit}) t`;
    } else if (req.method === "POST") {
      const rows = Array.isArray(json) ? json : [json];
      const cols = Object.keys(rows[0]);
      if (!cols.every((c) => IDENT.test(c))) throw new Error("bad insert col");
      const values = rows.map((r) => `(${cols.map((c) => lit(r[c])).join(", ")})`).join(", ");
      sql = `with ins as (insert into ${table} (${cols.join(", ")}) values ${values} returning *) select coalesce(json_agg(ins), '[]'::json) from ins`;
    } else if (req.method === "PATCH") {
      const sets = Object.entries(json).map(([c, v]) => {
        if (!IDENT.test(c)) throw new Error("bad set");
        return `${c} = ${lit(v)}`;
      });
      sql = `with up as (update ${table} set ${sets.join(", ")}${w} returning *) select coalesce(json_agg(up), '[]'::json) from up`;
    } else if (req.method === "DELETE") {
      sql = `with del as (delete from ${table}${w} returning *) select coalesce(json_agg(del), '[]'::json) from del`;
    } else {
      return send(res, 405, { message: "method" });
    }
    const r = await runSql(sql);
    if (r.code !== 0) {
      const e = pgError(r.err);
      return send(res, e.status, e.body);
    }
    const data = JSON.parse(r.out || "[]");
    if (req.method !== "GET" && !(req.headers["prefer"] || "").includes("return=representation")) return send(res, 201, undefined);
    if (single) {
      if (data.length !== 1) return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      return send(res, 200, data[0]);
    }
    return send(res, 200, data);
  } catch (e) {
    return send(res, 400, { code: "SHIM", message: String(e.message || e) });
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`pgrest-shim listening on 127.0.0.1:${PORT}`));
process.on("SIGUSR2", () => {
  failNext = failNext ? 0 : 1;
  console.log(`pgrest-shim outage simulation: ${failNext ? "ON" : "OFF"}`);
});
