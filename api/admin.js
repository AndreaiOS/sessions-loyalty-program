import { supabaseRest } from "../lib/server/supabase-rest.js";

function htmlResponse(res, status, html) {
  res.status(status);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(html);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return htmlResponse(res, 405, "<h1>Method Not Allowed</h1>");
  }

  const expectedKey = process.env.ADMIN_API_KEY;
  if (!expectedKey || req.headers["x-admin-key"] !== expectedKey) {
    return htmlResponse(res, 401, "<h1>Unauthorized</h1><p>Missing or invalid x-admin-key</p>");
  }

  const venueId = req.query.venue_id;
  if (!venueId || typeof venueId !== "string") {
    return htmlResponse(res, 400, "<h1>Missing venue_id</h1>");
  }

  try {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 1);

    const events = await supabaseRest(
      `analytics_events?select=event_name,payload,created_at&venue_id=eq.${encodeURIComponent(venueId)}&created_at=gte.${encodeURIComponent(since.toISOString())}`,
    );

    const customerAttached = (events ?? []).filter((e) => e.event_name === "customer_identified_pass_scan" || e.event_name === "customer_identified_phone").length;
    const earnEvents = (events ?? []).filter((e) => e.event_name === "points_earned").length;
    const redeemEvents = (events ?? []).filter((e) => e.event_name === "reward_redeemed").length;
    const membershipConversions = (events ?? []).filter((e) => e.event_name === "membership_conversion").length;

    const members = await supabaseRest(
      `customer_venues?select=customer_id,membership_status&venue_id=eq.${encodeURIComponent(venueId)}&membership_status=in.(active,trialing,past_due)`,
    );

    const activeMemberships = new Set((members ?? []).map((m) => m.customer_id)).size;

    const attachRate = earnEvents > 0 ? Math.min(100, Math.round((customerAttached / earnEvents) * 100)) : 0;

    return htmlResponse(
      res,
      200,
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sessions Rewards Admin</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #f7fafc; color: #1f2937; }
    .wrap { max-width: 900px; margin: 28px auto; padding: 0 16px; }
    h1 { margin: 0 0 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
    .card { background: white; border-radius: 12px; padding: 14px; box-shadow: 0 6px 20px rgba(15,23,42,.06); }
    .label { color: #64748b; font-size: 13px; }
    .value { font-size: 28px; font-weight: 700; margin-top: 4px; }
  </style>
</head>
<body>
  <main class="wrap">
    <h1>Sessions Rewards Admin</h1>
    <p>Venue: <strong>${venueId}</strong> | Last 24 hours</p>
    <section class="grid">
      <article class="card"><div class="label">Attach Rate (proxy)</div><div class="value">${attachRate}%</div></article>
      <article class="card"><div class="label">Earn Events</div><div class="value">${earnEvents}</div></article>
      <article class="card"><div class="label">Redeem Events</div><div class="value">${redeemEvents}</div></article>
      <article class="card"><div class="label">Membership Conversions</div><div class="value">${membershipConversions}</div></article>
      <article class="card"><div class="label">Active Members</div><div class="value">${activeMemberships}</div></article>
    </section>
  </main>
</body>
</html>`,
    );
  } catch (error) {
    return htmlResponse(res, 500, `<h1>Admin error</h1><pre>${error.message}</pre>`);
  }
}
