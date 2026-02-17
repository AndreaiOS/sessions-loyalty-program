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

  const cartSessionId = body.cart_session_id as string | undefined;
  const customerId = body.customer_id as string | undefined;
  const venueId = body.venue_id as string | undefined;

  if (!cartSessionId || !customerId || !venueId) {
    return badRequest("cart_session_id_customer_id_venue_id_required");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("loyalty_attach_customer_to_cart_session", {
    p_cart_session_id: cartSessionId,
    p_customer_id: customerId,
    p_venue_id: venueId,
  });

  if (error) {
    return serverError(error.message);
  }

  return ok({ attached: true, link: data?.[0] ?? null });
});
