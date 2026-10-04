-- =========================================================================
-- 3EBCHI STYLE — Validation d'une restauration (exécutée AVANT le COMMIT)
-- -------------------------------------------------------------------------
-- Appelé par scripts/db-backup.sh restore, dans la même transaction que les
-- données et supabase/permissions.sql. La moindre anomalie lève une exception
-- => ROLLBACK complet : la base cible reste vide, rien n'a jamais été visible
-- par l'API, et le script se termine en erreur.
-- Attend une table temporaire _restore_expected(tbl, n) remplie par le script
-- à partir du manifeste de la sauvegarde.
-- =========================================================================
do $$
declare
  v text;
  v_n bigint;
  e record;
begin
  -- 1. Volumétrie : chaque table contient exactement le nombre de lignes de la sauvegarde.
  for e in select tbl, n from _restore_expected loop
    if to_regclass(format('public.%I', e.tbl)) is null then
      raise exception 'VALIDATION : table public.% absente après restauration', e.tbl;
    end if;
    execute format('select count(*) from public.%I', e.tbl) into v_n;
    if v_n <> e.n then
      raise exception 'VALIDATION : public.% contient % lignes, % attendues', e.tbl, v_n, e.n;
    end if;
  end loop;

  -- 2. Version de schéma attendue.
  if to_regclass('public.app_schema_version') is null
     or not exists (select 1 from public.app_schema_version where version = '20261004120000') then
    raise exception 'VALIDATION : sauvegarde antérieure à la migration 20261004120000 (non prise en charge par cette restauration).';
  end if;

  -- 3. Aucun accès des rôles publics aux tables / fonctions.
  select string_agg(c.relname, ', ') into v from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
     and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
       or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete,truncate,references,trigger'));
  if v is not null then raise exception 'VALIDATION : tables accessibles à anon/authenticated : %', v; end if;

  select string_agg(p.oid::regprocedure::text, ', ') into v from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if v is not null then raise exception 'VALIDATION : fonctions exécutables par anon/authenticated : %', v; end if;

  -- 4. RLS partout, aucune politique.
  select string_agg(c.relname, ', ') into v from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity;
  if v is not null then raise exception 'VALIDATION : RLS désactivée sur : %', v; end if;
  if exists (select 1 from pg_policies where schemaname = 'public') then
    raise exception 'VALIDATION : politiques RLS inattendues dans public';
  end if;

  -- 5. Le serveur garde l'accès nécessaire.
  if not has_table_privilege('service_role', 'public.bookings', 'select,insert,update')
     or not has_function_privilege('service_role', 'public.create_booking_v2(text,text,numeric,integer,date,time,text,text,text,uuid,text,integer,integer,integer)', 'execute')
     or not has_function_privilege('service_role', 'public.admin_session_validate(text,integer,integer)', 'execute') then
    raise exception 'VALIDATION : droits du serveur (service_role) incomplets';
  end if;

  -- 6. Intégrité : contrainte anti-chevauchement, déclencheur, extensions hors public.
  if not exists (select 1 from pg_constraint where conname = 'bookings_no_overlap' and conrelid = 'public.bookings'::regclass) then
    raise exception 'VALIDATION : contrainte bookings_no_overlap absente';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_compute_booking_slot' and tgrelid = 'public.bookings'::regclass) then
    raise exception 'VALIDATION : déclencheur trg_compute_booking_slot absent';
  end if;
  if exists (select 1 from pg_extension where extname in ('btree_gist', 'pgcrypto') and extnamespace = 'public'::regnamespace) then
    raise exception 'VALIDATION : extension dans le schéma public';
  end if;

  -- 7. Chevauchement impossible dans les données restaurées (contrôle direct).
  select count(*) into v_n from public.bookings a join public.bookings b
    on a.barber = b.barber and a.id < b.id and a.slot && b.slot
   where a.status = 'confirmed' and b.status = 'confirmed';
  if v_n > 0 then raise exception 'VALIDATION : % paires de réservations confirmées se chevauchent', v_n; end if;

  raise notice 'VALIDATION OK : données, droits, RLS, contraintes et extensions conformes.';
end $$;
