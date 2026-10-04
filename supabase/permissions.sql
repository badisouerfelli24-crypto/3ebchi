-- =========================================================================
-- 3EBCHI STYLE — État de droits CANONIQUE du schéma public (version 20261004120000)
-- -------------------------------------------------------------------------
-- Rejouable à volonté. Utilisé OBLIGATOIREMENT par scripts/db-backup.sh restore,
-- dans la même transaction que la restauration (une sauvegarde est restaurée
-- sans ses droits, puis ce fichier impose l'état attendu, puis
-- supabase/restore-validate.sql le vérifie avant COMMIT).
--
-- Règle : anon / authenticated (clés publiques de l'API Supabase) n'ont AUCUN
-- accès ; seul service_role (le serveur Next.js) lit/écrit et appelle les
-- fonctions nécessaires à la NOUVELLE application. L'ancienne fonction
-- create_booking (sans les contrôles v2) n'est volontairement PAS ré-autorisée.
-- Doit rester identique à l'état produit par supabase/migration.sql +
-- supabase/migrations/20261004120000_security_hardening.sql (vérifié par
-- tests/db/restore.test.mjs).
-- =========================================================================
do $$
declare
  t record;
  f record;
  required text[] := array[
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
  r text;
begin
  -- Tables : RLS partout, aucun droit pour les rôles publics, droits du serveur.
  for t in select c.oid::regclass as rel from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') loop
    execute format('alter table %s enable row level security', t.rel);
    execute format('revoke all on table %s from public, anon, authenticated', t.rel);
    execute format('grant select, insert, update, delete on table %s to service_role', t.rel);
  end loop;
  for t in select c.oid::regclass as rel from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm', 'S') loop
    execute format('revoke all on %s from public, anon, authenticated', t.rel);
  end loop;

  -- Fonctions : plus rien d'exécutable par public/anon/authenticated…
  for f in select p.oid::regprocedure as fn from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.fn);
  end loop;
  -- …et uniquement la liste nécessaire pour service_role.
  foreach r in array required loop
    if to_regprocedure(r) is null then
      raise exception 'Fonction requise absente après restauration : %', r;
    end if;
    execute format('grant execute on function %s to service_role', r);
  end loop;
  if to_regprocedure('public.create_booking(text,text,numeric,integer,date,time,text,text,text)') is not null then
    execute 'revoke execute on function public.create_booking(text,text,numeric,integer,date,time,text,text,text) from service_role';
  end if;
end $$;
