export default async function handler(req, res) {
  const token = req.query.token;
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "invalid_token" });
    return;
  }

  const template = process.env.GOOGLE_WALLET_ADD_URL_TEMPLATE;
  if (!template) {
    res.status(501).json({
      error: "google_wallet_not_configured",
      message: "Set GOOGLE_WALLET_ADD_URL_TEMPLATE with {token} placeholder.",
    });
    return;
  }

  const target = template.replace("{token}", encodeURIComponent(token));
  res.redirect(302, target);
}
