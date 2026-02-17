import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/db.ts";
import { env } from "../_shared/env.ts";
import { badRequest, ok, serverError, unauthorized, parseJson } from "../_shared/http.ts";
import { requireKioskAuth } from "../_shared/auth.ts";
import { trackEvent } from "../_shared/analytics.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return badRequest("method_not_allowed");
  }

  const auth = await requireKioskAuth(req);
  if (!auth.authorized) {
    return unauthorized();
  }

  const body = await parseJson(req);
  if (!body) {
    return badRequest("invalid_json");
  }

  const cartSessionId = body.cart_session_id as string | undefined;
  const customerId = body.customer_id as string | undefined;
  const venueId = body.venue_id as string | undefined;
  const rewardCount = Number(body.reward_count ?? 1);
  const idempotencyKey = req.headers.get("x-idempotency-key") ?? (body.idempotency_key as string | undefined) ?? null;

  if (!cartSessionId || !customerId || !venueId) {
    return badRequest("cart_session_id_customer_id_venue_id_required");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("loyalty_apply_reward_to_cart", {
    p_cart_session_id: cartSessionId,
    p_customer_id: customerId,
    p_venue_id: venueId,
    p_reward_count: rewardCount,
    p_idempotency_key: idempotencyKey,
    p_reward_discount_minor: env.rewardDiscountMinor,
    p_hold_minutes: env.rewardHoldMinutes,
  });

  if (error) {
    return serverError(error.message);
  }

  const row = data?.[0];
  if (!row) {
    return serverError("reward_apply_failed");
  }

  await trackEvent("reward_applied", venueId, {
    venue_id: venueId,
    customer_id: customerId,
    cart_session_id: cartSessionId,
    hold_id: row.hold_id,
    reward_count: rewardCount,
    discount_minor: row.discount_minor,
  });

  return ok({
    approved: row.approved,
    hold_id: row.hold_id,
    expires_at: row.expires_at,
    discount_minor: row.discount_minor,
    rewards_balance: row.rewards_balance,
  });
});
