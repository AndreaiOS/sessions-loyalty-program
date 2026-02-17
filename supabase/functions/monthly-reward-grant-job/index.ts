import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/db.ts";
import { badRequest, ok, serverError, unauthorized } from "../_shared/http.ts";
import { requireInternalApiKey } from "../_shared/auth.ts";

function getApproxPeriodStart(currentPeriodEnd: string) {
  const end = new Date(currentPeriodEnd);
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - 1);
  return start.toISOString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return badRequest("method_not_allowed");
  }

  if (!requireInternalApiKey(req)) {
    return unauthorized();
  }

  const supabase = createServiceClient();

  const { data: releasedRows, error: releaseError } = await supabase.rpc("loyalty_release_expired_reward_holds");
  if (releaseError) {
    return serverError(releaseError.message);
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("memberships")
    .select("customer_id, venue_id, stripe_subscription_id, current_period_end")
    .in("status", ["active", "trialing", "past_due"])
    .not("current_period_end", "is", null);

  if (membershipsError) {
    return serverError(membershipsError.message);
  }

  let grants = 0;

  for (const membership of memberships ?? []) {
    const periodStart = getApproxPeriodStart(membership.current_period_end);
    const { data: granted, error } = await supabase.rpc("loyalty_grant_monthly_reward", {
      p_customer_id: membership.customer_id,
      p_venue_id: membership.venue_id,
      p_subscription_id: membership.stripe_subscription_id,
      p_period_start: periodStart,
    });

    if (!error && typeof granted === "number") {
      grants += granted;
    }
  }

  return ok({
    expired_holds_released: Number(releasedRows ?? 0),
    memberships_checked: memberships?.length ?? 0,
    rewards_granted: grants,
  });
});
