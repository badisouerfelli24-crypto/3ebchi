-- =========================================================================
-- 3EBCHI STYLE — Migration 2026-10-04 : durcissement sécurité / réservations
-- -------------------------------------------------------------------------
-- À exécuter APRÈS supabase/migration.sql (schéma de base).
-- Additive uniquement : aucune table supprimée, aucune donnée réécrite ou
-- effacée. Peut être relancée sans danger (idempotente).
--
-- Contenu :
--   0. Pré-contrôle non destructif (NOTICE des lignes incompatibles)
--   1. Comptes barbiers : mot de passe fort (hash scrypt calculé côté serveur),
--      compte actif/inactif, date de changement de mot de passe
--   2. Sessions admin révocables (hash SHA-256 du jeton, jamais le jeton brut)
--   3. Limiteur partagé (connexion + réservations) en base, borné et nettoyé
--   4. Réservation v2 : idempotence, plafond par téléphone OPTIONNEL (désactivé
--      par défaut), verrou par barbier
--      (corrige la course réservation/blocage), codes d'erreur sans exception
--   5. Blocages et changements de statut via fonctions atomiques
--   6. Contraintes CHECK (NOT VALID puis validation si possible)
--   7. Index justifiés par les nouvelles requêtes
--   8. Extensions hors du schéma public (si possible)
--   9. Droits : rien pour anon/authenticated, tout passe par service_role
--  10. Étiquette d'environnement de la base, version de schéma, pré-vol de
--      mise en production (lecture seule)
-- =========================================================================

-- Tout ou rien : si une instruction échoue, rien n'est appliqué (ROLLBACK).
-- Les verrous ne sont pas attendus indéfiniment : en cas de trafic bloquant,
-- la migration échoue proprement et peut être relancée.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- -------------------------------------------------------------------------
-- 0. PRÉ-CONTRÔLE (lecture seule) : signale, sans rien modifier, les lignes
--    existantes qui ne respecteraient pas les nouvelles contraintes.
-- -------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from public.bookings
   where price < 0 or duration_min not between 5 and 480
      or char_length(client_name) not between 2 and 60
      or phone !~ '^216[0-9]{8}$' or char_length(note) > 300
      or extract(second from start_time) <> 0 or date < date '2025-01-01';
  if n > 0 then
    raise notice 'PRÉ-CONTRÔLE : % réservation(s) existante(s) ne respectent pas les nouvelles contraintes. Elles sont CONSERVÉES ; les contraintes ne s''appliquent qu''aux nouvelles écritures tant qu''elles ne sont pas corrigées (voir docs/audits/RELEASE_CHECKLIST.md).', n;
  end if;
  select count(*) into n from public.blocked_slots
   where char_length(reason) > 120 or date < date '2025-01-01';
  if n > 0 then
    raise notice 'PRÉ-CONTRÔLE : % blocage(s) existant(s) incompatibles (conservés).', n;
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 1. COMPTES BARBIERS
-- -------------------------------------------------------------------------
alter table public.barbers add column if not exists password_hash text;
alter table public.barbers add column if not exists password_changed_at timestamptz;
alter table public.barbers add column if not exists active boolean not null default true;

-- Format attendu : scrypt$v=1$n=<N>,r=<r>,p=<p>$<sel base64url>$<hash base64url>
alter table public.barbers drop constraint if exists barbers_password_hash_format;
alter table public.barbers add constraint barbers_password_hash_format
  check (password_hash is null or password_hash ~ '^scrypt\$v=1\$n=[0-9]+,r=[0-9]+,p=[0-9]+\$[A-Za-z0-9_-]{16,}\$[A-Za-z0-9_-]{40,}$');

-- NB : l'ancienne colonne pin_hash (PIN 4 chiffres) n'est PLUS lue par
-- l'application. Elle est conservée (aucune suppression de données) ; voir la
-- checklist de mise en production pour la vider après la bascule.

-- -------------------------------------------------------------------------
-- 2. SESSIONS ADMIN (révocables côté serveur)
-- -------------------------------------------------------------------------
create table if not exists public.admin_sessions (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'), -- SHA-256 hex du jeton du cookie
  barber        text not null references public.barbers(id) on delete cascade,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz
);
create index if not exists admin_sessions_barber_active_idx
  on public.admin_sessions (barber) where revoked_at is null;
create index if not exists admin_sessions_expires_idx
  on public.admin_sessions (expires_at);

-- -------------------------------------------------------------------------
-- 3. LIMITEUR PARTAGÉ (toutes les instances serveur voient le même état)
--    Clés : 'login:acct:<barbier>', 'login:ip:<hmac>', 'book:ip:<hmac>'.
--    Aucune IP brute n'est stockée (HMAC calculé côté serveur).
-- -------------------------------------------------------------------------
create table if not exists public.rate_limits (
  key           text primary key check (char_length(key) <= 100),
  window_start  timestamptz not null default now(),
  hits          integer not null default 0,
  lock_level    integer not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);
create index if not exists rate_limits_updated_idx on public.rate_limits (updated_at);

-- Nettoyage borné (appelé de façon opportuniste, jamais en tâche de fond).
create or replace function public.security_housekeeping()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from public.rate_limits
   where ctid in (
     select ctid from public.rate_limits
      where updated_at < now() - interval '2 days'
        and (locked_until is null or locked_until < now())
      limit 500);
  delete from public.admin_sessions
   where ctid in (
     select ctid from public.admin_sessions
      where expires_at < now() - interval '7 days'
         or revoked_at < now() - interval '7 days'
      limit 500);
end;
$$;

-- Incrémente atomiquement une clé ; renvoie le nombre de secondes de blocage
-- (0 = autorisé). Verrou de ligne => pas de dépassement par requêtes parallèles.
create or replace function public.rate_limit_hit(
  p_key text, p_max integer, p_window_secs integer,
  p_lock_secs integer, p_lock_max_secs integer
)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r public.rate_limits%rowtype;
  v_now timestamptz := clock_timestamp();
  v_lock integer;
begin
  insert into public.rate_limits (key) values (p_key) on conflict (key) do nothing;
  select * into r from public.rate_limits where key = p_key for update;

  if r.locked_until is not null and r.locked_until > v_now then
    return greatest(1, ceil(extract(epoch from r.locked_until - v_now))::int);
  end if;

  -- fenêtre expirée => repart à zéro ; long calme => on oublie l'historique de blocage
  if r.window_start < v_now - make_interval(secs => p_window_secs) then
    r.hits := 0;
    r.window_start := v_now;
  end if;
  if r.updated_at < v_now - interval '24 hours' then
    r.lock_level := 0;
  end if;

  r.hits := r.hits + 1;
  if r.hits > p_max then
    r.lock_level := least(r.lock_level + 1, 10);
    v_lock := least(p_lock_secs * (2 ^ (r.lock_level - 1))::int, p_lock_max_secs);
    update public.rate_limits
       set hits = 0, window_start = v_now, lock_level = r.lock_level,
           locked_until = v_now + make_interval(secs => v_lock), updated_at = v_now
     where key = p_key;
    return v_lock;
  end if;

  update public.rate_limits
     set hits = r.hits, window_start = r.window_start, lock_level = r.lock_level,
         locked_until = null, updated_at = v_now
   where key = p_key;
  return 0;
end;
$$;

-- Début de tentative de connexion : compte PUIS adresse (ordre fixe => pas
-- d'interblocage). La tentative est comptée AVANT la vérification du mot de
-- passe, donc des requêtes simultanées ne peuvent pas dépasser le seuil.
create or replace function public.auth_login_begin(
  p_account_key text, p_ip_key text,
  p_account_max integer, p_ip_max integer, p_window_secs integer,
  p_lock_secs integer, p_lock_max_secs integer
)
returns json
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_a integer := 0;
  v_i integer := 0;
begin
  if random() < 0.05 then perform public.security_housekeeping(); end if;
  if p_account_key is not null then
    v_a := public.rate_limit_hit(p_account_key, p_account_max, p_window_secs, p_lock_secs, p_lock_max_secs);
  end if;
  if p_ip_key is not null then
    v_i := public.rate_limit_hit(p_ip_key, p_ip_max, p_window_secs, p_lock_secs, p_lock_max_secs);
  end if;
  return json_build_object('allowed', v_a = 0 and v_i = 0, 'retry_after', greatest(v_a, v_i));
end;
$$;

-- -------------------------------------------------------------------------
-- Sessions : création (après mot de passe valide), validation, révocation
-- -------------------------------------------------------------------------
create or replace function public.admin_session_create(
  p_barber text, p_token_hash text, p_ttl_secs integer,
  p_previous_token_hash text, p_account_key text, p_ip_key text
)
returns json
language plpgsql
set search_path = public, pg_temp
as $$
declare v_exp timestamptz := now() + make_interval(secs => p_ttl_secs);
begin
  -- anti-fixation : l'éventuel ancien jeton présenté est révoqué
  if p_previous_token_hash is not null then
    update public.admin_sessions set revoked_at = now()
     where token_hash = p_previous_token_hash and revoked_at is null;
  end if;
  insert into public.admin_sessions (token_hash, barber, expires_at)
  values (p_token_hash, p_barber, v_exp);
  -- succès : on remet le compteur du compte à zéro et on "rembourse" l'adresse
  if p_account_key is not null then
    delete from public.rate_limits where key = p_account_key;
  end if;
  if p_ip_key is not null then
    update public.rate_limits set hits = greatest(hits - 1, 0) where key = p_ip_key;
  end if;
  return json_build_object('expires_at', v_exp);
end;
$$;

create or replace function public.admin_session_validate(
  p_token_hash text, p_idle_secs integer, p_touch_secs integer
)
returns json
language plpgsql
set search_path = public, pg_temp
as $$
declare
  s record;
begin
  select a.id, a.barber, a.last_seen_at, b.is_owner
    into s
    from public.admin_sessions a
    join public.barbers b on b.id = a.barber
   where a.token_hash = p_token_hash
     and a.revoked_at is null
     and a.expires_at > now()
     and a.last_seen_at > now() - make_interval(secs => p_idle_secs)
     and b.active
     and b.password_hash is not null
     and (b.password_changed_at is null or a.created_at >= b.password_changed_at);
  if not found then
    return null;
  end if;
  -- mise à jour de "dernière activité" au plus une fois toutes les p_touch_secs
  if s.last_seen_at < now() - make_interval(secs => p_touch_secs) then
    update public.admin_sessions set last_seen_at = now() where id = s.id;
  end if;
  return json_build_object('barber', s.barber, 'is_owner', s.is_owner);
end;
$$;

create or replace function public.admin_session_revoke(p_token_hash text)
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.admin_sessions set revoked_at = now()
   where token_hash = p_token_hash and revoked_at is null;
$$;

-- Outil de maintenance (SQL Editor uniquement) : déconnecter partout un barbier.
create or replace function public.admin_sessions_revoke_all(p_barber text)
returns integer
language sql
set search_path = public, pg_temp
as $$
  with r as (
    update public.admin_sessions set revoked_at = now()
     where barber = p_barber and revoked_at is null returning 1)
  select count(*)::int from r;
$$;

-- -------------------------------------------------------------------------
-- 4. RÉSERVATION v2
-- -------------------------------------------------------------------------
alter table public.bookings add column if not exists request_key uuid;
create unique index if not exists bookings_request_key_key
  on public.bookings (request_key) where request_key is not null;
-- plafond par téléphone : compte des réservations confirmées à venir
create index if not exists bookings_phone_date_active_idx
  on public.bookings (phone, date) where status = 'confirmed';

create or replace function public.create_booking_v2(
  p_barber        text,
  p_service       text,
  p_price         numeric,
  p_duration_min  integer,
  p_date          date,
  p_start_time    time,
  p_client_name   text,
  p_phone         text,
  p_note          text,
  p_request_key   uuid,
  p_rate_key      text,
  p_rate_max      integer,
  p_rate_window_secs integer,
  p_phone_max_active integer
)
returns json
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Africa/Tunis')::date;
  v_start timestamptz;
  v_end   timestamptz;
  v_id    uuid;
  v_ref   text;
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_try   integer := 0;
  v_n     integer;
  v_rate  integer;
  v_constraint text;
  e record;
begin
  -- Garde-fous durables (le serveur applique déjà les règles d'horaires détaillées)
  if p_date < v_today or p_date > v_today + 366
     or p_duration_min not between 5 and 480 or p_price < 0
     or extract(second from p_start_time) <> 0 then
    return json_build_object('ok', false, 'code', 'VALIDATION');
  end if;

  -- Nettoyage borné et opportuniste des compteurs/sessions expirés (≤ 500 lignes),
  -- pour que la table du limiteur ne grossisse pas même sans connexion admin.
  if random() < 0.05 then perform public.security_housekeeping(); end if;

  -- Verrous transactionnels : téléphone puis barbier (ordre fixe).
  perform pg_advisory_xact_lock(31001, hashtext(p_phone));
  perform pg_advisory_xact_lock(31002, hashtext(p_barber));

  -- Idempotence : même clé => même réservation (ou refus si contenu différent)
  if p_request_key is not null then
    select id, ref, barber, date, start_time, phone, service into e
      from public.bookings where request_key = p_request_key;
    if found then
      if e.barber = p_barber and e.date = p_date and e.start_time = p_start_time
         and e.phone = p_phone and e.service = p_service then
        return json_build_object('ok', true, 'id', e.id, 'ref', e.ref, 'replay', true);
      end if;
      return json_build_object('ok', false, 'code', 'IDEMPOTENCY_MISMATCH');
    end if;
  end if;

  -- Limiteur partagé par adresse (HMAC). Compté APRÈS le contrôle
  -- d'idempotence : un rejeu de la même réservation ne consomme pas de quota.
  -- Les requêtes refusées en amont par la validation de l'API n'arrivent pas ici.
  if p_rate_key is not null then
    v_rate := public.rate_limit_hit(p_rate_key, p_rate_max, p_rate_window_secs, p_rate_window_secs, p_rate_window_secs * 4);
    if v_rate > 0 then
      return json_build_object('ok', false, 'code', 'RATE_LIMIT', 'retry_after', v_rate);
    end if;
  end if;

  -- Plafond OPTIONNEL de réservations confirmées à venir par numéro.
  -- null ou 0 = désactivé (défaut de l'application) : une même personne peut
  -- réserver pour plusieurs membres de sa famille, comme avant.
  if coalesce(p_phone_max_active, 0) > 0 then
    select count(*) into v_n from public.bookings
     where phone = p_phone and status = 'confirmed' and date >= v_today;
    if v_n >= p_phone_max_active then
      return json_build_object('ok', false, 'code', 'PHONE_LIMIT');
    end if;
  end if;

  v_start := ((p_date::text || ' ' || p_start_time::text)::timestamp at time zone 'Africa/Tunis');
  v_end := v_start + make_interval(mins => p_duration_min);

  -- Blocage du barbier (même verrou que create_block => plus de course)
  if exists (
    select 1 from public.blocked_slots b
     where b.barber = p_barber and b.date = p_date
       and tstzrange(
             ((b.date::text || ' ' || b.start_time::text)::timestamp at time zone 'Africa/Tunis'),
             ((b.date::text || ' ' || b.end_time::text)::timestamp   at time zone 'Africa/Tunis'),
             '[)') && tstzrange(v_start, v_end, '[)')
  ) then
    return json_build_object('ok', false, 'code', 'SLOT_TAKEN');
  end if;

  loop
    v_try := v_try + 1;
    v_ref := '3B-';
    for i in 1..6 loop
      v_ref := v_ref || substr(v_chars, 1 + floor(random() * 32)::int, 1);
    end loop;
    begin
      insert into public.bookings
        (barber, service, price, duration_min, date, start_time,
         client_name, phone, note, status, ref, request_key)
      values
        (p_barber, p_service, p_price, p_duration_min, p_date, p_start_time,
         p_client_name, p_phone, coalesce(p_note, ''), 'confirmed', v_ref, p_request_key)
      returning id into v_id;
      exit;
    exception
      when exclusion_violation then
        return json_build_object('ok', false, 'code', 'SLOT_TAKEN');
      when check_violation then
        return json_build_object('ok', false, 'code', 'VALIDATION');
      when unique_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint = 'bookings_request_key_key' then
          -- même clé utilisée en parallèle pour un autre barbier
          return json_build_object('ok', false, 'code', 'IDEMPOTENCY_MISMATCH');
        end if;
        if v_try >= 8 then raise; end if;
    end;
  end loop;

  return json_build_object('ok', true, 'id', v_id, 'ref', v_ref);
end;
$$;

-- -------------------------------------------------------------------------
-- 5. BLOCAGES ET STATUTS (atomiques, autorisation vérifiée dans la requête)
-- -------------------------------------------------------------------------
create or replace function public.create_block(
  p_barber text, p_date date, p_start time, p_end time, p_reason text
)
returns json
language plpgsql
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(31002, hashtext(p_barber)); -- même verrou que create_booking_v2
  insert into public.blocked_slots (barber, date, start_time, end_time, reason)
  values (p_barber, p_date, p_start, p_end, coalesce(p_reason, ''))
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.delete_block(
  p_id uuid, p_actor text, p_actor_is_owner boolean
)
returns json
language sql
set search_path = public, pg_temp
as $$
  with d as (
    delete from public.blocked_slots
     where id = p_id and (barber = p_actor or p_actor_is_owner)
    returning 1)
  select json_build_object('ok', exists (select 1 from d));
$$;

-- Seules transitions existantes dans l'interface : confirmed -> done / cancelled.
-- "Introuvable" et "pas à toi" donnent la même réponse (pas d'oracle d'existence).
create or replace function public.set_booking_status(
  p_id uuid, p_actor text, p_actor_is_owner boolean, p_status text
)
returns json
language sql
set search_path = public, pg_temp
as $$
  with u as (
    update public.bookings set status = p_status
     where id = p_id
       and status = 'confirmed'
       and p_status in ('done', 'cancelled')
       and (barber = p_actor or p_actor_is_owner)
    returning 1)
  select json_build_object('ok', exists (select 1 from u));
$$;

-- -------------------------------------------------------------------------
-- 6. CONTRAINTES CHECK — ajoutées NOT VALID (n'échouent jamais sur les
--    données existantes) puis validées seulement si tout est conforme.
-- -------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in select * from (values
    ('bookings', 'bookings_price_nonneg',      'check (price >= 0)'),
    ('bookings', 'bookings_duration_range',    'check (duration_min between 5 and 480)'),
    ('bookings', 'bookings_name_len',          'check (char_length(client_name) between 2 and 60)'),
    ('bookings', 'bookings_phone_format',      'check (phone ~ ''^216[0-9]{8}$'')'),
    ('bookings', 'bookings_note_len',          'check (char_length(note) <= 300)'),
    ('bookings', 'bookings_start_whole_minute','check (extract(second from start_time) = 0)'),
    ('bookings', 'bookings_date_sane',         'check (date >= date ''2025-01-01'')'),
    ('blocked_slots', 'blocked_reason_len',    'check (char_length(reason) <= 120)'),
    ('blocked_slots', 'blocked_date_sane',     'check (date >= date ''2025-01-01'')')
  ) as t(tbl, name, def)
  loop
    if not exists (select 1 from pg_constraint where conname = c.name) then
      execute format('alter table public.%I add constraint %I %s not valid', c.tbl, c.name, c.def);
    end if;
    begin
      execute format('alter table public.%I validate constraint %I', c.tbl, c.name);
    exception when check_violation then
      raise notice 'Contrainte % laissée NOT VALID : des lignes existantes ne la respectent pas (conservées).', c.name;
    end;
  end loop;
end $$;

-- -------------------------------------------------------------------------
-- 8. EXTENSIONS hors de "public" (sinon leurs fonctions sont exposées par l'API)
-- -------------------------------------------------------------------------
create schema if not exists extensions;
do $$
declare x record;
begin
  for x in select extname from pg_extension
            where extname in ('btree_gist', 'pgcrypto')
              and extnamespace = 'public'::regnamespace
  loop
    begin
      execute format('alter extension %I set schema extensions', x.extname);
      raise notice 'Extension % déplacée vers le schéma extensions.', x.extname;
    exception when others then
      raise notice 'Extension % non déplacée (%). À vérifier dans le tableau de bord.', x.extname, sqlerrm;
    end;
  end loop;
end $$;

-- -------------------------------------------------------------------------
-- 9. DROITS : nouvelles tables et fonctions inaccessibles à anon/authenticated
-- -------------------------------------------------------------------------
alter table public.admin_sessions enable row level security;
alter table public.rate_limits    enable row level security;
revoke all on public.admin_sessions, public.rate_limits from public, anon, authenticated;
grant all on public.admin_sessions, public.rate_limits to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.security_housekeeping()',
    'public.rate_limit_hit(text,integer,integer,integer,integer)',
    'public.auth_login_begin(text,text,integer,integer,integer,integer,integer)',
    'public.admin_session_create(text,text,integer,text,text,text)',
    'public.admin_session_validate(text,integer,integer)',
    'public.admin_session_revoke(text)',
    'public.admin_sessions_revoke_all(text)',
    'public.create_booking_v2(text,text,numeric,integer,date,time,text,text,text,uuid,text,integer,integer,integer)',
    'public.create_block(text,date,time,time,text)',
    'public.delete_block(uuid,text,boolean)',
    'public.set_booking_status(uuid,text,boolean,text)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- -------------------------------------------------------------------------
-- 10. ÉTIQUETTE D'ENVIRONNEMENT, VERSION, PRÉ-VOL
-- -------------------------------------------------------------------------
-- Étiquette posée À LA MAIN, une seule fois, dans le SQL Editor du projet
-- concerné (jamais par cette migration) :
--   insert into public.app_environment (name) values ('production');  -- projet de prod
--   insert into public.app_environment (name) values ('preview');     -- projet de preview
-- Le serveur refuse toute requête si l'étiquette manque ou diffère de
-- DATA_ENVIRONMENT (lib/supabase.ts). Changer d'étiquette exige un UPDATE explicite.
create table if not exists public.app_environment (
  singleton   boolean primary key default true check (singleton),
  name        text not null check (name in ('production', 'preview', 'development', 'test')),
  labelled_at timestamptz not null default now()
);

create or replace function public.app_environment_name()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select name from public.app_environment where singleton;
$$;

create table if not exists public.app_schema_version (
  version    text primary key,
  applied_at timestamptz not null default now()
);

-- Pré-vol de mise en production : LECTURE SEULE, ne renvoie ni hash, ni secret,
-- ni donnée client (uniquement des noms d'objets, des identifiants de barbiers
-- et des compteurs). p_phase :
--   'pre-deploy'   : avant de déployer la nouvelle application
--   'post-cutover' : après la bascule (ancien PIN effacé, ancienne fonction retirée)
create or replace function public.release_preflight(p_phase text default 'pre-deploy')
returns json
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  checks json[] := '{}';
  v_ok boolean := true;
  v_list text;
  v_n integer;
  v_required text[] := array[
    'public.security_housekeeping()',
    'public.rate_limit_hit(text,integer,integer,integer,integer)',
    'public.auth_login_begin(text,text,integer,integer,integer,integer,integer)',
    'public.admin_session_create(text,text,integer,text,text,text)',
    'public.admin_session_validate(text,integer,integer)',
    'public.admin_session_revoke(text)',
    'public.admin_sessions_revoke_all(text)',
    'public.create_booking_v2(text,text,numeric,integer,date,time,text,text,text,uuid,text,integer,integer,integer)',
    'public.create_block(text,date,time,time,text)',
    'public.delete_block(uuid,text,boolean)',
    'public.set_booking_status(uuid,text,boolean,text)',
    'public.app_environment_name()',
    'public.release_preflight(text)'];
  f text;
begin
  if p_phase not in ('pre-deploy', 'post-cutover') then
    raise exception 'p_phase doit valoir pre-deploy ou post-cutover';
  end if;

  -- 1. version de schéma
  v_n := (select count(*) from public.app_schema_version where version = '20261004120000');
  checks := checks || json_build_object('check', 'schema_version 20261004120000', 'ok', v_n = 1);
  v_ok := v_ok and v_n = 1;

  -- 2. étiquette de la base
  v_list := public.app_environment_name();
  checks := checks || json_build_object('check', 'app_environment label set', 'ok', v_list is not null, 'detail', coalesce(v_list, 'MISSING'));
  v_ok := v_ok and v_list is not null;

  -- 3. fonctions requises présentes et exécutables par service_role
  v_list := null;
  foreach f in array v_required loop
    if to_regprocedure(f) is null then
      v_list := concat_ws(', ', v_list, f || ' (missing)');
    elsif not has_function_privilege('service_role', to_regprocedure(f), 'execute') then
      v_list := concat_ws(', ', v_list, f || ' (no service_role execute)');
    end if;
  end loop;
  checks := checks || json_build_object('check', 'required functions callable by service_role', 'ok', v_list is null, 'detail', v_list);
  v_ok := v_ok and v_list is null;

  -- 4. aucune fonction de public exécutable par anon / authenticated
  select string_agg(p.oid::regprocedure::text, ', ' order by 1) into v_list
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  checks := checks || json_build_object('check', 'no public function executable by anon/authenticated', 'ok', v_list is null, 'detail', v_list);
  v_ok := v_ok and v_list is null;

  -- 5. RLS active sur toutes les tables de public
  select string_agg(c.relname, ', ' order by 1) into v_list
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity;
  checks := checks || json_build_object('check', 'RLS enabled on every public table', 'ok', v_list is null, 'detail', v_list);
  v_ok := v_ok and v_list is null;

  -- 6. aucune politique RLS (tout passe par le serveur)
  select string_agg(tablename || '.' || policyname, ', ' order by 1) into v_list from pg_policies where schemaname = 'public';
  checks := checks || json_build_object('check', 'no RLS policies in public', 'ok', v_list is null, 'detail', v_list);
  v_ok := v_ok and v_list is null;

  -- 7. extensions hors de public
  select string_agg(extname, ', ' order by 1) into v_list
    from pg_extension where extname in ('btree_gist', 'pgcrypto') and extnamespace = 'public'::regnamespace;
  checks := checks || json_build_object('check', 'btree_gist/pgcrypto not in public', 'ok', v_list is null, 'detail', v_list);
  v_ok := v_ok and v_list is null;

  -- 8. comptes : chaque barbier actif a un mot de passe ; exactement un propriétaire utilisable
  select string_agg(id, ', ' order by id) into v_list from public.barbers where active and password_hash is null;
  checks := checks || json_build_object('check', 'every active barber has a password', 'ok', v_list is null, 'detail', coalesce('missing: ' || v_list, null));
  v_ok := v_ok and v_list is null;
  v_n := (select count(*) from public.barbers where is_owner and active and password_hash is not null);
  checks := checks || json_build_object('check', 'exactly one usable owner account', 'ok', v_n = 1, 'detail', v_n);
  v_ok := v_ok and v_n = 1;

  -- 9. contraintes laissées NOT VALID (information : données historiques à revoir)
  select string_agg(conname, ', ' order by 1) into v_list
    from pg_constraint where connamespace = 'public'::regnamespace and not convalidated;
  checks := checks || json_build_object('check', 'constraints not yet validated on historical rows (info)', 'ok', true, 'detail', v_list);

  -- 10. phase post-bascule : plus aucun PIN, ancienne fonction de réservation retirée
  v_n := (select count(*) from public.barbers where pin_hash is not null);
  if p_phase = 'post-cutover' then
    checks := checks || json_build_object('check', 'legacy PIN hashes cleared', 'ok', v_n = 0, 'detail', v_n);
    v_ok := v_ok and v_n = 0;
    v_list := case when to_regprocedure('public.create_booking(text,text,numeric,integer,date,time,text,text,text)') is not null
                    and has_function_privilege('service_role', to_regprocedure('public.create_booking(text,text,numeric,integer,date,time,text,text,text)'), 'execute')
                   then 'still executable' end;
    checks := checks || json_build_object('check', 'legacy create_booking not callable by service_role', 'ok', v_list is null, 'detail', v_list);
    v_ok := v_ok and v_list is null;
  else
    checks := checks || json_build_object('check', 'legacy PIN hashes still present (expected before cutover, info)', 'ok', true, 'detail', v_n);
  end if;

  return json_build_object('ok', v_ok, 'phase', p_phase, 'checks', array_to_json(checks));
end;
$$;

alter table public.app_environment    enable row level security;
alter table public.app_schema_version enable row level security;
revoke all on public.app_environment, public.app_schema_version from public, anon, authenticated;
grant all on public.app_environment, public.app_schema_version to service_role;
do $$
declare f text;
begin
  foreach f in array array['public.app_environment_name()', 'public.release_preflight(text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Dernière instruction : la version n'est enregistrée que si tout a réussi.
insert into public.app_schema_version (version) values ('20261004120000') on conflict (version) do nothing;

commit;

-- PostgREST (API Supabase) : recharge le cache de schéma pour exposer les nouvelles fonctions.
notify pgrst, 'reload schema';
