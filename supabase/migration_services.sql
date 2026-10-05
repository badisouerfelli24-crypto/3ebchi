-- =========================================================================
-- 3EBCHI STYLE 💈 — Migration "services & prix modifiables" (après les autres)
-- Les services / packs / prix / durées se gèrent depuis /barber (onglet Prix,
-- réservé au owner 3EBCHI). Additive et idempotente.
-- =========================================================================

create table if not exists public.services (
  id           text primary key,
  name         text not null,
  sub          text not null default '',
  price        numeric not null check (price >= 0),
  duration_min integer not null check (duration_min between 5 and 480),
  kind         text not null check (kind in ('solo', 'pack')),
  parts        text[] not null default '{}',
  premium      boolean not null default false,
  sort         integer not null default 0,
  updated_at   timestamptz not null default now()
);

-- Valeurs de départ = celles de config/site.ts (rien n'est écrasé si déjà là).
insert into public.services (id, name, sub, price, duration_min, kind, parts, premium, sort) values
  ('hjema',          'Hjema',           'Coupe',                    8,  30, 'solo', '{}', false, 10),
  ('lahya',          'Lahya',           'Barbe',                    5,  15, 'solo', '{}', false, 20),
  ('brushing',       'Brushing',        'Coiffage',                 6,  15, 'solo', '{}', false, 30),
  ('pack3_complet',  'Pack 3 Complet',  'Hjema + Lahya + Brushing', 15, 60, 'pack', '{hjema,lahya,brushing}', false, 40),
  ('pack2_basic',    'Pack 2 Basic',    'Hjema + Lahya',            10, 45, 'pack', '{hjema,lahya}', false, 50),
  ('pack2_brushing', 'Pack 2 Brushing', 'Hjema + Brushing',         12, 45, 'pack', '{hjema,brushing}', false, 60),
  ('pack2_lahya',    'Pack 2 Lahya',    'Lahya + Brushing',         10, 30, 'pack', '{lahya,brushing}', false, 70),
  ('za9lamni',       'Za9lamni Pack',   'Produit + Hjema + Lahya',  80, 60, 'pack', '{}', true, 80)
on conflict (id) do nothing;

-- Même règle que le reste : RLS sans policy, seul le serveur (service role) y accède.
alter table public.services enable row level security;
