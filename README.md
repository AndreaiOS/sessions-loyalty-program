# Sessions Rewards MVP (Kiosk + EPOS + Supabase + Vercel)

Implementation scaffold for the Sessions Rewards plan:
- Supabase Postgres schema + RLS + transactional RPC functions
- Supabase Edge Functions for loyalty and membership logic
- Vercel endpoints for kiosk-facing `/loyalty/*`, `/wallet/{token}`, and `/admin`
- Test suite for points rules and order payload contract

## Repository Structure
- `supabase/migrations/202602170001_sessions_rewards_mvp.sql`: schema, indexes, RLS, SQL RPCs
- `supabase/functions/*`: edge functions
- `api/*`: Vercel endpoints and proxy routes
- `src/lib/points.js`: points/membership calculation helpers
- `test/*`: unit and contract tests
- `docs/api-contracts.md`: request/response contracts for kiosk/webhook integration

## Implemented Endpoints
### Loyalty endpoints
- `POST /loyalty/resolve-customer-from-pass-token`
- `POST /loyalty/upsert-customer-by-phone`
- `POST /loyalty/attach-customer-to-cart-session`
- `POST /loyalty/get-balance`
- `POST /loyalty/apply-reward-to-cart`
- `POST /loyalty/earn-points-from-paid-order`
- `POST /loyalty/redeem-reward-after-payment`
- `POST /loyalty/membership-checkout-create-session`
- `POST /loyalty/stripe-webhook`
- `POST /loyalty/monthly-reward-grant-job`
- `POST /loyalty/process-pass-update-jobs`

### Public web endpoints
- `GET /wallet/{token}`
- `GET /admin?venue_id=...`
- `GET /membership?customer_id=...&venue_id=...` (redirects to Stripe hosted checkout)
  - Optional signed link guard via `MEMBERSHIP_LINK_SIGNING_SECRET` (`ts` + `sig` query params)
- `GET /` Loyalty Card Studio (issue card, generate QR, send email, edit branding)
- `POST /api/issue-card`
- `POST /api/send-wallet-link` (optional, Resend)
- `GET /api/card-branding?venue_id=...`
- `POST /api/card-branding` (`x-admin-key` or `admin_key` required)

## Quick Start
1. Copy `.env.example` to `.env` and set secrets.
2. Apply Supabase migration:
   - `supabase db push`
3. Deploy edge functions:
   - `supabase functions deploy resolve-customer-from-pass-token`
   - `supabase functions deploy upsert-customer-by-phone`
   - `supabase functions deploy attach-customer-to-cart-session`
   - `supabase functions deploy get-balance`
   - `supabase functions deploy apply-reward-to-cart`
   - `supabase functions deploy earn-points-from-paid-order`
   - `supabase functions deploy redeem-reward-after-payment`
   - `supabase functions deploy membership-checkout-create-session`
   - `supabase functions deploy stripe-webhook-handler`
   - `supabase functions deploy monthly-reward-grant-job`
   - `supabase functions deploy process-pass-update-jobs`
4. Deploy Vercel app from repo root.
5. Configure Stripe webhook target:
   - `https://<your-vercel-domain>/loyalty/stripe-webhook`

If you apply SQL manually in Supabase SQL Editor, run both:
- `supabase/migrations/202602170004_consolidate_runtime_fixes.sql`
- `supabase/migrations/202602170005_wallet_branding_table.sql`

## Auth Expectations
- Kiosk endpoints: JWT via Sessions JWKS or `x-kiosk-secret` fallback.
- Internal webhook/cron endpoints: `x-internal-api-key`.
- Admin page: `x-admin-key`.

## MVP Behavior Notes
- Points: `floor(total_minor / currency_unit)` and membership `2x` multiplier.
- Conversion: every 100 points auto-converts to 1 reward.
- Redemption: reward hold on apply; consume only after payment confirmation.
- Global membership monthly rewards are stored in a shared `global` balance and surfaced at venue checkout.
- Idempotency: key-based dedupe in SQL ledger writes and redemption flows.
- Wallet: `/wallet/{token}` page plus provider redirect templates.

## Tests
Run all:
```bash
npm test
```
Run specific suites:
```bash
npm run test:unit
npm run test:contract
```

## Utility Scripts
- `scripts/poll-paid-orders.js`: fallback paid-order polling worker.
- `scripts/generate-membership-link.js`: creates signed `/membership` links.
- `scripts/deploy-supabase-mvp.sh`: one-shot Supabase deploy (schema + secrets + all functions).
- `scripts/smoke-test.sh`: quick end-to-end HTTP smoke test.
- `scripts/idempotency-test.sh`: earn/redeem idempotency test (duplicate payment event replay).
- `scripts/membership-smoke.sh`: membership checkout/link smoke test.

### Fastest Deploy (CLI)
```bash
export SUPABASE_PROJECT_REF="your-project-ref"
export SUPABASE_URL="https://${SUPABASE_PROJECT_REF}.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export INTERNAL_API_KEY="change-me-internal"
export KIOSK_SHARED_SECRET="change-me-kiosk"
export ADMIN_API_KEY="change-me-admin"
./scripts/deploy-supabase-mvp.sh
```

If Docker is not running and `supabase db push` fails, apply the migration in Supabase SQL Editor first, then run:
```bash
SKIP_DB_PUSH=1 ./scripts/deploy-supabase-mvp.sh
```

### Runtime Hotfix Consolidation
If you applied SQL hotfixes manually, apply this consolidation migration in Supabase SQL Editor:
- `supabase/migrations/202602170004_consolidate_runtime_fixes.sql`

### Idempotency Test
```bash
export LOYALTY_BASE_URL="https://sessions-loyalty-program-x1pp.vercel.app"
export KIOSK_SHARED_SECRET="change-me-kiosk"
export CUSTOMER_ID="c4eaaa39-622a-428c-87f1-0534a42ad1ff"
./scripts/idempotency-test.sh
```

### Membership Test (Stripe Test Mode)
Set required env vars in Supabase + Vercel:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_MEMBERSHIP_PRICE_ID`
- `MEMBERSHIP_SUCCESS_URL`
- `MEMBERSHIP_CANCEL_URL`

Supabase note:
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are reserved runtime secrets for Edge Functions and cannot be set manually in Supabase Secrets.
- Keep them configured in Vercel env vars.

Smoke test:
```bash
export LOYALTY_BASE_URL="https://sessions-loyalty-program-x1pp.vercel.app"
export CUSTOMER_ID="c4eaaa39-622a-428c-87f1-0534a42ad1ff"
export INTERNAL_API_KEY="change-me-internal"
./scripts/membership-smoke.sh
```

Webhook test with Stripe CLI (optional):
```bash
stripe listen --forward-to https://sessions-loyalty-program-x1pp.vercel.app/loyalty/stripe-webhook
stripe trigger checkout.session.completed
stripe trigger invoice.paid
```

### Card Studio Email (Optional)
Set in Vercel env:
- `RESEND_API_KEY`
- `EMAIL_FROM` (example `Sessions <noreply@yourdomain.com>`)
- `WALLET_EMAIL_SUBJECT` (optional)
