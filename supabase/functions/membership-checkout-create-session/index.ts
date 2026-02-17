import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "npm:stripe@14.25.0";
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/db.ts";
import { env } from "../_shared/env.ts";
import { badRequest, ok, serverError, unauthorized, parseJson } from "../_shared/http.ts";
import { requireInternalApiKey } from "../_shared/auth.ts";

const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey, { apiVersion: "2024-06-20" }) : null;

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

  if (!stripe || !env.stripeMembershipPriceId) {
    return serverError("stripe_not_configured");
  }

  const body = await parseJson(req);
  if (!body) {
    return badRequest("invalid_json");
  }

  const customerId = body.customer_id as string | undefined;
  const venueId = (body.venue_id as string | undefined) ?? null;
  const returnUrl = (body.return_url as string | undefined) ?? env.membershipSuccessUrl;

  if (!customerId || !returnUrl || !env.membershipCancelUrl) {
    return badRequest("customer_id_return_url_membership_cancel_url_required");
  }

  const supabase = createServiceClient();
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, phone_e164")
    .eq("id", customerId)
    .maybeSingle();

  if (customerError || !customer) {
    return serverError("customer_not_found");
  }

  const { data: existingMembership } = await supabase
    .from("memberships")
    .select("stripe_customer_id")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let stripeCustomerId = existingMembership?.stripe_customer_id;
  if (!stripeCustomerId) {
    const stripeCustomer = await stripe.customers.create({
      metadata: { customer_id: customerId },
      phone: customer.phone_e164 ?? undefined,
    });
    stripeCustomerId = stripeCustomer.id;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: env.stripeMembershipPriceId, quantity: 1 }],
    success_url: returnUrl,
    cancel_url: env.membershipCancelUrl,
    metadata: {
      customer_id: customerId,
      venue_id: venueId ?? "",
      membership_scope: "global",
    },
    subscription_data: {
      metadata: {
        customer_id: customerId,
        venue_id: venueId ?? "",
        membership_scope: "global",
      },
    },
  });

  return ok({ checkout_url: session.url });
});
