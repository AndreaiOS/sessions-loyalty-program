import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";
import { env } from "./env.ts";

type KioskAuthContext = {
  venueId?: string;
  deviceId?: string;
  sub?: string;
};

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return auth.slice(7);
}

async function tryVerifyJwt(req: Request): Promise<KioskAuthContext | null> {
  const token = getBearerToken(req);
  if (!token || !env.sessionsJwksUrl) {
    return null;
  }

  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(env.sessionsJwksUrl));
  }

  const options: {
    issuer?: string;
    audience?: string;
  } = {};

  if (env.sessionsJwtIssuer) options.issuer = env.sessionsJwtIssuer;
  if (env.sessionsJwtAudience) options.audience = env.sessionsJwtAudience;

  const { payload } = await jwtVerify(token, jwks, options);

  return {
    venueId: (payload.venue_id as string | undefined) ?? (payload["https://sessions.market/venue_id"] as string | undefined),
    deviceId: (payload.device_id as string | undefined) ?? (payload["https://sessions.market/device_id"] as string | undefined),
    sub: payload.sub,
  };
}

function tryVerifySharedSecret(req: Request): boolean {
  if (!env.kioskSharedSecret) {
    return false;
  }
  const provided = req.headers.get("x-kiosk-secret");
  return provided === env.kioskSharedSecret;
}

export async function requireKioskAuth(req: Request) {
  try {
    const context = await tryVerifyJwt(req);
    if (context) return { authorized: true, context };
  } catch {
    // Fall through to shared secret.
  }

  if (tryVerifySharedSecret(req)) {
    return { authorized: true, context: {} as KioskAuthContext };
  }

  return { authorized: false, context: null };
}

export function requireInternalApiKey(req: Request) {
  if (!env.internalApiKey) {
    return false;
  }
  const key = req.headers.get("x-internal-api-key");
  return key === env.internalApiKey;
}
