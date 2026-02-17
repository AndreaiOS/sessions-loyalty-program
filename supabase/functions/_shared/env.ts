function mustGetEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getEnv(name: string): string | undefined {
  const value = Deno.env.get(name);
  return value && value.length > 0 ? value : undefined;
}

export const env = {
  supabaseUrl: mustGetEnv("SUPABASE_URL"),
  supabaseServiceRoleKey: mustGetEnv("SUPABASE_SERVICE_ROLE_KEY"),
  sessionsJwksUrl: getEnv("SESSIONS_JWKS_URL"),
  sessionsJwtIssuer: getEnv("SESSIONS_JWT_ISSUER"),
  sessionsJwtAudience: getEnv("SESSIONS_JWT_AUDIENCE"),
  kioskSharedSecret: getEnv("KIOSK_SHARED_SECRET"),
  internalApiKey: getEnv("INTERNAL_API_KEY"),
  defaultPhoneCountryCode: getEnv("DEFAULT_PHONE_COUNTRY_CODE") ?? "+44",
  rewardDiscountMinor: Number(getEnv("REWARD_DISCOUNT_MINOR") ?? "100"),
  rewardHoldMinutes: Number(getEnv("REWARD_HOLD_MINUTES") ?? "15"),
  stripeSecretKey: getEnv("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: getEnv("STRIPE_WEBHOOK_SECRET"),
  stripeMembershipPriceId: getEnv("STRIPE_MEMBERSHIP_PRICE_ID"),
  membershipSuccessUrl: getEnv("MEMBERSHIP_SUCCESS_URL"),
  membershipCancelUrl: getEnv("MEMBERSHIP_CANCEL_URL"),
};
