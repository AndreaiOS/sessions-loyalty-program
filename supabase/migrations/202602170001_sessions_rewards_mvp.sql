-- Sessions Rewards MVP schema, policies, and transactional RPCs

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text,
  phone_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'disabled', 'deleted')),
  created_at timestamptz not null default now()
);

create table if not exists public.customer_venues (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  venue_id text not null,
  points_balance integer not null default 0 check (points_balance >= 0),
  rewards_balance integer not null default 0 check (rewards_balance >= 0),
  membership_status text not null default 'none' check (membership_status in ('none', 'active', 'trialing', 'past_due', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, venue_id)
);

create table if not exists public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  customer_id uuid not null references public.customers(id) on delete cascade,
  venue_id text not null,
  order_id text,
  points_delta integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.rewards_ledger (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  customer_id uuid not null references public.customers(id) on delete cascade,
  venue_id text not null,
  reward_delta integer not null,
  reason text not null,
  order_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  venue_id text,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  status text not null check (status in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.passes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  venue_id text not null,
  pass_type text not null check (pass_type in ('apple', 'google', 'unissued')),
  pass_token text not null unique,
  provider_pass_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pass_type, provider_pass_id),
  unique (customer_id, venue_id, pass_type)
);

create table if not exists public.order_links (
  id uuid primary key default gen_random_uuid(),
  order_id text,
  cart_session_id text,
  customer_id uuid references public.customers(id) on delete set null,
  venue_id text not null,
  applied_reward_count integer not null default 0 check (applied_reward_count >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid_no_customer', 'paid_earned', 'reward_redeemed', 'failed', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (order_id is not null or cart_session_id is not null)
);

create table if not exists public.reward_holds (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text unique,
  cart_session_id text not null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  venue_id text not null,
  source_venue_id text not null,
  reward_count integer not null check (reward_count > 0),
  status text not null default 'active' check (status in ('active', 'consumed', 'released', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  venue_id text not null,
  customer_id uuid references public.customers(id) on delete set null,
  order_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pass_update_jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  venue_id text not null,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'processing', 'failed', 'sent')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists customers_created_at_idx on public.customers (created_at);

create index if not exists customer_venues_venue_membership_idx on public.customer_venues (venue_id, membership_status);
create index if not exists customer_venues_customer_idx on public.customer_venues (customer_id);

create index if not exists points_ledger_customer_venue_created_idx on public.points_ledger (customer_id, venue_id, created_at desc);
create index if not exists points_ledger_order_id_idx on public.points_ledger (order_id);

create index if not exists rewards_ledger_customer_venue_created_idx on public.rewards_ledger (customer_id, venue_id, created_at desc);
create index if not exists rewards_ledger_order_id_idx on public.rewards_ledger (order_id);

create index if not exists memberships_customer_status_idx on public.memberships (customer_id, status);
create index if not exists memberships_period_end_idx on public.memberships (current_period_end);

create index if not exists passes_customer_venue_idx on public.passes (customer_id, venue_id);

create unique index if not exists order_links_order_venue_unique_idx
  on public.order_links (order_id, venue_id)
  where order_id is not null;

create unique index if not exists order_links_cart_venue_unique_idx
  on public.order_links (cart_session_id, venue_id)
  where cart_session_id is not null;

create index if not exists order_links_customer_created_idx on public.order_links (customer_id, created_at desc);
create index if not exists order_links_status_idx on public.order_links (status);

create unique index if not exists reward_holds_active_unique_idx
  on public.reward_holds (cart_session_id, customer_id, venue_id)
  where status = 'active';

create index if not exists reward_holds_expires_at_idx on public.reward_holds (expires_at);

create index if not exists analytics_events_name_created_idx on public.analytics_events (event_name, created_at desc);
create index if not exists analytics_events_venue_created_idx on public.analytics_events (venue_id, created_at desc);

create index if not exists pass_update_jobs_status_next_attempt_idx on public.pass_update_jobs (status, next_attempt_at);

-- ---------------------------------------------------------------------------
-- Utility functions
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.loyalty_currency_exponent(p_currency text)
returns integer
language sql
immutable
as $$
  select case upper(coalesce(p_currency, 'GBP'))
    when 'BIF' then 0
    when 'CLP' then 0
    when 'DJF' then 0
    when 'GNF' then 0
    when 'JPY' then 0
    when 'KMF' then 0
    when 'KRW' then 0
    when 'MGA' then 0
    when 'PYG' then 0
    when 'RWF' then 0
    when 'UGX' then 0
    when 'VND' then 0
    when 'VUV' then 0
    when 'XAF' then 0
    when 'XOF' then 0
    when 'XPF' then 0
    else 2
  end;
$$;

create or replace function public.loyalty_current_membership_status(
  p_customer_id uuid,
  p_venue_id text
)
returns text
language sql
stable
as $$
  with m as (
    select status
    from public.memberships
    where customer_id = p_customer_id
      and status in ('active', 'trialing', 'past_due')
      and (venue_id is null or venue_id = p_venue_id)
    order by
      case status when 'active' then 1 when 'trialing' then 2 when 'past_due' then 3 else 9 end,
      current_period_end desc nulls last
    limit 1
  )
  select coalesce((select status from m), 'none');
$$;

create or replace function public.loyalty_membership_multiplier(
  p_customer_id uuid,
  p_venue_id text
)
returns integer
language sql
stable
as $$
  select case
    when exists (
      select 1
      from public.memberships
      where customer_id = p_customer_id
        and status in ('active', 'trialing', 'past_due')
        and (venue_id is null or venue_id = p_venue_id)
    ) then 2
    else 1
  end;
$$;

create or replace function public.app_has_venue_access(target_venue text)
returns boolean
language sql
stable
as $$
  select case
    when coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'support_admin' then true
    when target_venue is null then false
    else coalesce((auth.jwt() -> 'app_metadata' -> 'venues') ? target_venue, false)
  end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

drop trigger if exists set_updated_at_customer_venues on public.customer_venues;
create trigger set_updated_at_customer_venues
before update on public.customer_venues
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_memberships on public.memberships;
create trigger set_updated_at_memberships
before update on public.memberships
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_passes on public.passes;
create trigger set_updated_at_passes
before update on public.passes
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_order_links on public.order_links;
create trigger set_updated_at_order_links
before update on public.order_links
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_reward_holds on public.reward_holds;
create trigger set_updated_at_reward_holds
before update on public.reward_holds
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_pass_update_jobs on public.pass_update_jobs;
create trigger set_updated_at_pass_update_jobs
before update on public.pass_update_jobs
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Transactional RPC functions
-- ---------------------------------------------------------------------------

create or replace function public.loyalty_upsert_customer_by_phone(
  p_phone_e164 text,
  p_phone_hash text,
  p_venue_id text
)
returns table (
  customer_id uuid,
  is_new_customer boolean,
  points_balance integer,
  rewards_balance integer,
  membership_status text,
  wallet_token text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_inserted boolean := false;
  v_membership_status text;
  v_wallet_token text;
begin
  if p_phone_hash is null or length(trim(p_phone_hash)) = 0 then
    raise exception 'phone_hash_required';
  end if;

  select c.id into v_customer_id
  from public.customers c
  where c.phone_hash = p_phone_hash;

  if v_customer_id is null then
    insert into public.customers (phone_e164, phone_hash)
    values (p_phone_e164, p_phone_hash)
    returning id into v_customer_id;

    v_inserted := true;
  else
    update public.customers c
    set phone_e164 = coalesce(p_phone_e164, c.phone_e164)
    where c.id = v_customer_id;
  end if;

  insert into public.customer_venues (customer_id, venue_id)
  values (v_customer_id, p_venue_id)
  on conflict on constraint customer_venues_customer_id_venue_id_key do nothing;

  v_membership_status := public.loyalty_current_membership_status(v_customer_id, p_venue_id);

  update public.customer_venues cv
  set membership_status = v_membership_status
  where cv.customer_id = v_customer_id
    and cv.venue_id = p_venue_id;

  insert into public.passes (customer_id, venue_id, pass_type, pass_token, provider_pass_id)
  values (
    v_customer_id,
    p_venue_id,
    'unissued',
    encode(extensions.gen_random_bytes(24), 'hex'),
    format('pending:%s', encode(extensions.gen_random_bytes(8), 'hex'))
  )
  on conflict on constraint passes_customer_id_venue_id_pass_type_key do nothing;

  select p.pass_token into v_wallet_token
  from public.passes p
  where p.customer_id = v_customer_id
    and p.venue_id = p_venue_id
    and p.pass_type = 'unissued'
  limit 1;

  return query
  select
    cv.customer_id,
    v_inserted,
    cv.points_balance,
    case
      when p_venue_id = 'global' then cv.rewards_balance
      else cv.rewards_balance + coalesce(gv.rewards_balance, 0)
    end as rewards_balance,
    cv.membership_status,
    v_wallet_token
  from public.customer_venues cv
  left join public.customer_venues gv
    on gv.customer_id = cv.customer_id
   and gv.venue_id = 'global'
  where cv.customer_id = v_customer_id
    and cv.venue_id = p_venue_id;
end;
$$;

create or replace function public.loyalty_resolve_customer_from_pass_token(
  p_pass_token text,
  p_venue_id text
)
returns table (
  customer_id uuid,
  points_balance integer,
  rewards_balance integer,
  membership_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_membership_status text;
begin
  select p.customer_id into v_customer_id
  from public.passes p
  where p.pass_token = p_pass_token
    and p.venue_id = p_venue_id
  limit 1;

  if v_customer_id is null then
    return;
  end if;

  insert into public.customer_venues (customer_id, venue_id)
  values (v_customer_id, p_venue_id)
  on conflict on constraint customer_venues_customer_id_venue_id_key do nothing;

  v_membership_status := public.loyalty_current_membership_status(v_customer_id, p_venue_id);

  update public.customer_venues cv
  set membership_status = v_membership_status
  where cv.customer_id = v_customer_id
    and cv.venue_id = p_venue_id;

  return query
  select
    cv.customer_id,
    cv.points_balance,
    case
      when p_venue_id = 'global' then cv.rewards_balance
      else cv.rewards_balance + coalesce(gv.rewards_balance, 0)
    end as rewards_balance,
    cv.membership_status
  from public.customer_venues cv
  left join public.customer_venues gv
    on gv.customer_id = cv.customer_id
   and gv.venue_id = 'global'
  where cv.customer_id = v_customer_id
    and cv.venue_id = p_venue_id;
end;
$$;

create or replace function public.loyalty_get_balance(
  p_customer_id uuid,
  p_venue_id text
)
returns table (
  customer_id uuid,
  points_balance integer,
  rewards_balance integer,
  membership_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership_status text;
begin
  insert into public.customer_venues (customer_id, venue_id)
  values (p_customer_id, p_venue_id)
  on conflict on constraint customer_venues_customer_id_venue_id_key do nothing;

  v_membership_status := public.loyalty_current_membership_status(p_customer_id, p_venue_id);

  update public.customer_venues cv
  set membership_status = v_membership_status
  where cv.customer_id = p_customer_id
    and cv.venue_id = p_venue_id;

  return query
  select
    cv.customer_id,
    cv.points_balance,
    case
      when p_venue_id = 'global' then cv.rewards_balance
      else cv.rewards_balance + coalesce(gv.rewards_balance, 0)
    end as rewards_balance,
    cv.membership_status
  from public.customer_venues cv
  left join public.customer_venues gv
    on gv.customer_id = cv.customer_id
   and gv.venue_id = 'global'
  where cv.customer_id = p_customer_id
    and cv.venue_id = p_venue_id;
end;
$$;

create or replace function public.loyalty_attach_customer_to_cart_session(
  p_cart_session_id text,
  p_customer_id uuid,
  p_venue_id text
)
returns table (
  cart_session_id text,
  customer_id uuid,
  venue_id text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.order_links (cart_session_id, customer_id, venue_id, status)
  values (p_cart_session_id, p_customer_id, p_venue_id, 'pending')
  on conflict (cart_session_id, venue_id)
    where cart_session_id is not null
  do update
    set customer_id = excluded.customer_id,
        status = excluded.status,
        updated_at = now();

  return query
  select ol.cart_session_id, ol.customer_id, ol.venue_id, ol.status
  from public.order_links ol
  where ol.cart_session_id = p_cart_session_id
    and ol.venue_id = p_venue_id;
end;
$$;

create or replace function public.loyalty_apply_reward_to_cart(
  p_cart_session_id text,
  p_customer_id uuid,
  p_venue_id text,
  p_reward_count integer,
  p_idempotency_key text,
  p_reward_discount_minor integer,
  p_hold_minutes integer default 15
)
returns table (
  hold_id uuid,
  approved boolean,
  expires_at timestamptz,
  discount_minor integer,
  rewards_balance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold_id uuid;
  v_expires_at timestamptz;
  v_venue_rewards integer := 0;
  v_global_rewards integer := 0;
  v_total_rewards integer := 0;
  v_source_venue_id text;
begin
  if p_reward_count is null or p_reward_count <= 0 then
    raise exception 'invalid_reward_count';
  end if;

  if p_reward_count > 1 then
    raise exception 'mvp_max_one_reward';
  end if;

  if p_idempotency_key is not null then
    select rh.id, rh.expires_at into v_hold_id, v_expires_at
    from public.reward_holds rh
    where rh.idempotency_key = p_idempotency_key
    limit 1;

    if v_hold_id is not null then
      select cv.rewards_balance into v_venue_rewards
      from public.customer_venues cv
      where cv.customer_id = p_customer_id
        and cv.venue_id = p_venue_id;

      if p_venue_id <> 'global' then
        select cv.rewards_balance into v_global_rewards
        from public.customer_venues cv
        where cv.customer_id = p_customer_id
          and cv.venue_id = 'global';
      end if;

      v_total_rewards := coalesce(v_venue_rewards, 0) + coalesce(v_global_rewards, 0);

      return query
      select v_hold_id, true, v_expires_at, (p_reward_discount_minor * p_reward_count), v_total_rewards;
      return;
    end if;
  end if;

  select rh.id, rh.expires_at into v_hold_id, v_expires_at
  from public.reward_holds rh
  where rh.cart_session_id = p_cart_session_id
    and rh.customer_id = p_customer_id
    and rh.venue_id = p_venue_id
    and rh.status = 'active'
  limit 1;

  if v_hold_id is not null then
    select cv.rewards_balance into v_venue_rewards
    from public.customer_venues cv
    where cv.customer_id = p_customer_id
      and cv.venue_id = p_venue_id;

    if p_venue_id <> 'global' then
      select cv.rewards_balance into v_global_rewards
      from public.customer_venues cv
      where cv.customer_id = p_customer_id
        and cv.venue_id = 'global';
    end if;

    v_total_rewards := coalesce(v_venue_rewards, 0) + coalesce(v_global_rewards, 0);

    return query
    select v_hold_id, true, v_expires_at, (p_reward_discount_minor * p_reward_count), v_total_rewards;
    return;
  end if;

  insert into public.customer_venues (customer_id, venue_id)
  values (p_customer_id, p_venue_id)
  on conflict on constraint customer_venues_customer_id_venue_id_key do nothing;

  select rewards_balance into v_venue_rewards
  from public.customer_venues
  where customer_id = p_customer_id
    and venue_id = p_venue_id
  for update;

  if p_venue_id <> 'global' then
    insert into public.customer_venues (customer_id, venue_id)
    values (p_customer_id, 'global')
    on conflict on constraint customer_venues_customer_id_venue_id_key do nothing;

    select rewards_balance into v_global_rewards
    from public.customer_venues
    where customer_id = p_customer_id
      and venue_id = 'global'
    for update;
  end if;

  if coalesce(v_venue_rewards, 0) >= p_reward_count then
    v_source_venue_id := p_venue_id;
  elsif p_venue_id <> 'global' and coalesce(v_global_rewards, 0) >= p_reward_count then
    v_source_venue_id := 'global';
  else
    raise exception 'insufficient_rewards';
  end if;

  v_expires_at := now() + make_interval(mins => p_hold_minutes);

  insert into public.reward_holds (
    idempotency_key,
    cart_session_id,
    customer_id,
    venue_id,
    source_venue_id,
    reward_count,
    status,
    expires_at
  )
  values (
    p_idempotency_key,
    p_cart_session_id,
    p_customer_id,
    p_venue_id,
    v_source_venue_id,
    p_reward_count,
    'active',
    v_expires_at
  )
  returning id into v_hold_id;

  insert into public.order_links (
    cart_session_id,
    customer_id,
    venue_id,
    applied_reward_count,
    status
  )
  values (
    p_cart_session_id,
    p_customer_id,
    p_venue_id,
    p_reward_count,
    'pending'
  )
  on conflict (cart_session_id, venue_id)
    where cart_session_id is not null
  do update
    set customer_id = excluded.customer_id,
        applied_reward_count = excluded.applied_reward_count,
        status = excluded.status,
        updated_at = now();

  v_total_rewards := coalesce(v_venue_rewards, 0) + coalesce(v_global_rewards, 0);

  return query
  select v_hold_id, true, v_expires_at, (p_reward_discount_minor * p_reward_count), v_total_rewards;
end;
$$;

create or replace function public.loyalty_earn_points_from_paid_order(
  p_order_id text,
  p_venue_id text,
  p_payment_event_id text,
  p_total_minor bigint,
  p_currency text,
  p_paid_at timestamptz,
  p_customer_id uuid default null,
  p_cart_session_id text default null
)
returns table (
  customer_id uuid,
  points_earned integer,
  rewards_converted integer,
  new_points_balance integer,
  new_rewards_balance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_points_earned integer := 0;
  v_rewards_converted integer := 0;
  v_points_balance integer := 0;
  v_rewards_balance integer := 0;
  v_membership_multiplier integer := 1;
  v_points_base integer := 0;
  v_exponent integer := 2;
  v_earn_key text := format('earn:%s:%s', p_order_id, p_payment_event_id);
  v_convert_points_key text := format('earn-convert-points:%s:%s', p_order_id, p_payment_event_id);
  v_convert_reward_key text := format('earn-convert-rewards:%s:%s', p_order_id, p_payment_event_id);
  v_rows_updated integer := 0;
begin
  select pl.customer_id, pl.points_delta
    into v_customer_id, v_points_earned
  from public.points_ledger pl
  where pl.idempotency_key = v_earn_key
  limit 1;

  if v_customer_id is not null then
    select coalesce(rl.reward_delta, 0)
      into v_rewards_converted
    from public.rewards_ledger rl
    where rl.idempotency_key = v_convert_reward_key
    limit 1;

    select cv.points_balance, cv.rewards_balance
      into v_points_balance, v_rewards_balance
    from public.customer_venues cv
    where cv.customer_id = v_customer_id
      and cv.venue_id = p_venue_id;

    return query
    select v_customer_id, coalesce(v_points_earned, 0), coalesce(v_rewards_converted, 0), coalesce(v_points_balance, 0), coalesce(v_rewards_balance, 0);
    return;
  end if;

  v_customer_id := p_customer_id;

  if v_customer_id is null then
    select ol.customer_id into v_customer_id
    from public.order_links ol
    where ol.order_id = p_order_id
      and ol.venue_id = p_venue_id
    limit 1;
  end if;

  if v_customer_id is null and p_cart_session_id is not null then
    select ol.customer_id into v_customer_id
    from public.order_links ol
    where ol.cart_session_id = p_cart_session_id
      and ol.venue_id = p_venue_id
    limit 1;
  end if;

  if v_customer_id is null then
    if p_cart_session_id is not null then
      update public.order_links ol
      set order_id = coalesce(ol.order_id, p_order_id),
          status = 'paid_no_customer',
          updated_at = now()
      where ol.cart_session_id = p_cart_session_id
        and ol.venue_id = p_venue_id;

      get diagnostics v_rows_updated = row_count;
    end if;

    if v_rows_updated = 0 then
      insert into public.order_links (order_id, cart_session_id, venue_id, status)
      values (p_order_id, p_cart_session_id, p_venue_id, 'paid_no_customer')
      on conflict (order_id, venue_id)
        where order_id is not null
      do update
        set status = excluded.status,
            cart_session_id = coalesce(excluded.cart_session_id, public.order_links.cart_session_id),
            updated_at = now();
    end if;

    return query
    select null::uuid, 0, 0, 0, 0;
    return;
  end if;

  insert into public.customer_venues (customer_id, venue_id)
  values (v_customer_id, p_venue_id)
  on conflict on constraint customer_venues_customer_id_venue_id_key do nothing;

  select cv.points_balance, cv.rewards_balance
    into v_points_balance, v_rewards_balance
  from public.customer_venues cv
  where cv.customer_id = v_customer_id
    and cv.venue_id = p_venue_id
  for update;

  v_membership_multiplier := public.loyalty_membership_multiplier(v_customer_id, p_venue_id);
  v_exponent := public.loyalty_currency_exponent(p_currency);
  v_points_base := floor(p_total_minor::numeric / power(10::numeric, v_exponent));
  v_points_earned := greatest(v_points_base, 0) * v_membership_multiplier;

  insert into public.points_ledger (
    idempotency_key,
    customer_id,
    venue_id,
    order_id,
    points_delta,
    reason,
    created_at
  )
  values (
    v_earn_key,
    v_customer_id,
    p_venue_id,
    p_order_id,
    v_points_earned,
    'order_paid_earn',
    coalesce(p_paid_at, now())
  );

  v_points_balance := v_points_balance + v_points_earned;
  v_rewards_converted := floor(v_points_balance::numeric / 100);

  if v_rewards_converted > 0 then
    insert into public.points_ledger (
      idempotency_key,
      customer_id,
      venue_id,
      order_id,
      points_delta,
      reason,
      created_at
    )
    values (
      v_convert_points_key,
      v_customer_id,
      p_venue_id,
      p_order_id,
      -(v_rewards_converted * 100),
      'auto_conversion_to_reward',
      coalesce(p_paid_at, now())
    );

    insert into public.rewards_ledger (
      idempotency_key,
      customer_id,
      venue_id,
      reward_delta,
      reason,
      order_id,
      created_at
    )
    values (
      v_convert_reward_key,
      v_customer_id,
      p_venue_id,
      v_rewards_converted,
      'auto_conversion_from_points',
      p_order_id,
      coalesce(p_paid_at, now())
    );

    v_points_balance := v_points_balance - (v_rewards_converted * 100);
    v_rewards_balance := v_rewards_balance + v_rewards_converted;
  end if;

  update public.customer_venues cv
  set
    points_balance = v_points_balance,
    rewards_balance = v_rewards_balance,
    membership_status = public.loyalty_current_membership_status(v_customer_id, p_venue_id),
    updated_at = now()
  where cv.customer_id = v_customer_id
    and cv.venue_id = p_venue_id;

  v_rows_updated := 0;
  if p_cart_session_id is not null then
    update public.order_links ol
    set order_id = coalesce(ol.order_id, p_order_id),
        customer_id = coalesce(ol.customer_id, v_customer_id),
        status = 'paid_earned',
        updated_at = now()
    where ol.cart_session_id = p_cart_session_id
      and ol.venue_id = p_venue_id;

    get diagnostics v_rows_updated = row_count;
  end if;

  if v_rows_updated = 0 then
    insert into public.order_links (
      order_id,
      cart_session_id,
      customer_id,
      venue_id,
      status
    )
    values (
      p_order_id,
      p_cart_session_id,
      v_customer_id,
      p_venue_id,
      'paid_earned'
    )
    on conflict (order_id, venue_id)
      where order_id is not null
    do update
      set
        customer_id = coalesce(excluded.customer_id, public.order_links.customer_id),
        cart_session_id = coalesce(excluded.cart_session_id, public.order_links.cart_session_id),
        status = excluded.status,
        updated_at = now();
  end if;

  return query
  select v_customer_id, v_points_earned, v_rewards_converted, v_points_balance, v_rewards_balance;
end;
$$;

create or replace function public.loyalty_redeem_reward_after_payment(
  p_order_id text,
  p_venue_id text,
  p_payment_event_id text,
  p_cart_session_id text default null
)
returns table (
  customer_id uuid,
  rewards_redeemed integer,
  status text,
  new_rewards_balance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_cart_session_id text;
  v_hold_id uuid;
  v_source_venue_id text;
  v_reward_count integer := 0;
  v_source_rewards_balance integer := 0;
  v_venue_rewards integer := 0;
  v_global_rewards integer := 0;
  v_total_rewards integer := 0;
  v_redeem_key text;
begin
  v_redeem_key := format('redeem:%s:%s', p_order_id, p_payment_event_id);

  select rl.customer_id, abs(rl.reward_delta)
    into v_customer_id, v_reward_count
  from public.rewards_ledger rl
  where rl.idempotency_key = v_redeem_key
  limit 1;

  if v_customer_id is not null then
    select cv.rewards_balance into v_venue_rewards
    from public.customer_venues cv
    where cv.customer_id = v_customer_id
      and cv.venue_id = p_venue_id;

    if p_venue_id <> 'global' then
      select cv.rewards_balance into v_global_rewards
      from public.customer_venues cv
      where cv.customer_id = v_customer_id
        and cv.venue_id = 'global';
    end if;

    v_total_rewards := coalesce(v_venue_rewards, 0) + coalesce(v_global_rewards, 0);

    return query
    select v_customer_id, coalesce(v_reward_count, 0), 'already_redeemed'::text, v_total_rewards;
    return;
  end if;

  select ol.customer_id, ol.cart_session_id
    into v_customer_id, v_cart_session_id
  from public.order_links ol
  where ol.order_id = p_order_id
    and ol.venue_id = p_venue_id
  limit 1;

  if v_cart_session_id is null then
    v_cart_session_id := p_cart_session_id;
  end if;

  if v_customer_id is null then
    return query
    select null::uuid, 0, 'no_customer'::text, 0;
    return;
  end if;

  select rh.id, rh.reward_count, rh.source_venue_id
    into v_hold_id, v_reward_count, v_source_venue_id
  from public.reward_holds rh
  where rh.customer_id = v_customer_id
    and rh.venue_id = p_venue_id
    and rh.status = 'active'
    and v_cart_session_id is not null
    and rh.cart_session_id = v_cart_session_id
  order by rh.created_at asc
  limit 1
  for update;

  if v_hold_id is null then
    update public.order_links
      set status = 'paid_earned', updated_at = now()
    where order_id = p_order_id
      and venue_id = p_venue_id;

    select cv.rewards_balance into v_venue_rewards
    from public.customer_venues cv
    where cv.customer_id = v_customer_id
      and cv.venue_id = p_venue_id;

    if p_venue_id <> 'global' then
      select cv.rewards_balance into v_global_rewards
      from public.customer_venues cv
      where cv.customer_id = v_customer_id
        and cv.venue_id = 'global';
    end if;

    v_total_rewards := coalesce(v_venue_rewards, 0) + coalesce(v_global_rewards, 0);

    return query
    select v_customer_id, 0, 'no_hold'::text, v_total_rewards;
    return;
  end if;

  select cv.rewards_balance
    into v_source_rewards_balance
  from public.customer_venues cv
  where cv.customer_id = v_customer_id
    and cv.venue_id = v_source_venue_id
  for update;

  if v_source_rewards_balance < v_reward_count then
    raise exception 'insufficient_rewards_for_redeem';
  end if;

  insert into public.rewards_ledger (
    idempotency_key,
    customer_id,
    venue_id,
    reward_delta,
    reason,
    order_id
  )
  values (
    v_redeem_key,
    v_customer_id,
    v_source_venue_id,
    -v_reward_count,
    'order_reward_redeem',
    p_order_id
  );

  v_source_rewards_balance := v_source_rewards_balance - v_reward_count;

  update public.customer_venues cv
  set
    rewards_balance = v_source_rewards_balance,
    membership_status = public.loyalty_current_membership_status(v_customer_id, v_source_venue_id),
    updated_at = now()
  where cv.customer_id = v_customer_id
    and cv.venue_id = v_source_venue_id;

  update public.reward_holds
  set status = 'consumed', updated_at = now()
  where id = v_hold_id;

  update public.order_links ol
  set
    status = 'reward_redeemed',
    customer_id = coalesce(ol.customer_id, v_customer_id),
    cart_session_id = coalesce(ol.cart_session_id, v_cart_session_id),
    updated_at = now()
  where ol.order_id = p_order_id
    and ol.venue_id = p_venue_id;

  select cv.rewards_balance into v_venue_rewards
  from public.customer_venues cv
  where cv.customer_id = v_customer_id
    and cv.venue_id = p_venue_id;

  if p_venue_id <> 'global' then
    select cv.rewards_balance into v_global_rewards
    from public.customer_venues cv
    where cv.customer_id = v_customer_id
      and cv.venue_id = 'global';
  end if;

  v_total_rewards := coalesce(v_venue_rewards, 0) + coalesce(v_global_rewards, 0);

  return query
  select v_customer_id, v_reward_count, 'redeemed'::text, v_total_rewards;
end;
$$;

create or replace function public.loyalty_release_expired_reward_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with updated as (
    update public.reward_holds
    set status = 'expired', updated_at = now()
    where status = 'active'
      and expires_at < now()
    returning id
  )
  select count(*) into v_count from updated;

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.loyalty_grant_monthly_reward(
  p_customer_id uuid,
  p_venue_id text,
  p_subscription_id text,
  p_period_start timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_rewards_balance integer;
begin
  v_key := format('grant:%s:%s', p_subscription_id, to_char(p_period_start at time zone 'UTC', 'YYYY-MM-DD'));

  if exists (select 1 from public.rewards_ledger where idempotency_key = v_key) then
    return 0;
  end if;

  insert into public.customer_venues (customer_id, venue_id)
  values (p_customer_id, coalesce(p_venue_id, 'global'))
  on conflict on constraint customer_venues_customer_id_venue_id_key do nothing;

  select rewards_balance
    into v_rewards_balance
  from public.customer_venues
  where customer_id = p_customer_id
    and venue_id = coalesce(p_venue_id, 'global')
  for update;

  insert into public.rewards_ledger (
    idempotency_key,
    customer_id,
    venue_id,
    reward_delta,
    reason,
    order_id,
    created_at
  )
  values (
    v_key,
    p_customer_id,
    coalesce(p_venue_id, 'global'),
    1,
    'membership_monthly_grant',
    null,
    now()
  );

  update public.customer_venues
  set rewards_balance = v_rewards_balance + 1,
      membership_status = public.loyalty_current_membership_status(p_customer_id, coalesce(p_venue_id, 'global')),
      updated_at = now()
  where customer_id = p_customer_id
    and venue_id = coalesce(p_venue_id, 'global');

  return 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and read policies for dashboard roles
-- ---------------------------------------------------------------------------

alter table public.customers enable row level security;
alter table public.customer_venues enable row level security;
alter table public.points_ledger enable row level security;
alter table public.rewards_ledger enable row level security;
alter table public.memberships enable row level security;
alter table public.passes enable row level security;
alter table public.order_links enable row level security;
alter table public.reward_holds enable row level security;
alter table public.analytics_events enable row level security;
alter table public.pass_update_jobs enable row level security;

drop policy if exists customers_select_policy on public.customers;
create policy customers_select_policy
on public.customers
for select
using (
  exists (
    select 1
    from public.customer_venues cv
    where cv.customer_id = customers.id
      and public.app_has_venue_access(cv.venue_id)
  )
);

drop policy if exists customer_venues_select_policy on public.customer_venues;
create policy customer_venues_select_policy
on public.customer_venues
for select
using (public.app_has_venue_access(venue_id));

drop policy if exists points_ledger_select_policy on public.points_ledger;
create policy points_ledger_select_policy
on public.points_ledger
for select
using (public.app_has_venue_access(venue_id));

drop policy if exists rewards_ledger_select_policy on public.rewards_ledger;
create policy rewards_ledger_select_policy
on public.rewards_ledger
for select
using (public.app_has_venue_access(venue_id));

drop policy if exists memberships_select_policy on public.memberships;
create policy memberships_select_policy
on public.memberships
for select
using (
  public.app_has_venue_access(venue_id)
  or exists (
    select 1
    from public.customer_venues cv
    where cv.customer_id = memberships.customer_id
      and public.app_has_venue_access(cv.venue_id)
  )
);

drop policy if exists passes_select_policy on public.passes;
create policy passes_select_policy
on public.passes
for select
using (public.app_has_venue_access(venue_id));

drop policy if exists order_links_select_policy on public.order_links;
create policy order_links_select_policy
on public.order_links
for select
using (public.app_has_venue_access(venue_id));

drop policy if exists reward_holds_select_policy on public.reward_holds;
create policy reward_holds_select_policy
on public.reward_holds
for select
using (public.app_has_venue_access(venue_id));

drop policy if exists analytics_events_select_policy on public.analytics_events;
create policy analytics_events_select_policy
on public.analytics_events
for select
using (public.app_has_venue_access(venue_id));

drop policy if exists pass_update_jobs_select_policy on public.pass_update_jobs;
create policy pass_update_jobs_select_policy
on public.pass_update_jobs
for select
using (public.app_has_venue_access(venue_id));

-- Restrict mutation RPCs to service_role (Edge Functions).
grant execute on function public.loyalty_upsert_customer_by_phone(text, text, text) to service_role;
grant execute on function public.loyalty_resolve_customer_from_pass_token(text, text) to service_role;
grant execute on function public.loyalty_get_balance(uuid, text) to service_role;
grant execute on function public.loyalty_attach_customer_to_cart_session(text, uuid, text) to service_role;
grant execute on function public.loyalty_apply_reward_to_cart(text, uuid, text, integer, text, integer, integer) to service_role;
grant execute on function public.loyalty_earn_points_from_paid_order(text, text, text, bigint, text, timestamptz, uuid, text) to service_role;
grant execute on function public.loyalty_redeem_reward_after_payment(text, text, text, text) to service_role;
grant execute on function public.loyalty_release_expired_reward_holds() to service_role;
grant execute on function public.loyalty_grant_monthly_reward(uuid, text, text, timestamptz) to service_role;
