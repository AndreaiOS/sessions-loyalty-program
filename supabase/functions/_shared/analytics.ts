import { createServiceClient } from "./db.ts";

export async function trackEvent(eventName: string, venueId: string, payload: Record<string, unknown>) {
  const supabase = createServiceClient();
  await supabase.from("analytics_events").insert({
    event_name: eventName,
    venue_id: venueId,
    customer_id: (payload.customer_id as string | undefined) ?? null,
    order_id: (payload.order_id as string | undefined) ?? null,
    payload,
  });
}

export async function enqueuePassUpdate(customerId: string, venueId: string, reason: string, payload: Record<string, unknown>) {
  const supabase = createServiceClient();
  await supabase.from("pass_update_jobs").insert({
    customer_id: customerId,
    venue_id: venueId,
    reason,
    payload,
    status: "queued",
  });
}
