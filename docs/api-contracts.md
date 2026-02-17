# Sessions Rewards API Contracts (MVP)

## Kiosk-facing endpoints (Vercel)
All endpoints are POST unless noted.

### POST /loyalty/resolve-customer-from-pass-token
Request:
```json
{
  "pass_token": "hex-token",
  "venue_id": "venue_001",
  "device_id": "kiosk_01"
}
```
Response:
```json
{
  "customer_id": "uuid",
  "points_balance": 12,
  "rewards_balance": 1,
  "membership_status": "active"
}
```

### POST /loyalty/upsert-customer-by-phone
Request:
```json
{
  "phone_raw": "+447700900000",
  "venue_id": "venue_001",
  "device_id": "kiosk_01"
}
```
Response:
```json
{
  "customer_id": "uuid",
  "is_new_customer": true,
  "points_balance": 0,
  "rewards_balance": 0,
  "membership_status": "none",
  "wallet_token": "hex-token"
}
```

### POST /loyalty/get-balance
Request:
```json
{
  "customer_id": "uuid",
  "venue_id": "venue_001"
}
```

### POST /loyalty/apply-reward-to-cart
Request:
```json
{
  "cart_session_id": "cart_123",
  "customer_id": "uuid",
  "venue_id": "venue_001",
  "reward_count": 1
}
```
Response:
```json
{
  "approved": true,
  "hold_id": "uuid",
  "expires_at": "2026-02-17T10:00:00.000Z",
  "discount_minor": 100,
  "rewards_balance": 2
}
```

### POST /loyalty/attach-customer-to-cart-session
Request:
```json
{
  "cart_session_id": "cart_123",
  "customer_id": "uuid",
  "venue_id": "venue_001"
}
```

## Event/webhook endpoints

### POST /loyalty/earn-points-from-paid-order
Request:
```json
{
  "order_id": "ord_123",
  "venue_id": "venue_001",
  "payment_event_id": "evt_paid_123",
  "total_minor": 2599,
  "currency": "GBP",
  "paid_at": "2026-02-17T09:30:00.000Z",
  "customer_id": "uuid",
  "cart_session_id": "cart_123"
}
```

### POST /loyalty/redeem-reward-after-payment
Request:
```json
{
  "order_id": "ord_123",
  "venue_id": "venue_001",
  "payment_event_id": "evt_paid_123",
  "cart_session_id": "cart_123"
}
```

### POST /loyalty/stripe-webhook
- Accepts raw Stripe webhook body.
- Requires `stripe-signature` header.

### POST /loyalty/membership-checkout-create-session
Request:
```json
{
  "customer_id": "uuid",
  "venue_id": "venue_001",
  "return_url": "https://sessions.market/membership/success"
}
```
Response:
```json
{
  "checkout_url": "https://checkout.stripe.com/..."
}
```

### POST /loyalty/monthly-reward-grant-job
- Intended for cron.
- Requires `x-internal-api-key`.

### POST /loyalty/process-pass-update-jobs
- Intended for cron/worker.
- Requires `x-internal-api-key`.

## Public endpoints
- `GET /wallet/{token}` wallet landing page
- `GET /admin?venue_id=...` (requires `x-admin-key`)
- `GET /membership?customer_id=...&venue_id=...` redirects to Stripe checkout
  - If `MEMBERSHIP_LINK_SIGNING_SECRET` is set, include `ts=<unix_ms>` and `sig=<hmac_sha256_hex(customer_id:venue_id:ts)>`.
