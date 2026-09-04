create extension if not exists pgcrypto;

create table if not exists public.kitchen_dashboard_meals (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner')),
  dish text not null,
  time text not null,
  created_at timestamptz not null default now(),
  unique (day, slot)
);

create table if not exists public.kitchen_dashboard_shopping_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.kitchen_dashboard_reminders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due_at timestamptz not null,
  recurrence text,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.kitchen_dashboard_family_notes (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  pinned boolean not null default false,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.kitchen_dashboard_timers (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  ends_at timestamptz not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_kitchen_dashboard_shopping_open on public.kitchen_dashboard_shopping_items (completed, created_at desc);
create index if not exists idx_kitchen_dashboard_reminders_due on public.kitchen_dashboard_reminders (completed, due_at);
create index if not exists idx_kitchen_dashboard_notes_priority on public.kitchen_dashboard_family_notes (completed, pinned desc, created_at desc);
create index if not exists idx_kitchen_dashboard_timers_ends on public.kitchen_dashboard_timers (completed, ends_at);

alter table public.kitchen_dashboard_meals enable row level security;
alter table public.kitchen_dashboard_shopping_items enable row level security;
alter table public.kitchen_dashboard_reminders enable row level security;
alter table public.kitchen_dashboard_family_notes enable row level security;
alter table public.kitchen_dashboard_timers enable row level security;

revoke all on public.kitchen_dashboard_meals from anon, authenticated;
revoke all on public.kitchen_dashboard_shopping_items from anon, authenticated;
revoke all on public.kitchen_dashboard_reminders from anon, authenticated;
revoke all on public.kitchen_dashboard_family_notes from anon, authenticated;
revoke all on public.kitchen_dashboard_timers from anon, authenticated;

grant all on public.kitchen_dashboard_meals to service_role;
grant all on public.kitchen_dashboard_shopping_items to service_role;
grant all on public.kitchen_dashboard_reminders to service_role;
grant all on public.kitchen_dashboard_family_notes to service_role;
grant all on public.kitchen_dashboard_timers to service_role;

notify pgrst, 'reload schema';
