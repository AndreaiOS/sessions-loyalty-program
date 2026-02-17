import { supabaseRest } from "../lib/server/supabase-rest.js";
import { readJsonBody } from "../lib/server/read-json.js";

const DEFAULT_BRANDING = {
  brand_name: "Sessions Rewards",
  hero_text: "Scan in kiosk to earn points and redeem rewards.",
  primary_color: "#182230",
  accent_color: "#0f766e",
  logo_url: null,
  support_email: null,
};

function isHexColor(value) {
  return typeof value === "string" && /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(value);
}

function trimOrNull(value, max = 300) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  if (!result) return null;
  return result.slice(0, max);
}

function requireAdmin(req, body) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) return false;

  const header = req.headers["x-admin-key"];
  const bodyKey = body?.admin_key;
  return header === expected || bodyKey === expected;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const venueId = req.query.venue_id;
    if (!venueId || typeof venueId !== "string") {
      res.status(400).json({ error: "venue_id_required" });
      return;
    }

    try {
      const rows = await supabaseRest(
        `wallet_branding?select=venue_id,brand_name,hero_text,primary_color,accent_color,logo_url,support_email,updated_at&venue_id=eq.${encodeURIComponent(venueId)}&limit=1`,
      );

      const branding = rows?.[0] || { venue_id: venueId, ...DEFAULT_BRANDING };
      res.status(200).json({ branding });
    } catch (error) {
      if (String(error.message || "").includes("wallet_branding")) {
        res.status(200).json({
          branding: { venue_id: venueId, ...DEFAULT_BRANDING },
          warning: "wallet_branding_table_missing",
        });
        return;
      }
      res.status(500).json({ error: "branding_fetch_failed", message: error.message });
    }

    return;
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      res.status(400).json({ error: "invalid_json" });
      return;
    }

    if (!requireAdmin(req, body)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const venueId = trimOrNull(body.venue_id, 100);
    const brandName = trimOrNull(body.brand_name, 120);
    const heroText = trimOrNull(body.hero_text, 240);
    const logoUrl = trimOrNull(body.logo_url, 500);
    const supportEmail = trimOrNull(body.support_email, 200);
    const primaryColor = trimOrNull(body.primary_color, 20);
    const accentColor = trimOrNull(body.accent_color, 20);

    if (!venueId) {
      res.status(400).json({ error: "venue_id_required" });
      return;
    }

    if (primaryColor && !isHexColor(primaryColor)) {
      res.status(400).json({ error: "invalid_primary_color" });
      return;
    }

    if (accentColor && !isHexColor(accentColor)) {
      res.status(400).json({ error: "invalid_accent_color" });
      return;
    }

    const payload = {
      venue_id: venueId,
      brand_name: brandName || DEFAULT_BRANDING.brand_name,
      hero_text: heroText || DEFAULT_BRANDING.hero_text,
      primary_color: primaryColor || DEFAULT_BRANDING.primary_color,
      accent_color: accentColor || DEFAULT_BRANDING.accent_color,
      logo_url: logoUrl,
      support_email: supportEmail,
      updated_at: new Date().toISOString(),
    };

    try {
      const rows = await supabaseRest("wallet_branding?on_conflict=venue_id", {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: [payload],
      });

      res.status(200).json({ branding: rows?.[0] || payload });
    } catch (error) {
      if (String(error.message || "").includes("wallet_branding")) {
        res.status(500).json({
          error: "wallet_branding_table_missing",
          message: "Run migration 202602170005_wallet_branding_table.sql in Supabase SQL Editor.",
        });
        return;
      }
      res.status(500).json({ error: "branding_save_failed", message: error.message });
    }

    return;
  }

  res.status(405).json({ error: "method_not_allowed" });
}
