import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/db.ts";
import { badRequest, ok, serverError, unauthorized, parseJson } from "../_shared/http.ts";
import { requireKioskAuth } from "../_shared/auth.ts";

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

  const customerId = body.customer_id as string | undefined;
  const venueId = body.venue_id as string | undefined;

  if (!customerId || !venueId) {
    return badRequest("customer_id_and_venue_id_required");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("loyalty_get_balance", {
    p_customer_id: customerId,
    p_venue_id: venueId,
  });

  if (error) {
    return serverError(error.message);
  }

  const row = data?.[0];
  if (!row) {
    return serverError("balance_not_found");
  }

  return ok({
    customer_id: row.customer_id,
    points_balance: row.points_balance,
    rewards_balance: row.rewards_balance,
    membership_status: row.membership_status,
  });
});
