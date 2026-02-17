import { supabaseRest } from "../_lib/supabase-rest.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function htmlResponse(res, status, html) {
  res.status(status);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(html);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return htmlResponse(res, 405, "<h1>Method Not Allowed</h1>");
  }

  const token = req.query.token;
  if (!token || typeof token !== "string") {
    return htmlResponse(res, 400, "<h1>Invalid wallet token</h1>");
  }

  try {
    const passes = await supabaseRest(`passes?select=customer_id,venue_id,pass_token&pass_token=eq.${encodeURIComponent(token)}&limit=1`);
    const pass = passes?.[0];

    if (!pass) {
      return htmlResponse(res, 404, "<h1>Wallet link not found</h1>");
    }

    const balances = await supabaseRest(
      `customer_venues?select=points_balance,rewards_balance,membership_status&customer_id=eq.${pass.customer_id}&venue_id=eq.${encodeURIComponent(pass.venue_id)}&limit=1`,
    );
    const globalBalances = await supabaseRest(
      `customer_venues?select=rewards_balance&customer_id=eq.${pass.customer_id}&venue_id=eq.global&limit=1`,
    );

    const balance = balances?.[0] ?? { points_balance: 0, rewards_balance: 0, membership_status: "none" };
    const globalRewardBalance = Number(globalBalances?.[0]?.rewards_balance ?? 0);
    const totalRewards = Number(balance.rewards_balance ?? 0) + globalRewardBalance;
    const appleLink = `/api/wallet/apple/${encodeURIComponent(token)}`;
    const googleLink = `/api/wallet/google/${encodeURIComponent(token)}`;

    return htmlResponse(
      res,
      200,
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sessions Rewards Wallet</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: linear-gradient(160deg, #f3f7ff, #ffffff 40%, #f9f5ef); color: #182230; }
    .wrap { max-width: 480px; margin: 40px auto; background: white; border-radius: 14px; padding: 24px; box-shadow: 0 10px 30px rgba(24,34,48,.08); }
    h1 { margin: 0 0 8px; font-size: 28px; }
    p { margin: 0 0 18px; color: #44556a; }
    .metric { display: flex; justify-content: space-between; margin: 8px 0; padding: 10px 12px; border-radius: 10px; background: #f8fafc; }
    .buttons { margin-top: 18px; display: grid; gap: 10px; }
    a.btn { display: block; text-decoration: none; font-weight: 600; padding: 12px 14px; border-radius: 10px; text-align: center; }
    a.apple { background: #111827; color: #fff; }
    a.google { background: #0f766e; color: #fff; }
  </style>
</head>
<body>
  <main class="wrap">
    <h1>Sessions Rewards</h1>
    <p>Add your pass to wallet and keep rewards updated live.</p>
    <div class="metric"><span>Points</span><strong>${escapeHtml(balance.points_balance)}</strong></div>
    <div class="metric"><span>Rewards</span><strong>${escapeHtml(totalRewards)}</strong></div>
    <div class="metric"><span>Membership</span><strong>${escapeHtml(balance.membership_status)}</strong></div>
    <div class="buttons">
      <a class="btn apple" href="${appleLink}">Add to Apple Wallet</a>
      <a class="btn google" href="${googleLink}">Add to Google Wallet</a>
    </div>
  </main>
</body>
</html>`,
    );
  } catch (error) {
    return htmlResponse(res, 500, `<h1>Wallet page error</h1><pre>${escapeHtml(error.message)}</pre>`);
  }
}
