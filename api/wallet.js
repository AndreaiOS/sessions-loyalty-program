import { supabaseRest } from "../lib/server/supabase-rest.js";

const DEFAULT_BRANDING = {
  brand_name: "Sessions Rewards",
  hero_text: "Scan this pass in kiosk to earn and redeem rewards.",
  primary_color: "#182230",
  accent_color: "#0f766e",
  logo_url: null,
  support_email: null,
};

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

function safeColor(value, fallback) {
  return typeof value === "string" && /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(value)
    ? value
    : fallback;
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

    const [balances, globalBalances, brandingRows] = await Promise.all([
      supabaseRest(
        `customer_venues?select=points_balance,rewards_balance,membership_status&customer_id=eq.${pass.customer_id}&venue_id=eq.${encodeURIComponent(pass.venue_id)}&limit=1`,
      ),
      supabaseRest(
        `customer_venues?select=rewards_balance&customer_id=eq.${pass.customer_id}&venue_id=eq.global&limit=1`,
      ),
      supabaseRest(
        `wallet_branding?select=brand_name,hero_text,primary_color,accent_color,logo_url,support_email&venue_id=eq.${encodeURIComponent(pass.venue_id)}&limit=1`,
      ).catch(() => []),
    ]);

    const balance = balances?.[0] ?? { points_balance: 0, rewards_balance: 0, membership_status: "none" };
    const globalRewardBalance = Number(globalBalances?.[0]?.rewards_balance ?? 0);
    const totalRewards = Number(balance.rewards_balance ?? 0) + globalRewardBalance;
    const branding = { ...DEFAULT_BRANDING, ...(brandingRows?.[0] || {}) };

    const primaryColor = safeColor(branding.primary_color, DEFAULT_BRANDING.primary_color);
    const accentColor = safeColor(branding.accent_color, DEFAULT_BRANDING.accent_color);

    const appleLink = `/wallet/apple/${encodeURIComponent(token)}`;
    const googleLink = `/wallet/google/${encodeURIComponent(token)}`;

    const logoHtml = branding.logo_url
      ? `<img alt="Brand logo" src="${escapeHtml(branding.logo_url)}" style="width:52px;height:52px;border-radius:12px;object-fit:cover;" />`
      : `<div style="width:52px;height:52px;border-radius:12px;background:${accentColor};"></div>`;

    return htmlResponse(
      res,
      200,
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(branding.brand_name)}</title>
  <style>
    :root {
      --primary: ${primaryColor};
      --accent: ${accentColor};
      --bg-a: #eff6ff;
      --bg-b: #fff7ed;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      color: var(--primary);
      background: radial-gradient(circle at 10% 10%, var(--bg-a), transparent 45%),
                  radial-gradient(circle at 90% 90%, var(--bg-b), transparent 40%),
                  #f8fafc;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .wrap {
      width: 100%;
      max-width: 480px;
      background: #fff;
      border-radius: 18px;
      padding: 20px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 12px 30px rgba(15, 23, 42, .08);
    }
    .header { display: flex; gap: 12px; align-items: center; }
    h1 { margin: 0; font-size: 24px; }
    p { margin: 10px 0 16px; color: #475569; }
    .metric {
      display: flex;
      justify-content: space-between;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 8px;
      background: #f8fafc;
    }
    .buttons { margin-top: 14px; display: grid; gap: 10px; }
    a.btn {
      text-decoration: none;
      text-align: center;
      padding: 11px 12px;
      border-radius: 10px;
      font-weight: 700;
      display: block;
    }
    .btn.apple { background: #0f172a; color: #fff; }
    .btn.google { background: var(--accent); color: #fff; }
    .footer { margin-top: 14px; font-size: 13px; color: #64748b; }
  </style>
</head>
<body>
  <main class="wrap">
    <div class="header">
      ${logoHtml}
      <div>
        <h1>${escapeHtml(branding.brand_name)}</h1>
      </div>
    </div>
    <p>${escapeHtml(branding.hero_text)}</p>

    <div class="metric"><span>Points</span><strong>${escapeHtml(balance.points_balance)}</strong></div>
    <div class="metric"><span>Rewards</span><strong>${escapeHtml(totalRewards)}</strong></div>
    <div class="metric"><span>Membership</span><strong>${escapeHtml(balance.membership_status)}</strong></div>

    <div class="buttons">
      <a class="btn apple" href="${appleLink}">Add to Apple Wallet</a>
      <a class="btn google" href="${googleLink}">Add to Google Wallet</a>
    </div>

    <div class="footer">Venue: ${escapeHtml(pass.venue_id)}${branding.support_email ? ` | Support: ${escapeHtml(branding.support_email)}` : ""}</div>
  </main>
</body>
</html>`,
    );
  } catch (error) {
    return htmlResponse(res, 500, `<h1>Wallet page error</h1><pre>${escapeHtml(error.message)}</pre>`);
  }
}
