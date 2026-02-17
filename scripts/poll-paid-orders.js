#!/usr/bin/env node

/**
 * Fallback polling worker for missed paid-order webhooks.
 *
 * Expected environment:
 * - SESSIONS_API_BASE_URL
 * - SESSIONS_API_KEY
 * - LOYALTY_EARN_ENDPOINT (e.g. https://<domain>/loyalty/earn-points-from-paid-order)
 * - INTERNAL_API_KEY
 */

const REQUIRED = ["SESSIONS_API_BASE_URL", "SESSIONS_API_KEY", "LOYALTY_EARN_ENDPOINT", "INTERNAL_API_KEY"];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const baseUrl = process.env.SESSIONS_API_BASE_URL.replace(/\/$/, "");
const sessionsKey = process.env.SESSIONS_API_KEY;
const loyaltyEndpoint = process.env.LOYALTY_EARN_ENDPOINT;
const internalApiKey = process.env.INTERNAL_API_KEY;

async function fetchRecentPaidOrders() {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const url = `${baseUrl}/orders?payment_status=paid&updated_since=${encodeURIComponent(since)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${sessionsKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Sessions API polling failed (${response.status})`);
  }

  const body = await response.json();
  return Array.isArray(body.orders) ? body.orders : [];
}

async function forwardOrder(order) {
  const payload = {
    order_id: order.order_id,
    venue_id: order.venue_id,
    payment_event_id: order.payment_event_id || `poll-${order.order_id}-${order.updated_at}`,
    total_minor: order.order_total_minor,
    currency: order.currency,
    paid_at: order.paid_at,
    customer_id: order.customer_id || null,
    cart_session_id: order.cart_session_id || null,
  };

  const response = await fetch(loyaltyEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": internalApiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Loyalty earn call failed for ${order.order_id}: ${response.status} ${text}`);
  }
}

async function run() {
  const orders = await fetchRecentPaidOrders();
  let success = 0;

  for (const order of orders) {
    try {
      await forwardOrder(order);
      success += 1;
    } catch (error) {
      console.error(error.message);
    }
  }

  console.log(JSON.stringify({ scanned: orders.length, forwarded: success }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
