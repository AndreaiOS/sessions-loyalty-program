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
  const totalMinor = Number(body.total_minor);
  const currency = (body.currency as string | undefined) ?? "GBP";
  const paidAt = (body.paid_at as string | undefined) ?? new Date().toISOString();
  const customerId = (body.customer_id as string | undefined) ?? null;
  const cartSessionId = (body.cart_session_id as string | undefined) ?? null;

  if (!orderId || !venueId || !paymentEventId || Number.isNaN(totalMinor)) {
    return badRequest("order_id_venue_id_payment_event_id_total_minor_required");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("loyalty_earn_points_from_paid_order", {
    p_order_id: orderId,
    p_venue_id: venueId,
    p_payment_event_id: paymentEventId,
    p_total_minor: totalMinor,
    p_currency: currency,
    p_paid_at: paidAt,
    p_customer_id: customerId,
    p_cart_session_id: cartSessionId,
  });

  if (error) {
    return serverError(error.message);
  }

  const row = data?.[0];
  if (!row) {
    return serverError("earn_failed");
  }

  await trackEvent("points_earned", venueId, {
    venue_id: venueId,
    customer_id: row.customer_id,
    order_id: orderId,
    points_earned: row.points_earned,
    rewards_converted: row.rewards_converted,
    payment_event_id: paymentEventId,
    currency,
    total_minor: totalMinor,
  });

  if (row.customer_id) {
    await enqueuePassUpdate(row.customer_id, venueId, "points_earned", {
      order_id: orderId,
      payment_event_id: paymentEventId,
      points_earned: row.points_earned,
      rewards_converted: row.rewards_converted,
    });
  }

  return ok({
    customer_id: row.customer_id,
    points_earned: row.points_earned,
    rewards_converted: row.rewards_converted,
    new_points_balance: row.new_points_balance,
    new_rewards_balance: row.new_rewards_balance,
  });
});
