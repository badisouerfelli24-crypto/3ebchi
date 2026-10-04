#!/usr/bin/env bash
# =========================================================================
# Sauvegarde / restauration de la BASE DE DONNÉES (schéma public de Supabase).
# Supabase Free n'a pas de sauvegarde automatique : à lancer depuis TON
# ordinateur, jamais en CI.
#
#   scripts/db-backup.sh backup   <label>             -> backups/<label>-<date>.dump (+ .manifest)
#   scripts/db-backup.sh verify   <fichier.dump>      -> contrôle hors ligne (intégrité + volumétrie)
#   scripts/db-backup.sh manifest <fichier.dump>      -> (re)crée le manifeste d'une sauvegarde
#   scripts/db-backup.sh restore  <fichier.dump> <label-cible>
#
# Windows : ce script est un script BASH. Il ne s'exécute PAS dans PowerShell.
# Utilise WSL (Ubuntu) avec le client PostgreSQL de version ≥ celle du serveur
# Supabase (ex. `sudo apt install postgresql-client-17` via le dépôt PGDG), voir
# docs/audits/PRODUCTION_READINESS.md.
#
# Sécurité :
#   - la chaîne de connexion vient de DATABASE_URL ou d'une saisie masquée ;
#     jamais en argument (historique du shell), jamais affichée ;
#   - il faut retaper le label de la cible pour confirmer ;
#   - sortie dans ./backups/ (ignoré par git), droits 600 ; ces fichiers
#     contiennent des données clients : à garder chiffrés, hors cloud partagé.
#
# Restauration SÛRE PAR CONSTRUCTION :
#   - refus si la cible contient déjà des tables dans public (jamais d'écrasement) ;
#   - intégrité de la sauvegarde vérifiée (SHA-256 du manifeste) ;
#   - données + droits canoniques (supabase/permissions.sql) + validation
#     (supabase/restore-validate.sql) dans UNE SEULE transaction : tant que la
#     validation n'a pas réussi, rien n'est visible par l'API Supabase ; à la
#     moindre erreur, ROLLBACK complet, la cible reste vide, code de sortie ≠ 0.
#
# Couvre : schéma public + données (tables, fonctions, contraintes, comptes,
# réservations, sessions, étiquette d'environnement).
# Ne couvre PAS : fichiers de public/ (photos, vidéos, frames : ils sont dans
# git), réglages Vercel/Supabase, variables d'environnement. Le site n'utilise
# pas Supabase Storage.
# =========================================================================
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
REPO="$(pwd)"

die() { echo "ERREUR : $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "commande $1 introuvable (installe le client PostgreSQL)"; }

ask_url() {
  if [ -z "${DATABASE_URL:-}" ]; then
    read -r -s -p "Chaîne de connexion Postgres (masquée) : " DATABASE_URL
    echo
  fi
  [ -n "$DATABASE_URL" ] || die "chaîne de connexion vide"
  export PGCONNECT_TIMEOUT=15
}

confirm() {
  read -r -p "Tape le label de la cible pour confirmer ($1) : " typed
  [ "$typed" = "$1" ] || die "annulé"
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# Nombre de lignes de chaque table, lu HORS LIGNE dans la sauvegarde elle-même
# (blocs COPY ; une ligne par enregistrement, les retours à la ligne sont échappés).
dump_counts() {
  local f="$1" tbl
  pg_restore --list "$f" | awk '$4=="TABLE" && $5=="DATA" && $6=="public" {print $7}' | sort -u | while read -r tbl; do
    printf '%s %s\n' "$tbl" "$(pg_restore --data-only --schema=public --table="$tbl" -f - "$f" \
      | awk '/^COPY /{c=1;next} /^\\\.$/{c=0;next} c{n++} END{print n+0}')"
  done
}

write_manifest() {
  local f="$1" m="$1.manifest"
  pg_restore --list "$f" >/dev/null || die "sauvegarde illisible : $f"
  {
    echo "sha256 $(sha256 "$f")"
    echo "created_utc $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "pg_restore $(pg_restore --version | sed 's/^.*) //')"
    dump_counts "$f" | sed 's/^/count /'
  } > "$m"
  chmod 600 "$m"
  echo "Manifeste : $m"
}

verify_dump() {
  local f="$1" m="$1.manifest"
  [ -f "$f" ] || die "fichier introuvable : $f"
  [ -f "$m" ] || die "manifeste absent ($m). Crée-le d'abord : $0 manifest \"$f\""
  [ "$(awk '$1=="sha256"{print $2}' "$m")" = "$(sha256 "$f")" ] || die "SHA-256 différent du manifeste : sauvegarde corrompue ou modifiée"
  diff <(awk '$1=="count"{print $2, $3}' "$m" | sort) <(dump_counts "$f" | sort) >/dev/null \
    || die "volumétrie de la sauvegarde différente du manifeste"
  pg_restore --list "$f" | grep -q "TABLE DATA public bookings" || die "la sauvegarde ne contient pas la table bookings"
  echo "Sauvegarde vérifiée : $(awk '$1=="count"{printf "%s=%s ", $2, $3}' "$m")"
}

mode="${1:-}"
case "$mode" in
  backup)
    need pg_dump; need pg_restore
    label="${2:?label requis (ex. production)}"
    ask_url
    confirm "$label"
    dir="${BACKUP_DIR:-backups}"
    mkdir -p "$dir" && chmod 700 "$dir"
    out="$dir/${label}-$(date -u +%Y%m%dT%H%M%SZ).dump"
    pg_dump --format=custom --no-owner --no-privileges --schema=public --file="$out" "$DATABASE_URL"
    chmod 600 "$out"
    write_manifest "$out"
    verify_dump "$out"
    echo "OK : $out ($(du -h "$out" | cut -f1))."
    ;;

  verify)
    need pg_restore
    verify_dump "${2:?fichier .dump requis}"
    ;;

  manifest)
    need pg_restore
    f="${2:?fichier .dump requis}"
    [ -f "$f" ] || die "fichier introuvable : $f"
    write_manifest "$f"
    ;;

  restore)
    need pg_restore; need psql
    file="${2:?fichier .dump requis}"
    label="${3:?label de la cible requis}"
    verify_dump "$file"
    ask_url
    confirm "$label"

    # Cible : connexion OK, rôles Supabase présents, schéma public VIDE.
    pre="$(psql "$DATABASE_URL" -X -tA -v ON_ERROR_STOP=1 -c "
      select (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','p','v','m'))
          || ' ' || (select count(*) from pg_roles where rolname in ('anon','authenticated','service_role'))")" \
      || die "connexion à la cible impossible"
    tables="${pre%% *}"; roles="${pre##* }"
    [ "$tables" = "0" ] || die "la cible contient déjà $tables table(s) dans public : restauration refusée (jamais d'écrasement). Restaure dans un projet Supabase NEUF."
    [ "$roles" = "3" ] || die "rôles anon/authenticated/service_role absents : la cible n'est pas un projet Supabase"

    work="$(mktemp -d)"
    trap 'rm -rf "$work"' EXIT   # le SQL généré contient des données clients
    pg_restore --list "$file" | grep -vE ' SCHEMA - public | COMMENT - SCHEMA public ' > "$work/list"
    pg_restore --no-owner --no-privileges --use-list="$work/list" -f "$work/data.sql" "$file" \
      || die "lecture de la sauvegarde impossible"

    {
      echo "set local lock_timeout = '10s';"
      echo "create schema if not exists extensions;"
      echo "create extension if not exists btree_gist with schema extensions;"
      echo "create extension if not exists pgcrypto with schema extensions;"
      echo "create temporary table _restore_expected (tbl text primary key, n bigint not null) on commit drop;"
      awk '$1=="count"{printf "insert into _restore_expected values (%c%s%c, %s);\n", 39, $2, 39, $3}' "$file.manifest"
    } > "$work/prologue.sql"
    : > "$work/fault.sql"
    if [ "${DB_RESTORE_TEST_FAULT:-}" = "after-data" ]; then
      echo "select 1/0; -- panne simulée (tests uniquement)" > "$work/fault.sql"
    elif [ "${DB_RESTORE_TEST_FAULT:-}" = "skip-permissions" ]; then
      echo "-- tests uniquement : droits canoniques NON appliqués" > "$work/perm.sql"
    fi
    [ -f "$work/perm.sql" ] || cp supabase/permissions.sql "$work/perm.sql"

    # UNE transaction (-1) : données, droits, validation. ON_ERROR_STOP => ROLLBACK.
    if psql "$DATABASE_URL" -X -q -1 -v ON_ERROR_STOP=1 \
         -f "$work/prologue.sql" -f "$work/data.sql" -f "$work/fault.sql" \
         -f "$work/perm.sql" -f "$REPO/supabase/restore-validate.sql"; then
      echo "Restauration validée et appliquée (données, droits, RLS, contraintes)."
      echo "Étiquette de cette base : $(psql "$DATABASE_URL" -X -tA -c 'select coalesce(public.app_environment_name(), '\''(aucune)'\'')')"
      echo "Si cette base ne remplace PAS la production, corrige l'étiquette (update public.app_environment set name = '...')."
      echo "Puis : select public.release_preflight('pre-deploy');"
    else
      echo "ÉCHEC : rien n'a été appliqué (transaction annulée). La cible est restée vide." >&2
      exit 1
    fi
    ;;

  *)
    echo "usage : $0 backup <label> | verify <fichier.dump> | manifest <fichier.dump> | restore <fichier.dump> <label-cible>" >&2
    exit 2
    ;;
esac
