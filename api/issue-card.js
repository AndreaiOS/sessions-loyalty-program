import { invokeEdge } from "../lib/server/edge-client.js";
import { readJsonBody } from "../lib/server/read-json.js";
import { requestOrigin } from "../lib/server/origin.js";

function badRequest(res, message) {
  res.status(400).json({ error: message });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const kioskSecret = process.env.KIOSK_SHARED_SECRET;
  if (!kioskSecret) {
    res.status(500).json({ error: "KIOSK_SHARED_SECRET_missing" });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    badRequest(res, "invalid_json");
    return;
  }

  const phoneRaw = body.phone_raw;
  const venueId = body.venue_id;
  const deviceId = body.device_id || "web_loyalty_portal";

  if (!phoneRaw || !venueId) {
    badRequest(res, "phone_raw_and_venue_id_required");
    return;
  }

  let edgeResult;
  try {
    edgeResult = await invokeEdge(
      "upsert-customer-by-phone",
      {
        phone_raw: phoneRaw,
        venue_id: venueId,
        device_id: deviceId,
      },
      {
        headers: {
          "x-kiosk-secret": kioskSecret,
        },
      },
    );
  } catch (error) {
    res.status(500).json({ error: "edge_unreachable", message: error.message });
    return;
  }

  if (!edgeResult.ok) {
    res.status(edgeResult.status).json(edgeResult.data || { error: "issue_card_failed" });
    return;
  }

  const token = edgeResult.data?.wallet_token;
  if (!token) {
    res.status(500).json({ error: "wallet_token_missing" });
    return;
  }

  const origin = requestOrigin(req);
  const walletUrl = `${origin}/wallet/${encodeURIComponent(token)}`;
  const appleUrl = `${origin}/wallet/apple/${encodeURIComponent(token)}`;
  const googleUrl = `${origin}/wallet/google/${encodeURIComponent(token)}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(walletUrl)}`;

  res.status(200).json({
    ...edgeResult.data,
    venue_id: venueId,
    wallet_url: walletUrl,
    apple_wallet_url: appleUrl,
    google_wallet_url: googleUrl,
    qr_image_url: qrImageUrl,
    mailto_url: `mailto:?subject=${encodeURIComponent("Your Sessions Rewards Card")}&body=${encodeURIComponent(`Open your loyalty card: ${walletUrl}`)}`,
  });
}
