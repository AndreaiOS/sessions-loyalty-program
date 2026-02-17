-- Hotfix: avoid ambiguous column references caused by output parameter names.

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
