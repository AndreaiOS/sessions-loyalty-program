#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${LOYALTY_BASE_URL:-}" ]]; then
  echo "ERROR: set LOYALTY_BASE_URL, e.g. https://sessions-loyalty-program-x1pp.vercel.app" >&2
  exit 1
fi

if [[ -z "${CUSTOMER_ID:-}" ]]; then
  echo "ERROR: set CUSTOMER_ID" >&2
  exit 1
fi

VENUE_ID="${VENUE_ID:-venue_test}"
RETURN_URL="${RETURN_URL:-${LOYALTY_BASE_URL}/membership/success}"
INTERNAL_API_KEY="${INTERNAL_API_KEY:-}"

BASE="${LOYALTY_BASE_URL%/}"

echo "==> GET /membership link behavior"
STATUS_CODE="$(curl -sS -o /tmp/membership_smoke_body.txt -w "%{http_code}" "${BASE}/membership?customer_id=${CUSTOMER_ID}&venue_id=${VENUE_ID}&return_url=${RETURN_URL}")"
echo "  status=${STATUS_CODE}"
if [[ "$STATUS_CODE" == "302" ]]; then
  echo "  redirect ok (expected when signature guard disabled)"
elif [[ "$STATUS_CODE" == "401" ]]; then
  echo "  signature guard active (expected if MEMBERSHIP_LINK_SIGNING_SECRET enabled)"
else
  echo "  response body:"
  sed 's/.*/    &/' /tmp/membership_smoke_body.txt
fi

echo "==> POST /loyalty/membership-checkout-create-session"
if [[ -z "$INTERNAL_API_KEY" ]]; then
  echo "  skipped: set INTERNAL_API_KEY to test this endpoint"
  exit 0
fi

PAYLOAD="{\"customer_id\":\"${CUSTOMER_ID}\",\"venue_id\":\"${VENUE_ID}\",\"return_url\":\"${RETURN_URL}\"}"
RESPONSE="$(curl -sS -X POST "${BASE}/loyalty/membership-checkout-create-session" \
  -H "content-type: application/json" \
  -H "x-internal-api-key: ${INTERNAL_API_KEY}" \
  -d "$PAYLOAD")"

echo "$RESPONSE" | sed 's/.*/  &/'

if echo "$RESPONSE" | grep -q 'checkout_url'; then
  echo "  checkout session created"
else
  echo "  no checkout_url returned; verify Stripe env vars in Supabase + Vercel"
fi
