import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "npm:stripe@14.25.0";
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/db.ts";
import { env } from "../_shared/env.ts";
import { badRequest, ok, serverError } from "../_shared/http.ts";
import { enqueuePassUpdate, trackEvent } from "../_shared/analytics.ts";

const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey, { apiVersion: "2024-06-20" }) : null;

async function upsertMembershipFromSubscription(subscription: Stripe.Subscription) {
  const customerId = subscription.metadata.customer_id;
  const venueId = subscription.metadata.venue_id || null;

  if (!customerId) {
    return;
  }

  const supabase = createServiceClient();
  const payload = {
    customer_id: customerId,
    venue_id: venueId,
    stripe_customer_id: String(subscription.customer),
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    current_period_end: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
  };

  await supabase.from("memberships").upsert(payload, { onConflict: "stripe_subscription_id" });

  if (subscription.status === "active" || subscription.status === "trialing" || subscription.status === "past_due") {
    await supabase.from("customer_venues").upsert(
      {
        customer_id: customerId,
        venue_id: venueId ?? "global",
        membership_status: subscription.status,
      },
      { onConflict: "customer_id,venue_id" },
    );
  }

  await enqueuePassUpdate(customerId, venueId ?? "global", "membership_status_changed", {
    subscription_id: subscription.id,
    status: subscription.status,
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;

  const subscriptionId = String(invoice.subscription);
  const supabase = createServiceClient();
  const { data: membership } = await supabase
    .from("memberships")
    .select("customer_id, venue_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (!membership?.customer_id) {
    return;
  }

  const periodStart = invoice.lines.data[0]?.period?.start
    ? new Date(invoice.lines.data[0].period.start * 1000).toISOString()
    : new Date().toISOString();

  await supabase.rpc("loyalty_grant_monthly_reward", {
    p_customer_id: membership.customer_id,
    p_venue_id: membership.venue_id,
    p_subscription_id: subscriptionId,
    p_period_start: periodStart,
  });

  await trackEvent("membership_invoice_paid", membership.venue_id ?? "global", {
    customer_id: membership.customer_id,
    stripe_subscription_id: subscriptionId,
    stripe_invoice_id: invoice.id,
    amount_paid: invoice.amount_paid,
    currency: invoice.currency,
  });

  await enqueuePassUpdate(membership.customer_id, membership.venue_id ?? "global", "membership_reward_grant", {
    stripe_subscription_id: subscriptionId,
    stripe_invoice_id: invoice.id,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return badRequest("method_not_allowed");
  }

  if (!stripe || !env.stripeWebhookSecret) {
    return serverError("stripe_not_configured");
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return badRequest("missing_stripe_signature");
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, env.stripeWebhookSecret);
  } catch (error) {
    return badRequest(`signature_verification_failed:${(error as Error).message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(String(session.subscription));
        await upsertMembershipFromSubscription(subscription);
        await trackEvent("membership_conversion", subscription.metadata.venue_id ?? "global", {
          customer_id: subscription.metadata.customer_id,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: String(subscription.customer),
        });
      }
    }

    if (event.type === "invoice.paid") {
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = String(invoice.subscription ?? "");
      if (subscriptionId) {
        const supabase = createServiceClient();
        await supabase
          .from("memberships")
          .update({ status: "past_due" })
          .eq("stripe_subscription_id", subscriptionId);
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await upsertMembershipFromSubscription(event.data.object as Stripe.Subscription);
    }
  } catch (error) {
    return serverError((error as Error).message);
  }

  return ok({ received: true });
});
