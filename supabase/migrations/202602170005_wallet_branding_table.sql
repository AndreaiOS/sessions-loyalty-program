-- Venue-level wallet card branding used by the web wallet landing page and card studio.

create table if not exists public.wallet_branding (
  venue_id text primary key,
  brand_name text not null default 'Sessions Rewards',
  hero_text text not null default 'Scan in kiosk to earn points and redeem rewards.',
  logo_url text,
  primary_color text not null default '#182230',
  accent_color text not null default '#0f766e',
  support_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (primary_color ~ '^#(?:[0-9A-Fa-f]{3}){1,2}$'),
  check (accent_color ~ '^#(?:[0-9A-Fa-f]{3}){1,2}$')
);

create index if not exists wallet_branding_updated_at_idx
  on public.wallet_branding (updated_at desc);

drop trigger if exists set_updated_at_wallet_branding on public.wallet_branding;
create trigger set_updated_at_wallet_branding
before update on public.wallet_branding
for each row execute function public.set_updated_at();
