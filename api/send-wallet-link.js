import { readJsonBody } from "../lib/server/read-json.js";

function isEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    res.status(400).json({ error: "invalid_json" });
    return;
  }

  const email = body.email;
  const walletUrl = body.wallet_url;
  const appleUrl = body.apple_wallet_url;
  const googleUrl = body.google_wallet_url;
  const venueId = body.venue_id;

  if (!isEmail(email)) {
    res.status(400).json({ error: "invalid_email" });
    return;
  }

  if (!walletUrl) {
    res.status(400).json({ error: "wallet_url_required" });
    return;
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;

  if (!resendApiKey || !emailFrom) {
    res.status(400).json({
      error: "email_not_configured",
      message: "Set RESEND_API_KEY and EMAIL_FROM to enable transactional email delivery.",
    });
    return;
  }

  const subject = process.env.WALLET_EMAIL_SUBJECT || "Your Sessions Rewards Card";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937">
      <h2>Sessions Rewards</h2>
      <p>Your loyalty card for venue <strong>${venueId || "default"}</strong> is ready.</p>
      <p><a href="${walletUrl}">Open Loyalty Card</a></p>
      <p><a href="${appleUrl || walletUrl}">Add to Apple Wallet</a></p>
      <p><a href="${googleUrl || walletUrl}">Add to Google Wallet</a></p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [email],
      subject,
      html,
    }),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    res.status(response.status).json({ error: "email_send_failed", details: parsed });
    return;
  }

  res.status(200).json({ sent: true, provider: "resend", response: parsed });
}
