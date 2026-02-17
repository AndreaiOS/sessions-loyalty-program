#!/usr/bin/env node

import crypto from "node:crypto";

const baseUrl = process.env.PUBLIC_BASE_URL;
const secret = process.env.MEMBERSHIP_LINK_SIGNING_SECRET;
const customerId = process.argv[2];
const venueId = process.argv[3] ?? "";

if (!baseUrl || !secret || !customerId) {
  console.error("Usage: PUBLIC_BASE_URL=... MEMBERSHIP_LINK_SIGNING_SECRET=... node scripts/generate-membership-link.js <customer_id> [venue_id]");
  process.exit(1);
}

const ts = Date.now();
const payload = `${customerId}:${venueId}:${ts}`;
const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");

const url = new URL("/membership", baseUrl);
url.searchParams.set("customer_id", customerId);
if (venueId) url.searchParams.set("venue_id", venueId);
url.searchParams.set("ts", String(ts));
url.searchParams.set("sig", sig);

console.log(url.toString());
