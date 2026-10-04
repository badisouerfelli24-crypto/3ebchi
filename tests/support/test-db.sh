#!/usr/bin/env bash
# =========================================================================
# TEST-ONLY disposable PostgreSQL cluster for 3ebchi-style.
#   tests/support/test-db.sh up        -> initdb + start (Unix socket only, no TCP)
#   tests/support/test-db.sh stubs     -> stub Supabase roles/default privileges only (empty DB)
#   tests/support/test-db.sh baseline  -> stub Supabase roles + supabase/migration.sql
#   tests/support/test-db.sh migrate   -> apply supabase/migrations/*.sql in order
#   tests/support/test-db.sh psql ...  -> psql into the test DB
#   tests/support/test-db.sh down      -> stop + delete the cluster directory
#
# It NEVER connects to a remote database: everything goes through the Unix
# socket directory $TESTDB_DIR. Requires PostgreSQL 16 server binaries.
# =========================================================================
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TESTDB_DIR="${TESTDB_DIR:?set TESTDB_DIR to a scratch directory (it will be created and later deleted)}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${TESTDB_PORT:-55432}"
DB="${TESTDB_NAME:-app_test}"

as_pg() {
  # initdb/pg_ctl refuse to run as root: use the postgres OS user when needed.
  if [ "$(id -u)" = "0" ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi
}

open_perms() {
  # the postgres OS user must be able to traverse the scratch path
  local d="$TESTDB_DIR"
  while [ "$d" != "/" ]; do chmod o+x "$d" 2>/dev/null || true; d="$(dirname "$d")"; done
}

psql_db() { psql -X -q -h "$TESTDB_DIR" -p "$PORT" -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"; }

case "${1:-}" in
  up)
    mkdir -p "$TESTDB_DIR"
    [ "$(id -u)" = "0" ] && chown postgres "$TESTDB_DIR"
    open_perms
    as_pg "$PGBIN/initdb -D '$TESTDB_DIR/data' -A trust -U postgres >/dev/null"
    as_pg "$PGBIN/pg_ctl -D '$TESTDB_DIR/data' -o \"-p $PORT -k '$TESTDB_DIR' -c listen_addresses=''\" -l '$TESTDB_DIR/log' -w start >/dev/null"
    psql -X -q -h "$TESTDB_DIR" -p "$PORT" -U postgres -d postgres -c "create database $DB"
    echo "test db up: socket=$TESTDB_DIR port=$PORT db=$DB"
    ;;
  stubs|baseline)
    # Stub the Supabase API roles and default privileges (approximation of a
    # hosted project: anon/authenticated get table grants, RLS decides).
    psql_db -c "do \$\$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
    end \$\$;
    create schema if not exists extensions;
    grant usage on schema public, extensions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;"
    if [ "$1" = "stubs" ]; then echo "supabase role stubs ready in $DB"; exit 0; fi
    psql_db -f "$REPO/supabase/migration.sql"
    # dashboard migration (already applied on production): no_show, outcome_at, push tables
    [ -f "$REPO/supabase/migration_dashboard.sql" ] && psql_db -f "$REPO/supabase/migration_dashboard.sql"
    echo "baseline schema applied"
    ;;
  migrate)
    for f in "$REPO"/supabase/migrations/*.sql; do
      psql_db -f "$f"
      echo "applied $(basename "$f")"
    done
    ;;
  psql)
    shift
    psql_db "$@"
    ;;
  down)
    open_perms
    if [ -f "$TESTDB_DIR/data/postmaster.pid" ]; then
      as_pg "$PGBIN/pg_ctl -D '$TESTDB_DIR/data' -m fast -w stop >/dev/null" || kill -INT "$(head -1 "$TESTDB_DIR/data/postmaster.pid")" || true
    fi
    rm -rf "$TESTDB_DIR"
    echo "test db removed"
    ;;
  *)
    echo "usage: TESTDB_DIR=... $0 up|stubs|baseline|migrate|psql|down" >&2
    exit 1
    ;;
esac
