-- =========================================================================
-- 3EBCHI STYLE 💈 — Migration Supabase (Postgres)
-- À exécuter dans : Supabase Dashboard > SQL Editor > New query > Run
-- Idempotent : peut être relancé sans danger.
-- =========================================================================

-- Extension nécessaire pour la contrainte d'exclusion anti-double-booking
create extension if not exists btree_gist;
create extension if not exists pgcrypto; -- gen_random_uuid()

-- -------------------------------------------------------------------------
-- TABLE : barbers (PIN haché en bcrypt, jamais en clair)
-- -------------------------------------------------------------------------
create table if not exists public.barbers (
  id        text primary key,            -- doit matcher config/site.ts (ex: '3ebchi')
  name      text not null,
  pin_hash  text,                        -- hash bcrypt (voir `npm run hash-pin`)
  is_owner  boolean not null default false,
  created_at timestamptz not null default now()
);

-- Barbiers par défaut (PIN à définir ensuite, voir README).
insert into public.barbers (id, name, is_owner) values
  ('3ebchi', '3EBCHI', true),
  ('achref', 'ACHREF', false),
  ('brag',   'BRAG',   false),
  ('imed',   'IMED',   false)
on conflict (id) do nothing;

-- -------------------------------------------------------------------------
-- TABLE : bookings
-- -------------------------------------------------------------------------
create table if not exists public.bookings (
  id           uuid primary key default gen_random_uuid(),
  barber       text not null references public.barbers(id),
  service      text not null,
  price        numeric not null,
  duration_min integer not null check (duration_min > 0),
  date         date not null,
  start_time   time not null,
  client_name  text not null,
  phone        text not null,
  note         text not null default '',
  status       text not null default 'confirmed'
                 check (status in ('confirmed','done','cancelled')),
  -- Intervalle de temps calculé automatiquement (fuseau Africa/Tunis)
  slot         tstzrange,
  created_at   timestamptz not null default now()
);

create index if not exists bookings_barber_date_idx
  on public.bookings (barber, date);

-- Trigger : calcule `slot` à partir de date + start_time + durée, en Tunis.
create or replace function public.compute_booking_slot()
returns trigger
language plpgsql
as $$
declare
  start_at timestamptz;
begin
  start_at := ((new.date::text || ' ' || new.start_time::text)::timestamp
               at time zone 'Africa/Tunis');
  new.slot := tstzrange(
    start_at,
    start_at + make_interval(mins => new.duration_min),
    '[)'
  );
  return new;
end;
$$;

drop trigger if exists trg_compute_booking_slot on public.bookings;
create trigger trg_compute_booking_slot
  before insert or update of date, start_time, duration_min
  on public.bookings
  for each row execute function public.compute_booking_slot();

-- CONTRAINTE ANTI-DOUBLE-BOOKING (niveau base de données) :
-- deux réservations 'confirmed' du MÊME barbier ne peuvent pas se chevaucher.
alter table public.bookings
  drop constraint if exists bookings_no_overlap;
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    barber with =,
    slot with &&
  ) where (status = 'confirmed');

-- -------------------------------------------------------------------------
-- TABLE : blocked_slots (pauses / absences posées par le barbier)
-- -------------------------------------------------------------------------
create table if not exists public.blocked_slots (
  id         uuid primary key default gen_random_uuid(),
  barber     text not null references public.barbers(id),
  date       date not null,
  start_time time not null,
  end_time   time not null,
  reason     text not null default '',
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists blocked_barber_date_idx
  on public.blocked_slots (barber, date);

-- -------------------------------------------------------------------------
-- RPC : création de réservation atomique + anti-conflit
-- Renvoie json { ok: true, id } ou lève l'exception 'SLOT_TAKEN'.
-- -------------------------------------------------------------------------
create or replace function public.create_booking(
  p_barber       text,
  p_service      text,
  p_price        numeric,
  p_duration_min integer,
  p_date         date,
  p_start_time   time,
  p_client_name  text,
  p_phone        text,
  p_note         text
)
returns json
language plpgsql
as $$
declare
  v_start timestamptz;
  v_end   timestamptz;
  v_id    uuid;
  v_block_count integer;
begin
  v_start := ((p_date::text || ' ' || p_start_time::text)::timestamp
              at time zone 'Africa/Tunis');
  v_end := v_start + make_interval(mins => p_duration_min);

  -- 1) Refuser si ça tombe sur un créneau bloqué (pause/absence) du barbier.
  select count(*) into v_block_count
  from public.blocked_slots b
  where b.barber = p_barber
    and b.date = p_date
    and tstzrange(
          ((b.date::text || ' ' || b.start_time::text)::timestamp at time zone 'Africa/Tunis'),
          ((b.date::text || ' ' || b.end_time::text)::timestamp   at time zone 'Africa/Tunis'),
          '[)'
        ) && tstzrange(v_start, v_end, '[)');

  if v_block_count > 0 then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end if;

  -- 2) Insertion. La contrainte d'exclusion gère la concurrence :
  --    si un autre client réserve le même créneau en même temps -> exception.
  begin
    insert into public.bookings
      (barber, service, price, duration_min, date, start_time,
       client_name, phone, note, status)
    values
      (p_barber, p_service, p_price, p_duration_min, p_date, p_start_time,
       p_client_name, p_phone, coalesce(p_note, ''), 'confirmed')
    returning id into v_id;
  exception
    when exclusion_violation then
      raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;

  return json_build_object('ok', true, 'id', v_id);
end;
$$;

-- -------------------------------------------------------------------------
-- SÉCURITÉ : RLS activé, aucune policy publique.
-- Seule la SERVICE ROLE KEY (côté serveur) peut lire/écrire.
-- -------------------------------------------------------------------------
alter table public.barbers       enable row level security;
alter table public.bookings      enable row level security;
alter table public.blocked_slots enable row level security;

-- (Pas de policy => tout accès anon/public est refusé. Le service_role
--  contourne la RLS, donc les routes API serveur fonctionnent normalement.)

-- -------------------------------------------------------------------------
-- DÉFINIR LES PIN (après `npm run hash-pin`) — exemple, à décommenter :
-- -------------------------------------------------------------------------
-- update public.barbers set pin_hash = '$2a$10$....' where id = '3ebchi';
-- update public.barbers set pin_hash = '$2a$10$....' where id = 'achref';
-- update public.barbers set pin_hash = '$2a$10$....' where id = 'brag';
-- update public.barbers set pin_hash = '$2a$10$....' where id = 'imed';
