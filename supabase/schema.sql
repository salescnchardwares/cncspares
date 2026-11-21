create table if not exists public.site_inquiries (
  id text primary key,
  created_at timestamptz not null default now(),
  record jsonb not null
);

create index if not exists site_inquiries_created_at_idx
  on public.site_inquiries (created_at desc);

create table if not exists public.site_spares (
  id text primary key,
  created_at timestamptz not null default now(),
  record jsonb not null
);

create index if not exists site_spares_created_at_idx
  on public.site_spares (created_at desc);

create table if not exists public.site_settings (
  id text primary key,
  updated_at timestamptz not null default now(),
  record jsonb not null
);
