-- =========================================================================
-- 3EBCHI STYLE — Nettoyage APRÈS la bascule vers la connexion par mot de passe
-- -------------------------------------------------------------------------
-- NE PAS exécuter avant que TOUTES ces conditions soient vraies :
--   1. la nouvelle application est déployée en production ;
--   2. le propriétaire s'est connecté avec son MOT DE PASSE sur la nouvelle
--      application (vérifié ci-dessous : il existe une session créée après la
--      pose de son mot de passe) ;
--   3. chaque barbier actif a un mot de passe (vérifié ci-dessous).
-- Ce fichier n'est volontairement PAS dans supabase/migrations/ : il ne doit
-- pas être appliqué automatiquement avec le schéma.
--
-- Effet :
--   - efface les anciens hash de PIN (pin_hash) : les anciens déploiements
--     Vercel encore joignables par leur URL ne peuvent plus ouvrir de session ;
--   - retire à service_role le droit d'appeler l'ancienne fonction
--     create_booking (sans les contrôles v2). La fonction est CONSERVÉE
--     (réversible : GRANT EXECUTE … TO service_role).
-- Aucune réservation, aucun barbier, aucun blocage n'est modifié.
-- Tout ou rien : la moindre condition non remplie annule l'ensemble.
-- =========================================================================
begin;
set local lock_timeout = '5s';

do $$
declare v_missing text; v_owner int; v_owner_sessions int;
begin
  if not exists (select 1 from public.app_schema_version where version = '20261004120000') then
    raise exception 'ARRÊT : migration 20261004120000 absente.';
  end if;
  select string_agg(id, ', ') into v_missing from public.barbers where active and password_hash is null;
  if v_missing is not null then
    raise exception 'ARRÊT : barbier(s) actif(s) sans mot de passe : %. Lance npm run set-password d''abord.', v_missing;
  end if;
  select count(*) into v_owner from public.barbers where is_owner and active and password_hash is not null;
  if v_owner <> 1 then
    raise exception 'ARRÊT : il faut exactement un propriétaire actif avec mot de passe (trouvé : %).', v_owner;
  end if;
  select count(*) into v_owner_sessions
    from public.admin_sessions s join public.barbers b on b.id = s.barber
   where b.is_owner and b.password_changed_at is not null and s.created_at >= b.password_changed_at;
  if v_owner_sessions = 0 then
    raise exception 'ARRÊT : aucune connexion du propriétaire par mot de passe sur la nouvelle application. Connecte-toi d''abord sur /barber.';
  end if;
end $$;

update public.barbers set pin_hash = null where pin_hash is not null;

do $$
begin
  if to_regprocedure('public.create_booking(text,text,numeric,integer,date,time,text,text,text)') is not null then
    revoke execute on function public.create_booking(text,text,numeric,integer,date,time,text,text,text) from service_role;
  end if;
end $$;

commit;

-- Contrôle final (doit renvoyer "ok": true) :
select public.release_preflight('post-cutover');
