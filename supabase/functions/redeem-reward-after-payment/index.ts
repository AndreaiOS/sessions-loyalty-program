import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/db.ts";
import { badRequest, ok, serverError, unauthorized, parseJson } from "../_shared/http.ts";
import { requireInternalApiKey, requireKioskAuth } from "../_shared/auth.ts";
import { enqueuePassUpdate, trackEvent } from "../_shared/analytics.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return badRequest("method_not_allowed");
  }

  const isInternal = requireInternalApiKey(req);
  if (!isInternal) {
    const auth = await requireKioskAuth(req);
    if (!auth.authorized) {
      return unauthorized();
    }
  }

  const body = await parseJson(req);
  if (!body) {
    return badRequest("invalid_json");
  }

  const orderId = body.order_id as string | undefined;
  const venueId = body.venue_id as string | undefined;
  const paymentEventId = body.payment_event_id as string | undefined;
  const cartSessionId = (body.cart_session_id as string | undefined) ?? null;

  if (!orderId || !venueId || !paymentEventId) {
    return badRequest("order_id_venue_id_payment_event_id_required");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("loyalty_redeem_reward_after_payment", {
    p_order_id: orderId,
    p_venue_id: venueId,
    p_payment_event_id: paymentEventId,
    p_cart_session_id: cartSessionId,
  });

  if (error) {
    return serverError(error.message);
  }

  const row = data?.[0];
  if (!row) {
    return serverError("redeem_failed");
  }

  await trackEvent("reward_redeemed", venueId, {
    venue_id: venueId,
    customer_id: row.customer_id,
    order_id: orderId,
    rewards_redeemed: row.rewards_redeemed,
    payment_event_id: paymentEventId,
    status: row.status,
  });

  if (row.customer_id && Number(row.rewards_redeemed) > 0) {
    await enqueuePassUpdate(row.customer_id, venueId, "reward_redeemed", {
      order_id: orderId,
      payment_event_id: paymentEventId,
      rewards_redeemed: row.rewards_redeemed,
    });
  }

  return ok({
    customer_id: row.customer_id,
    rewards_redeemed: row.rewards_redeemed,
    status: row.status,
    new_rewards_balance: row.new_rewards_balance,
  });
});
