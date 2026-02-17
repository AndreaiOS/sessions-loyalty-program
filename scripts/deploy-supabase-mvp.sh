#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_FILE="$ROOT_DIR/supabase/migrations/202602170001_sessions_rewards_mvp.sql"
FUNCTIONS_DIR="$ROOT_DIR/supabase/functions"

FUNCTIONS=(
  resolve-customer-from-pass-token
  upsert-customer-by-phone
  attach-customer-to-cart-session
  get-balance
  apply-reward-to-cart
  earn-points-from-paid-order
  redeem-reward-after-payment
  membership-checkout-create-session
  stripe-webhook-handler
  monthly-reward-grant-job
  process-pass-update-jobs
)

required_cmds=(supabase)
for cmd in "${required_cmds[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: missing required command '$cmd'" >&2
    exit 1
  fi
done

required_envs=(
  SUPABASE_PROJECT_REF
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  INTERNAL_API_KEY
  KIOSK_SHARED_SECRET
)

for env_name in "${required_envs[@]}"; do
  if [[ -z "${!env_name:-}" ]]; then
    echo "ERROR: missing required env var '$env_name'" >&2
    exit 1
  fi
done

DEFAULT_PHONE_COUNTRY_CODE="${DEFAULT_PHONE_COUNTRY_CODE:-+44}"
REWARD_DISCOUNT_MINOR="${REWARD_DISCOUNT_MINOR:-100}"
REWARD_HOLD_MINUTES="${REWARD_HOLD_MINUTES:-15}"
SKIP_DB_PUSH="${SKIP_DB_PUSH:-0}"

echo "==> Linking Supabase project: $SUPABASE_PROJECT_REF"
supabase link --project-ref "$SUPABASE_PROJECT_REF"

if [[ "$SKIP_DB_PUSH" == "1" ]]; then
  echo "==> Skipping schema migration (SKIP_DB_PUSH=1)"
  echo "    Apply manually in Supabase SQL Editor if not already applied:"
  echo "    $MIGRATION_FILE"
else
  echo "==> Applying schema migration"
  # Uses linked project DB credentials from Supabase CLI context.
  supabase db push
fi

echo "==> Setting Edge Function secrets"
# Optional secrets are set only when present.
secret_args=(
  "SUPABASE_URL=$SUPABASE_URL"
  "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY"
  "INTERNAL_API_KEY=$INTERNAL_API_KEY"
  "KIOSK_SHARED_SECRET=$KIOSK_SHARED_SECRET"
  "DEFAULT_PHONE_COUNTRY_CODE=$DEFAULT_PHONE_COUNTRY_CODE"
  "REWARD_DISCOUNT_MINOR=$REWARD_DISCOUNT_MINOR"
  "REWARD_HOLD_MINUTES=$REWARD_HOLD_MINUTES"
)

optional_secret_names=(
  SESSIONS_JWKS_URL
  SESSIONS_JWT_ISSUER
  SESSIONS_JWT_AUDIENCE
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_MEMBERSHIP_PRICE_ID
  MEMBERSHIP_SUCCESS_URL
  MEMBERSHIP_CANCEL_URL
  APPLE_WALLET_ADD_URL_TEMPLATE
  GOOGLE_WALLET_ADD_URL_TEMPLATE
  ADMIN_API_KEY
)

for name in "${optional_secret_names[@]}"; do
  if [[ -n "${!name:-}" ]]; then
    secret_args+=("$name=${!name}")
  fi
done

supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" "${secret_args[@]}"

echo "==> Deploying Edge Functions"
for fn in "${FUNCTIONS[@]}"; do
  echo "  -> $fn"
  supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF"
done

echo ""
echo "Done. Supabase MVP deployed."
echo "Next: set Vercel env vars and redeploy Vercel project."
