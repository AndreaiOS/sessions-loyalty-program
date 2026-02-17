-- Runtime hotfix for PL/pgSQL ambiguous references seen in API calls.

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

  select cv.rewards_balance into v_venue_rewards
  from public.customer_venues cv
  where cv.customer_id = p_customer_id
    and cv.venue_id = p_venue_id
  for update;

  if p_venue_id <> 'global' then
    insert into public.customer_venues (customer_id, venue_id)
    values (p_customer_id, 'global')
    on conflict on constraint customer_venues_customer_id_venue_id_key do nothing;

    select cv.rewards_balance into v_global_rewards
    from public.customer_venues cv
    where cv.customer_id = p_customer_id
      and cv.venue_id = 'global'
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
    insert into public.order_links (order_id, cart_session_id, venue_id, status)
    values (p_order_id, p_cart_session_id, p_venue_id, 'paid_no_customer')
    on conflict (order_id, venue_id)
      where order_id is not null
    do update
      set status = excluded.status,
          cart_session_id = coalesce(excluded.cart_session_id, public.order_links.cart_session_id),
          updated_at = now();

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
    update public.order_links ol
      set status = 'paid_earned', updated_at = now()
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

  update public.reward_holds rh
  set status = 'consumed', updated_at = now()
  where rh.id = v_hold_id;

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
