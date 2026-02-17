import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/db.ts";
import { env } from "../_shared/env.ts";
import { badRequest, ok, serverError, unauthorized, parseJson } from "../_shared/http.ts";
import { normalizePhone, sha256Hex } from "../_shared/phone.ts";
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

  const phoneRaw = body.phone_raw as string | undefined;
  const venueId = body.venue_id as string | undefined;
  const deviceId = body.device_id as string | undefined;

  if (!phoneRaw || !venueId) {
    return badRequest("phone_raw_and_venue_id_required");
  }

  const phoneE164 = normalizePhone(phoneRaw, env.defaultPhoneCountryCode);
  if (!phoneE164) {
    return badRequest("invalid_phone");
  }

  const phoneHash = await sha256Hex(phoneE164);
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc("loyalty_upsert_customer_by_phone", {
    p_phone_e164: phoneE164,
    p_phone_hash: phoneHash,
    p_venue_id: venueId,
  });

  if (error) {
    return serverError(error.message);
  }

  const row = data?.[0];
  if (!row) {
    return serverError("upsert_failed");
  }

  await trackEvent("customer_identified_phone", venueId, {
    venue_id: venueId,
    device_id: deviceId ?? auth.context?.deviceId ?? null,
    customer_id: row.customer_id,
    is_new_customer: row.is_new_customer,
  });

  return ok({
    customer_id: row.customer_id,
    is_new_customer: row.is_new_customer,
    points_balance: row.points_balance,
    rewards_balance: row.rewards_balance,
    membership_status: row.membership_status,
    wallet_token: row.wallet_token,
  });
});
