import { proxyToEdge } from "../lib/server/edge-proxy.js";
import crypto from "node:crypto";

const proxyHandler = proxyToEdge("membership-checkout-create-session");

function verifySignedLink(customerId, venueId, ts, sig) {
  const secret = process.env.MEMBERSHIP_LINK_SIGNING_SECRET;
  if (!secret) {
    return true;
  }

  if (!ts || !sig) {
    return false;
  }

  const timestamp = Number(ts);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const ageMs = Math.abs(Date.now() - timestamp);
  if (ageMs > 10 * 60 * 1000) {
    return false;
  }

  const payload = `${customerId}:${venueId ?? ""}:${timestamp}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(String(sig));
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

async function createCheckoutUrl(customerId, venueId, returnUrl) {
  const base = process.env.SUPABASE_FUNCTIONS_URL
    ? process.env.SUPABASE_FUNCTIONS_URL.replace(/\/$/, "")
    : process.env.SUPABASE_URL
      ? `${process.env.SUPABASE_URL.replace(/\/$/, "")}/functions/v1`
      : null;

  if (!base || !process.env.INTERNAL_API_KEY) {
    throw new Error("SUPABASE_FUNCTIONS_URL/SUPABASE_URL and INTERNAL_API_KEY are required");
  }

  const response = await fetch(`${base}/membership-checkout-create-session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-api-key": process.env.INTERNAL_API_KEY,
    },
    body: JSON.stringify({
      customer_id: customerId,
      venue_id: venueId,
      return_url: returnUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const body = await response.json();
  return body.checkout_url;
}

export default async function handler(req, res) {
  if (req.method === "POST") {
    return proxyHandler(req, res);
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const customerId = req.query.customer_id;
  const venueId = req.query.venue_id;
  const returnUrl = req.query.return_url;
  const ts = req.query.ts;
  const sig = req.query.sig;

  if (!customerId || typeof customerId !== "string") {
    res.status(400).send("Missing customer_id query param");
    return;
  }

  if (!verifySignedLink(customerId, typeof venueId === "string" ? venueId : null, ts, sig)) {
    res.status(401).send("Invalid or expired membership link signature");
    return;
  }

  try {
    const checkoutUrl = await createCheckoutUrl(customerId, typeof venueId === "string" ? venueId : null, typeof returnUrl === "string" ? returnUrl : undefined);
    res.redirect(302, checkoutUrl);
  } catch (error) {
    res.status(500).send(`Membership checkout error: ${error.message}`);
  }
}
