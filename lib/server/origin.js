export function requestOrigin(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : (forwardedProto || "https");

  const host = req.headers.host;
  if (!host) {
    throw new Error("Missing host header");
  }

  return `${proto}://${host}`;
}
