#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${LOYALTY_BASE_URL:-}" ]]; then
  echo "ERROR: set LOYALTY_BASE_URL, e.g. https://sessions-loyalty-program-x1pp.vercel.app" >&2
  exit 1
fi

if [[ -z "${KIOSK_SHARED_SECRET:-}" ]]; then
  echo "ERROR: set KIOSK_SHARED_SECRET" >&2
  exit 1
fi

if [[ -z "${CUSTOMER_ID:-}" ]]; then
  echo "ERROR: set CUSTOMER_ID" >&2
  exit 1
fi

VENUE_ID="${VENUE_ID:-venue_test}"
TOTAL_MINOR="${TOTAL_MINOR:-2599}"
CURRENCY="${CURRENCY:-GBP}"
TS="$(date +%s)"
CART_ID="${CART_ID:-cart_idem_${TS}}"
ORDER_ID="${ORDER_ID:-ord_idem_${TS}}"
PAYMENT_EVENT_ID="${PAYMENT_EVENT_ID:-evt_paid_idem_${TS}}"

post_json() {
  local path="$1"
  local payload="$2"
  curl -sS -X POST "${LOYALTY_BASE_URL}${path}" \
    -H "content-type: application/json" \
    -H "x-kiosk-secret: ${KIOSK_SHARED_SECRET}" \
    -d "$payload"
}

echo "==> Initial balance"
post_json "/loyalty/get-balance" "{\"customer_id\":\"${CUSTOMER_ID}\",\"venue_id\":\"${VENUE_ID}\"}" | sed 's/.*/  &/'

echo "==> Apply reward (hold)"
post_json "/loyalty/apply-reward-to-cart" "{\"cart_session_id\":\"${CART_ID}\",\"customer_id\":\"${CUSTOMER_ID}\",\"venue_id\":\"${VENUE_ID}\",\"reward_count\":1}" | sed 's/.*/  &/'

echo "==> Earn #1"
post_json "/loyalty/earn-points-from-paid-order" "{\"order_id\":\"${ORDER_ID}\",\"venue_id\":\"${VENUE_ID}\",\"payment_event_id\":\"${PAYMENT_EVENT_ID}\",\"total_minor\":${TOTAL_MINOR},\"currency\":\"${CURRENCY}\",\"paid_at\":\"2026-02-17T12:00:00.000Z\",\"customer_id\":\"${CUSTOMER_ID}\",\"cart_session_id\":\"${CART_ID}\"}" | sed 's/.*/  &/'

echo "==> Earn #2 (same order_id + payment_event_id, should be idempotent)"
post_json "/loyalty/earn-points-from-paid-order" "{\"order_id\":\"${ORDER_ID}\",\"venue_id\":\"${VENUE_ID}\",\"payment_event_id\":\"${PAYMENT_EVENT_ID}\",\"total_minor\":${TOTAL_MINOR},\"currency\":\"${CURRENCY}\",\"paid_at\":\"2026-02-17T12:00:00.000Z\",\"customer_id\":\"${CUSTOMER_ID}\",\"cart_session_id\":\"${CART_ID}\"}" | sed 's/.*/  &/'

echo "==> Redeem #1"
post_json "/loyalty/redeem-reward-after-payment" "{\"order_id\":\"${ORDER_ID}\",\"venue_id\":\"${VENUE_ID}\",\"payment_event_id\":\"${PAYMENT_EVENT_ID}\",\"cart_session_id\":\"${CART_ID}\"}" | sed 's/.*/  &/'

echo "==> Redeem #2 (same order_id + payment_event_id, should return already_redeemed)"
post_json "/loyalty/redeem-reward-after-payment" "{\"order_id\":\"${ORDER_ID}\",\"venue_id\":\"${VENUE_ID}\",\"payment_event_id\":\"${PAYMENT_EVENT_ID}\",\"cart_session_id\":\"${CART_ID}\"}" | sed 's/.*/  &/'

echo "==> Final balance"
post_json "/loyalty/get-balance" "{\"customer_id\":\"${CUSTOMER_ID}\",\"venue_id\":\"${VENUE_ID}\"}" | sed 's/.*/  &/'

echo
echo "Done."
echo "Used IDs:"
echo "  CART_ID=${CART_ID}"
echo "  ORDER_ID=${ORDER_ID}"
echo "  PAYMENT_EVENT_ID=${PAYMENT_EVENT_ID}"
