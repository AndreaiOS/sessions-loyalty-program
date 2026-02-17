# Sessions Rewards MVP Runbook

## Cron jobs
- `POST /loyalty/monthly-reward-grant-job` once daily.
- `POST /loyalty/process-pass-update-jobs` every minute (or 5 minutes for MVP).
- Optional fallback polling: run `scripts/poll-paid-orders.js` every minute.

## Suggested schedule
- `monthly-reward-grant-job`: daily at 02:00 UTC.
- `process-pass-update-jobs`: every minute.
- `poll-paid-orders.js`: every minute only when webhook health is degraded.

## Alert conditions
- `pass_update_jobs` with `status=failed` > 20 in 15 minutes.
- Missing `points_earned` events for 10+ minutes during trading hours.
- Stripe webhook non-2xx rate > 1%.

## Manual reconciliation
1. Find paid order in Sessions with no corresponding `points_ledger` `order_id`.
2. Replay `POST /loyalty/earn-points-from-paid-order` with same `payment_event_id`.
3. Verify idempotent ledger insert and updated `customer_venues` balance.
4. If reward applied but payment failed, confirm hold moved to `expired` or `released`.
