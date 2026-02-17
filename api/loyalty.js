import { proxyToEdge } from "../lib/server/edge-proxy.js";

const routeMap = {
  "resolve-customer-from-pass-token": "resolve-customer-from-pass-token",
  "upsert-customer-by-phone": "upsert-customer-by-phone",
  "attach-customer-to-cart-session": "attach-customer-to-cart-session",
  "get-balance": "get-balance",
  "apply-reward-to-cart": "apply-reward-to-cart",
  "earn-points-from-paid-order": "earn-points-from-paid-order",
  "redeem-reward-after-payment": "redeem-reward-after-payment",
  "membership-checkout-create-session": "membership-checkout-create-session",
  "stripe-webhook": "stripe-webhook-handler",
  "monthly-reward-grant-job": "monthly-reward-grant-job",
  "process-pass-update-jobs": "process-pass-update-jobs",
};

export default async function handler(req, res) {
  const rawPath = req.query.path;
  const path = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;

  if (!path) {
    res.status(404).json({ error: "loyalty_route_not_found" });
    return;
  }

  const edgeFunction = routeMap[path];
  if (!edgeFunction) {
    res.status(404).json({ error: "loyalty_route_not_found", route: path });
    return;
  }

  const proxy = proxyToEdge(edgeFunction);
  return proxy(req, res);
}
