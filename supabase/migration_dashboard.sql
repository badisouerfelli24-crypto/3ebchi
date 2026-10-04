-- =========================================================================
-- 3EBCHI STYLE 💈 — Migration "dashboard hajem" (à lancer APRÈS migration.sql)
-- À exécuter dans : Supabase Dashboard > SQL Editor > New query > Run
-- Additive et idempotente : ne supprime aucune donnée, peut être relancée.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) Issue d'une réservation : ajoute 'no_show' (client jamais venu).
--    confirmed = en attente · done = hjema faite · cancelled · no_show
-- -------------------------------------------------------------------------
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings
  add constraint bookings_status_check
  check (status in ('confirmed', 'done', 'cancelled', 'no_show'));

-- Quand l'issue a été posée (null tant que la réservation est en attente).
alter table public.bookings add column if not exists outcome_at timestamptz;

-- Stats "toute la boutique" : filtre par date sans barbier.
create index if not exists bookings_date_idx on public.bookings (date);

-- -------------------------------------------------------------------------
-- 2) Abonnements Web Push (un par appareil / navigateur d'un barbier).
-- -------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  barber     text not null references public.barbers(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_barber_idx
  on public.push_subscriptions (barber);

-- -------------------------------------------------------------------------
-- 3) Préférences de notification.
--    muted_team : (owner uniquement) barbiers de l'équipe dont il ne veut
--    plus recevoir les nouvelles réservations.
-- -------------------------------------------------------------------------
create table if not exists public.notification_prefs (
  barber     text primary key references public.barbers(id) on delete cascade,
  muted_team text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- SÉCURITÉ : RLS activé, aucune policy publique (même règle que le reste).
-- -------------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;
