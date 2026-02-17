const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

export function currencyExponent(currency = "GBP") {
  return ZERO_DECIMAL_CURRENCIES.has(String(currency).toUpperCase()) ? 0 : 2;
}

export function calculateBasePoints(totalMinor, currency = "GBP") {
  if (!Number.isFinite(totalMinor) || totalMinor <= 0) {
    return 0;
  }

  const divisor = 10 ** currencyExponent(currency);
  return Math.floor(totalMinor / divisor);
}

export function calculateEarnedPoints(totalMinor, currency = "GBP", membershipMultiplier = 1) {
  const base = calculateBasePoints(totalMinor, currency);
  return base * Math.max(1, membershipMultiplier);
}

export function convertPointsToRewards(pointsBalance, threshold = 100) {
  const safePoints = Math.max(0, Math.floor(pointsBalance));
  const safeThreshold = Math.max(1, Math.floor(threshold));

  const rewardsConverted = Math.floor(safePoints / safeThreshold);
  const remainingPoints = safePoints % safeThreshold;

  return { rewardsConverted, remainingPoints };
}

export function earnIdempotencyKey(orderId, paymentEventId) {
  return `earn:${orderId}:${paymentEventId}`;
}

export function redeemIdempotencyKey(orderId, paymentEventId) {
  return `redeem:${orderId}:${paymentEventId}`;
}

export function monthlyGrantIdempotencyKey(subscriptionId, periodStartDate) {
  const date = new Date(periodStartDate).toISOString().slice(0, 10);
  return `grant:${subscriptionId}:${date}`;
}
