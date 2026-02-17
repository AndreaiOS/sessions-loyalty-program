#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${LOYALTY_BASE_URL:-}" ]]; then
  echo "ERROR: set LOYALTY_BASE_URL, e.g. https://your-domain.vercel.app" >&2
  exit 1
fi

if [[ -z "${KIOSK_SHARED_SECRET:-}" ]]; then
  echo "ERROR: set KIOSK_SHARED_SECRET" >&2
  exit 1
fi

VENUE_ID="${VENUE_ID:-venue_test}"
DEVICE_ID="${DEVICE_ID:-kiosk_01}"
PHONE_RAW="${PHONE_RAW:-+447700900000}"

echo "==> Health check"
curl -sS "$LOYALTY_BASE_URL/" | sed 's/.*/  &/'

echo "==> upsert-customer-by-phone"
UPSERT_RESPONSE="$(curl -sS -X POST "$LOYALTY_BASE_URL/loyalty/upsert-customer-by-phone" \
  -H "content-type: application/json" \
  -H "x-kiosk-secret: $KIOSK_SHARED_SECRET" \
  -d "{\"phone_raw\":\"$PHONE_RAW\",\"venue_id\":\"$VENUE_ID\",\"device_id\":\"$DEVICE_ID\"}")"

echo "$UPSERT_RESPONSE" | sed 's/.*/  &/'

CUSTOMER_ID="$(echo "$UPSERT_RESPONSE" | sed -n 's/.*"customer_id":"\([^"]*\)".*/\1/p')"
if [[ -z "$CUSTOMER_ID" ]]; then
  echo "ERROR: could not parse customer_id from upsert response" >&2
  exit 1
fi

echo "==> get-balance"
curl -sS -X POST "$LOYALTY_BASE_URL/loyalty/get-balance" \
  -H "content-type: application/json" \
  -H "x-kiosk-secret: $KIOSK_SHARED_SECRET" \
  -d "{\"customer_id\":\"$CUSTOMER_ID\",\"venue_id\":\"$VENUE_ID\"}" | sed 's/.*/  &/'

echo ""
echo "Smoke test complete."
